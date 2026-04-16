import json
import logging
import httpx
from django.utils import timezone as dj_timezone
from celery import shared_task

from execution_engine.models import WorkflowRun, WorkflowNodeRun
from vault.models import Vault, Server, Credential
from scripts.models import Script

from execution_engine.helpers.graph import (
    build_dag,
    topological_order,
    get_node_data,
    get_outgoing_branches,
    get_branch_subgraph,
    NODE_TYPE_ACTION,
    NODE_TYPE_DECISION,
    NODE_TYPE_TRIGGER,
    EDGE_HANDLE_TRUE,
    EDGE_HANDLE_FALSE
)
from execution_engine.helpers.params import (
    resolve_parameters,
    resolve_condition_value
)
from execution_engine.helpers.gcs import upload_execution_logs
from execution_engine.helpers.script_execution.worker import build_worker_headers, EXEC_WORKER_URL

logger = logging.getLogger(__name__)

def _evaluate_condition(field_val, operator, target_val):
    """Evaluate a decision node condition."""
    def try_float(v):
        try: return float(v)
        except (ValueError, TypeError): return v

    fv = try_float(field_val)
    tv = try_float(target_val)
    
    if operator == "==": return fv == tv
    if operator == "!=": return fv != tv
    
    if isinstance(fv, float) and isinstance(tv, float):
        if operator == ">": return fv > tv
        if operator == ">=": return fv >= tv
        if operator == "<": return fv < tv
        if operator == "<=": return fv <= tv
        
    fv_str = str(field_val).lower()
    tv_str = str(target_val).lower()
    
    if operator == "contains": return tv_str in fv_str
    if operator == "not_contains": return tv_str not in fv_str
    if operator == "startswith": return fv_str.startswith(tv_str)
    if operator == "endswith": return fv_str.endswith(tv_str)
    
    return False

@shared_task(bind=True, name='workflows.execute_workflow')
def execute_workflow(self, workflow_run_id: str):
    logger.info(f"Starting workflow run {workflow_run_id}")
    try:
        run = WorkflowRun.objects.select_related('workflow', 'user').get(id=workflow_run_id)
    except WorkflowRun.DoesNotExist:
        logger.error(f"WorkflowRun {workflow_run_id} not found.")
        return

    if run.status != 'queued':
        logger.warning(f"WorkflowRun {workflow_run_id} is not queued. Status: {run.status}")
        return

    run.status = 'running'
    run.started_at = dj_timezone.now()
    run.save(update_fields=['status', 'started_at'])

    try:
        G = build_dag(run.workflow.nodes, run.workflow.edges)
        topo_order = topological_order(G)
    except Exception as e:
        run.status = 'failed'
        run.error_message = f"DAG Error: {str(e)}"
        run.finished_at = dj_timezone.now()
        run.save(update_fields=['status', 'error_message', 'finished_at'])
        return

    node_outputs = {}
    fail_fast = True # Stop execution if a node fails

    for node_id in topo_order:
        try:
            node_run = WorkflowNodeRun.objects.get(workflow_run=run, node_id=node_id)
        except WorkflowNodeRun.DoesNotExist:
            continue

        if node_run.status == 'skipped':
            continue

        node_run.status = 'running'
        node_run.started_at = dj_timezone.now()
        node_run.save(update_fields=['status', 'started_at'])

        node_data = get_node_data(G, node_id)
        node_type = node_data.get('type')
        data = node_data.get('data', {})

        if node_type == NODE_TYPE_TRIGGER:
            node_run.status = 'success'
            node_run.finished_at = dj_timezone.now()
            node_run.save(update_fields=['status', 'finished_at'])
            node_outputs[node_id] = {}
            continue

        elif node_type == NODE_TYPE_DECISION:
            conditions = data.get('conditions', [])
            decision_result = True
            
            for cond in conditions:
                raw_field = cond.get('field', '')
                operator = cond.get('operator', '==')
                raw_target = cond.get('value', '')
                
                field_val = resolve_condition_value(raw_field, node_outputs)
                target_val = resolve_condition_value(raw_target, node_outputs)
                
                if not _evaluate_condition(field_val, operator, target_val):
                    decision_result = False
                    break
            
            outgoing = get_outgoing_branches(G, node_id)
            taken_handle = EDGE_HANDLE_TRUE if decision_result else EDGE_HANDLE_FALSE
            skipped_handle = EDGE_HANDLE_FALSE if decision_result else EDGE_HANDLE_TRUE
            
            skipped_target = outgoing.get(skipped_handle)
            if skipped_target:
                subgraph = get_branch_subgraph(G, skipped_target)
                WorkflowNodeRun.objects.filter(
                    workflow_run=run, 
                    node_id__in=subgraph, 
                    status='pending'
                ).update(status='skipped')
            
            node_run.status = 'success'
            node_run.finished_at = dj_timezone.now()
            node_run.save(update_fields=['status', 'finished_at'])
            node_outputs[node_id] = {"result": decision_result}
            continue

        elif node_type == NODE_TYPE_ACTION:
            try:
                params = data.get('parameters', [])
                resolved_params = resolve_parameters(params, node_outputs)
            except Exception as e:
                node_run.status = 'failed'
                node_run.error_message = f"Parameter resolution error: {str(e)}"
                node_run.finished_at = dj_timezone.now()
                node_run.save(update_fields=['status', 'error_message', 'finished_at'])
                
                if fail_fast:
                    run.status = 'failed'
                    run.error_message = f"Node {node_id} failed: {node_run.error_message}"
                    break
                continue
            
            if not EXEC_WORKER_URL:
                node_run.status = 'failed'
                node_run.error_message = "EXEC_WORKER_URL is not configured."
                node_run.finished_at = dj_timezone.now()
                node_run.save(update_fields=['status', 'error_message', 'finished_at'])
                if fail_fast:
                    run.status = 'failed'
                    run.error_message = "Execution worker URL not configured."
                    break
                continue

            try:
                script = Script.objects.get(id=node_run.script_id)
                server = Server.objects.get(id=node_run.server_id)
                credential = Credential.objects.get(id=node_run.credential_id)
            except Exception as e:
                node_run.status = 'failed'
                node_run.error_message = f"Missing binding configuration: {str(e)}"
                node_run.finished_at = dj_timezone.now()
                node_run.save(update_fields=['status', 'error_message', 'finished_at'])
                if fail_fast:
                    run.status = 'failed'
                    run.error_message = f"Node {node_id} binding error."
                    break
                continue

            server_host = server.host.strip()
            if server_host.startswith(('http://', 'https://')):
                server_host = server_host.split('://', 1)[1]

            worker_payload = {
                "execution_id": str(node_run.id),
                "script": {
                    "id": str(script.id),
                    "name": script.name,
                    "pathname": script.pathname,
                    "blob_url": script.blob_url,
                },
                "server": {
                    "id": str(server.id),
                    "host": server_host,
                    "port": server.port or 22,
                    "connection_method": server.connection_method,
                    "os_type": "windows" if server.connection_method == "winrm" else "linux",
                    "winrm_port": server.port or 5985,
                    "winrm_use_ssl": False,
                    "winrm_transport": "ntlm",
                },
                "credentials": {
                    "username": credential.username or "",
                    "password": credential.password or "",
                    "ssh_key": credential.ssh_key or "",
                    "key_passphrase": credential.key_passphrase or "",
                },
                "inputs": resolved_params,
            }

            headers = build_worker_headers()
            
            stdout_text = ""
            stderr_text = ""
            logs_list = []
            final_exit_code = None

            try:
                with httpx.Client(timeout=None) as client:
                    with client.stream("POST", EXEC_WORKER_URL, json=worker_payload, headers=headers) as response:
                        if response.status_code != 200:
                            node_run.error_message = f"Worker responded with {response.status_code}"
                            node_run.status = 'failed'
                        else:
                            for line in response.iter_lines():
                                if not line.strip():
                                    continue
                                try:
                                    chunk = json.loads(line)
                                except json.JSONDecodeError:
                                    chunk = {"type": "stdout", "data": line}
                                
                                ctype = chunk.get('type')
                                cdata = chunk.get('data', '')
                                ts = dj_timezone.now().isoformat()
                                
                                if ctype == 'exit_code':
                                    try: final_exit_code = int(cdata)
                                    except: final_exit_code = -1
                                elif ctype == 'stdout':
                                    stdout_text += str(cdata) + "\n"
                                    logs_list.append({"type": "stdout", "data": cdata, "ts": ts})
                                elif ctype in ('stderr', 'error'):
                                    stderr_text += str(cdata) + "\n"
                                    logs_list.append({"type": "stderr", "data": cdata, "ts": ts})
                                elif ctype == 'log':
                                    logs_list.append({"type": "log", "data": cdata, "ts": ts})
            except Exception as e:
                node_run.status = 'failed'
                node_run.error_message = f"Worker communication error: {str(e)}"
                stderr_text += f"{node_run.error_message}\n"
            
            if node_run.status != 'failed':
                node_run.status = 'success' if (final_exit_code is None or final_exit_code == 0) else 'failed'
            
            try:
                gcs_urls = upload_execution_logs(
                    user_id=run.user_id,
                    execution_id=str(node_run.id),
                    stdout=stdout_text,
                    stderr=stderr_text,
                    logs=logs_list
                )
                node_run.stdout_log_url = gcs_urls.get('stdout_log_url', '')
                node_run.stderr_log_url = gcs_urls.get('stderr_log_url', '')
                node_run.logs_url = gcs_urls.get('logs_url', '')
            except Exception as e:
                logger.error(f"Failed to upload GCS logs for NodeRun {node_run.id}: {str(e)}")

            node_run.exit_code = final_exit_code
            node_run.finished_at = dj_timezone.now()
            node_run.save()

            if node_run.status == 'success':
                parsed_out = {}
                try:
                    parsed_out = json.loads(stdout_text)
                    if not isinstance(parsed_out, dict):
                        parsed_out = {"result": parsed_out}
                except json.JSONDecodeError:
                    lines = [ln.strip() for ln in stdout_text.split('\n') if ln.strip()]
                    if lines:
                        try:
                            parsed_out = json.loads(lines[-1])
                            if not isinstance(parsed_out, dict):
                                parsed_out = {"result": parsed_out}
                        except json.JSONDecodeError:
                            parsed_out = {"raw": stdout_text}
                
                node_outputs[node_id] = parsed_out
            else:
                if fail_fast:
                    run.status = 'failed'
                    run.error_message = f"Node {node_id} execution failed: {node_run.error_message}"
                    break

    if run.status == 'running':
        run.status = 'success'
    
    run.finished_at = dj_timezone.now()
    run.save(update_fields=['status', 'error_message', 'finished_at'])
    logger.info(f"Workflow run {workflow_run_id} finished with status {run.status}")
