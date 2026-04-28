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
from execution_engine.helpers.gcs import upload_execution_logs, upload_workflow_node_logs
from execution_engine.helpers.script_execution.worker import build_worker_headers, EXEC_WORKER_URL, EXEC_WORKER_URL_EMAIL
from execution_engine.helpers.redis_pubsub import publish_workflow_log

logger = logging.getLogger(__name__)

def _evaluate_condition(field_val, operator, target_val):
    """Evaluate a decision node condition with robust boolean and numeric handling."""
    
    # 1. Normalize to lowercased strings to detect booleans regardless of casing
    fv_str = str(field_val).strip().lower()
    tv_str = str(target_val).strip().lower()
    
    bool_map = {
        "true": True, "1": True, "yes": True, "on": True,
        "false": False, "0": False, "no": False, "off": False
    }
    
    # If both sides are boolean-like, compare as actual Python booleans
    if fv_str in bool_map and tv_str in bool_map:
        fv_bool = bool_map[fv_str]
        tv_bool = bool_map[tv_str]
        if operator == "==": return fv_bool == tv_bool
        if operator == "!=": return fv_bool != tv_bool
        return False # Inequalities not supported for booleans

    # 2. Fall back to numeric or string comparisons
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
        
    if operator == "contains": return tv_str in fv_str
    if operator == "not_contains": return tv_str not in fv_str
    if operator == "startswith": return fv_str.startswith(tv_str)
    if operator == "endswith": return fv_str.endswith(tv_str)
    
    return False

def _resolve_email_recipients(values, node_outputs):
    """Resolve {{node.output.X}} refs inside a list of email addresses and drop blanks."""
    from execution_engine.helpers.params import resolve_template_string
    resolved: list[str] = []
    for raw in (values or []):
        if not raw:
            continue
        try:
            val = resolve_template_string(str(raw), node_outputs)
        except Exception:
            val = str(raw)
        val = val.strip()
        if val:
            resolved.append(val)
    return resolved


# Pattern for a clean single-reference: ``{{node-id.output.FIELD}}`` (whole string).
import re as _re_email
_EMAIL_OUTPUT_REF_RE = _re_email.compile(r"^\{\{([\w-]+)\.output\.([\w]+)\}\}$")


def _format_full_output(output) -> str:
    """
    Stringify the full output of an upstream node for the ``input_as_text`` field.

    Scripts whose stdout is non-JSON are stored as ``{"raw": "<stdout>"}`` —
    in that case return the raw text directly. Otherwise, pretty-print the
    full output dict as JSON so the user sees the same shape they configured.
    """
    if output is None:
        return ""
    if isinstance(output, dict) and set(output.keys()) == {"raw"}:
        return str(output.get("raw", ""))
    try:
        return json.dumps(output, indent=2, ensure_ascii=False, default=str)
    except Exception:
        return str(output)


def _build_email_attached_outputs(parameters, node_outputs):
    """
    Resolve the email node's ``parameters`` list into a flat list of
    ``{"name", "value"}`` pairs to render in a code block under the body.

    Conventions:
      * ``sourceType == "manual"`` → use the literal value as-is.
      * ``sourceType == "output"`` with value ``{{nid.output.<field>}}``
          - ``<field> == "input_as_text"`` → full upstream output as text.
          - any other field → the scalar value at ``node_outputs[nid][field]``.
      * Composite or unparseable references fall back to template substitution.

    Missing references are rendered as a placeholder string rather than raising,
    so the email still goes out and the user can see what was unresolved.
    """
    from execution_engine.helpers.params import resolve_template_string

    items: list[dict] = []
    for p in (parameters or []):
        name = (p.get("name") or "").strip()
        if not name:
            continue
        source_type = (p.get("sourceType") or "manual").lower()
        raw = p.get("value", "")
        raw_str = "" if raw is None else str(raw)

        if source_type == "output":
            match = _EMAIL_OUTPUT_REF_RE.match(raw_str.strip())
            if match:
                node_id_ref = match.group(1)
                field = match.group(2)
                output = node_outputs.get(node_id_ref)
                if output is None:
                    value_str = f"<no output yet for '{node_id_ref}'>"
                elif field == "input_as_text":
                    value_str = _format_full_output(output)
                elif isinstance(output, dict) and field in output:
                    raw_field = output[field]
                    if isinstance(raw_field, (dict, list)):
                        try:
                            value_str = json.dumps(raw_field, indent=2,
                                                    ensure_ascii=False, default=str)
                        except Exception:
                            value_str = str(raw_field)
                    else:
                        value_str = "" if raw_field is None else str(raw_field)
                else:
                    value_str = f"<field '{field}' not found in output of '{node_id_ref}'>"
            else:
                # Composite / non-clean reference — best-effort substitute.
                try:
                    value_str = resolve_template_string(raw_str, node_outputs)
                except Exception:
                    value_str = raw_str
        else:
            value_str = raw_str

        items.append({"name": name, "value": value_str})
    return items


def _execute_email_node(run, node_run, node_id, data, node_outputs,
                        workflow_run_id, fail_fast):
    """
    Execute an email action node by calling the exec-worker's email endpoint.

    Resolves the credential by ID at runtime (never stored in workflow JSON),
    streams NDJSON chunks back from the worker, and publishes them to the
    Redis pub/sub channel just like the script branch does.
    """
    from execution_engine.helpers.params import resolve_template_string

    if not EXEC_WORKER_URL_EMAIL:
        node_run.status = 'failed'
        node_run.error_message = "EXEC_WORKER_URL_EMAIL is not configured."
        node_run.finished_at = dj_timezone.now()
        node_run.save(update_fields=['status', 'error_message', 'finished_at'])
        publish_workflow_log(workflow_run_id, 'node_complete', {
            'node_id': node_id,
            'node_label': node_run.node_label,
            'node_type': 'action',
            'action_type': 'email',
            'status': 'failed',
            'duration': (node_run.finished_at - node_run.started_at).total_seconds(),
        })
        if fail_fast:
            run.status = 'failed'
            run.error_message = "Email worker URL not configured."
        return

    # ── Resolve credential (encrypted at rest, decrypted on access) ────────
    try:
        credential = Credential.objects.get(
            id=node_run.credential_id,
            vault__owner=run.user,
            credential_type="username_password",
        )
    except Credential.DoesNotExist:
        node_run.status = 'failed'
        node_run.error_message = "SMTP credential not found or access denied."
        node_run.finished_at = dj_timezone.now()
        node_run.save(update_fields=['status', 'error_message', 'finished_at'])
        publish_workflow_log(workflow_run_id, 'node_complete', {
            'node_id': node_id,
            'node_label': node_run.node_label,
            'node_type': 'action',
            'action_type': 'email',
            'status': 'failed',
            'duration': (node_run.finished_at - node_run.started_at).total_seconds(),
        })
        if fail_fast:
            run.status = 'failed'
            run.error_message = f"Node {node_id} email credential missing."
        return

    smtp_cfg = data.get('smtpConfig') or {}
    smtp_password = credential.password or ""

    # ── Resolve template refs in user-facing fields ────────────────────────
    try:
        subject = resolve_template_string(str(data.get('subject') or ''), node_outputs)
    except Exception:
        subject = str(data.get('subject') or '')

    try:
        body = resolve_template_string(str(data.get('body') or ''), node_outputs)
    except Exception:
        body = str(data.get('body') or '')

    to_list = _resolve_email_recipients(data.get('to'), node_outputs)
    cc_list = _resolve_email_recipients(data.get('cc'), node_outputs)
    bcc_list = _resolve_email_recipients(data.get('bcc'), node_outputs)

    sender_raw = (data.get('from') or '').strip()
    sender = sender_raw if sender_raw else (credential.username or '')

    # Resolve email node parameters (if any) into {name, value} pairs that the
    # worker will render in a code block under the body. Password-typed
    # parameters are NOT included, to avoid leaking secrets into the email.
    email_params = [
        p for p in (data.get('parameters') or [])
        if (p.get('type') or 'string').lower() != 'password'
    ]
    attached_outputs = _build_email_attached_outputs(email_params, node_outputs)

    worker_payload = {
        "execution_id": str(node_run.id),
        "smtp": {
            "host": str(smtp_cfg.get('host') or '').strip(),
            "port": int(smtp_cfg.get('port') or 587),
            "secure": bool(smtp_cfg.get('secure') or False),
            "username": credential.username or '',
            "password": smtp_password,
        },
        "sender": sender,
        "to": to_list,
        "cc": cc_list,
        "bcc": bcc_list,
        "subject": subject,
        "body": body,
        "workflow_run_id": str(run.id),
        "node_label": node_run.node_label or node_id,
        "attached_outputs": attached_outputs,
    }

    headers = build_worker_headers()

    stdout_text = ""
    stderr_text = ""
    logs_list: list[dict] = []
    final_exit_code = None

    def _mask(text: str) -> str:
        if not text or not isinstance(text, str) or not smtp_password:
            return text
        return text.replace(smtp_password, "*****")

    logger.info(f"Calling exec-worker (email) for node {node_id} (Run: {workflow_run_id})")
    try:
        with httpx.Client(timeout=None) as client:
            with client.stream("POST", EXEC_WORKER_URL_EMAIL, json=worker_payload, headers=headers) as response:
                if response.status_code != 200:
                    node_run.error_message = f"Email worker responded with {response.status_code}"
                    node_run.status = 'failed'
                else:
                    for line in response.iter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            chunk = {"type": "log", "data": line}

                        ctype = chunk.get('type')
                        cdata = chunk.get('data', '')
                        ts = dj_timezone.now().isoformat()

                        if ctype == 'exit_code':
                            try:
                                final_exit_code = int(cdata)
                            except (TypeError, ValueError):
                                final_exit_code = -1
                            publish_workflow_log(workflow_run_id, 'exit_code', {
                                'node_id': node_id,
                                'exit_code': final_exit_code,
                            })
                        elif ctype == 'email_error' or ctype == 'error':
                            masked = _mask(str(cdata))
                            stderr_text += masked + "\n"
                            logs_list.append({"type": "stderr", "data": masked, "ts": ts})
                            publish_workflow_log(workflow_run_id, 'log', {
                                'stdout': f"[ERROR] {masked}",
                            })
                        elif ctype in ('email_queued', 'email_sending', 'email_sent'):
                            masked = _mask(str(cdata))
                            stdout_text += masked + "\n"
                            logs_list.append({"type": "stdout", "data": masked, "ts": ts})
                            publish_workflow_log(workflow_run_id, 'log', {
                                'stdout': f"[EMAIL] {masked}",
                            })
                        else:
                            masked = _mask(str(cdata))
                            logs_list.append({"type": "log", "data": masked, "ts": ts})
                            publish_workflow_log(workflow_run_id, 'log', {
                                'stdout': f"[INFO] {masked}",
                            })
    except Exception as e:
        node_run.status = 'failed'
        node_run.error_message = f"Email worker communication error: {_mask(str(e))}"
        stderr_text += f"{node_run.error_message}\n"

    if node_run.status != 'failed':
        node_run.status = 'success' if (final_exit_code is None or final_exit_code == 0) else 'failed'

    node_run.exit_code = final_exit_code
    node_run.finished_at = dj_timezone.now()
    node_run.save()

    duration = (node_run.finished_at - node_run.started_at).total_seconds()
    publish_workflow_log(workflow_run_id, 'node_complete', {
        'node_id': node_id,
        'node_label': node_run.node_label,
        'node_type': 'action',
        'action_type': 'email',
        'status': node_run.status,
        'exit_code': final_exit_code,
        'duration': duration,
    })

    try:
        gcs_urls = upload_workflow_node_logs(
            user_id=run.user_id,
            workflow_id=str(run.workflow_id),
            run_id=str(run.id),
            node_id=node_id,
            stdout=stdout_text,
            stderr=stderr_text,
            logs=logs_list,
        )
        node_run.stdout_log_url = gcs_urls.get('stdout_log_url', '')
        node_run.stderr_log_url = gcs_urls.get('stderr_log_url', '')
        node_run.logs_url = gcs_urls.get('logs_url', '')
        node_run.save(update_fields=['stdout_log_url', 'stderr_log_url', 'logs_url'])
    except Exception as e:
        logger.error(f"Failed to upload GCS logs for email NodeRun {node_run.id}: {str(e)}")

    if node_run.status == 'success':
        node_outputs[node_id] = {
            "to": to_list,
            "cc": cc_list,
            "bcc": bcc_list,
            "subject": subject,
            "sent": True,
        }
    else:
        node_outputs[node_id] = {"sent": False}
        if fail_fast:
            run.status = 'failed'
            run.error_message = f"Node {node_id} email send failed: {node_run.error_message}"


@shared_task(bind=True, name='workflows.execute_workflow')
def execute_workflow(self, workflow_run_id: str, raw_inputs: dict = None):
    logger.info(f"Starting workflow execution for Run: {workflow_run_id}")
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

    # Publish initial status to Redis for SSE subscribers
    publish_workflow_log(workflow_run_id, 'status', {
        'workflow_run_id': workflow_run_id,
        'status': 'running',
    })

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
    
    # Identify password parameters to mask them in logs
    password_values = []
    
    # Collect from raw inputs
    if raw_inputs:
        for node in run.workflow.nodes:
            params = node.get("data", {}).get("parameters", [])
            for p in params:
                if p.get("type") == "password":
                    pid = p.get("id")
                    if pid in raw_inputs and raw_inputs[pid]:
                        password_values.append(str(raw_inputs[pid]))

    # Collect static values from workflow definition
    for node in run.workflow.nodes:
        params = node.get("data", {}).get("parameters", [])
        for p in params:
            if p.get("type") == "password":
                static_val = p.get("value")
                if static_val and p.get("sourceType") == "manual":
                    password_values.append(str(static_val))
                        
    # Sort password values by length descending so we replace longest first
    password_values = sorted(list(set(password_values)), key=len, reverse=True)
    
    def mask_passwords(text: str) -> str:
        if not text or not isinstance(text, str):
            return text
        for pwd in password_values:
            text = text.replace(pwd, "*****")
        return text

    for node_id in topo_order:
        # Check if the workflow was cancelled during execution (especially for Windows/solo workers where revoke signals may fail)
        run.refresh_from_db(fields=['status'])
        if run.status == 'cancelled':
            logger.info(f"WorkflowRun {workflow_run_id} cancelled mid-execution. Aborting.")
            publish_workflow_log(workflow_run_id, 'log', {
                'stdout': "[SYSTEM] Workflow cancelled by user. Halting further execution."
            })
            break

        logger.info(f"Processing node {node_id} for Run: {workflow_run_id}")
        try:
            node_run = WorkflowNodeRun.objects.get(workflow_run=run, node_id=node_id)
        except WorkflowNodeRun.DoesNotExist:
            continue

        if node_run.status in ['skipped', 'cancelled']:
            continue

        node_run.status = 'running'
        node_run.started_at = dj_timezone.now()
        node_run.save(update_fields=['status', 'started_at'])

        node_data = get_node_data(G, node_id)
        node_type = node_data.get('type')
        data = node_data.get('data', {})

        # Publish node start event
        publish_workflow_log(workflow_run_id, 'node_start', {
            'node_id': node_id,
            'node_label': node_run.node_label,
            'node_type': node_type or '',
        })

        if node_type == NODE_TYPE_TRIGGER:
            node_run.status = 'success'
            node_run.finished_at = dj_timezone.now()
            node_run.save(update_fields=['status', 'finished_at'])
            node_outputs[node_id] = {}
            duration = (node_run.finished_at - node_run.started_at).total_seconds()
            publish_workflow_log(workflow_run_id, 'node_complete', {
                'node_id': node_id,
                'node_label': node_run.node_label,
                'node_type': node_type,
                'status': 'success',
                'duration': duration,
            })
            continue

        elif node_type == NODE_TYPE_DECISION:
            conditions = data.get('conditions', [])
            decision_result = True
            
            try:
                for cond in conditions:
                    raw_field = cond.get('field', '')
                    operator = cond.get('operator', '==')
                    raw_target = cond.get('value', '')
                    
                    field_val = resolve_condition_value(raw_field, node_outputs)
                    target_val = resolve_condition_value(raw_target, node_outputs)
                    
                    cond_result = _evaluate_condition(field_val, operator, target_val)
                    publish_workflow_log(workflow_run_id, 'log', {
                        'stdout': f"[EVAL] Evaluated '{raw_field}' ({field_val}) {operator} '{raw_target}' ({target_val}) -> {cond_result}"
                    })

                    if not cond_result:
                        decision_result = False
                        break
            except Exception as e:
                node_run.status = 'failed'
                node_run.error_message = f"Condition evaluation error: {str(e)}"
                node_run.finished_at = dj_timezone.now()
                node_run.save(update_fields=['status', 'error_message', 'finished_at'])
                
                duration = (node_run.finished_at - node_run.started_at).total_seconds()
                publish_workflow_log(workflow_run_id, 'node_complete', {
                    'node_id': node_id,
                    'node_label': node_run.node_label,
                    'node_type': 'decision',
                    'status': 'failed',
                    'duration': duration,
                })
                
                if fail_fast:
                    run.status = 'failed'
                    run.error_message = f"Node {node_id} failed: {node_run.error_message}"
                    break
                continue
            
            outgoing = get_outgoing_branches(G, node_id)
            taken_handle = EDGE_HANDLE_TRUE if decision_result else EDGE_HANDLE_FALSE
            skipped_handle = EDGE_HANDLE_FALSE if decision_result else EDGE_HANDLE_TRUE
            
            skipped_target = outgoing.get(skipped_handle)
            if skipped_target:
                subgraph = get_branch_subgraph(G, skipped_target)
                publish_workflow_log(workflow_run_id, 'log', {
                    'stdout': f"[PRUNE] PRUNED inactive branch starting at {skipped_target}. Skipped {len(subgraph)} node(s)."
                })
                WorkflowNodeRun.objects.filter(
                    workflow_run=run, 
                    node_id__in=subgraph, 
                    status='pending'
                ).update(status='skipped')
                
                # Also publish node_complete events indicating "skipped" so the UI updates
                for skipped_node_id in subgraph:
                    publish_workflow_log(workflow_run_id, 'node_complete', {
                        'node_id': skipped_node_id,
                        'status': 'skipped',
                        'duration': 0.0,
                    })
            
            node_run.status = 'success'
            node_run.finished_at = dj_timezone.now()
            node_run.save(update_fields=['status', 'finished_at'])
            node_outputs[node_id] = {"result": decision_result}
            
            duration = (node_run.finished_at - node_run.started_at).total_seconds()
            publish_workflow_log(workflow_run_id, 'node_complete', {
                'node_id': node_id,
                'node_label': node_run.node_label,
                'node_type': 'decision',
                'status': 'success',
                'decision_result': decision_result,
                'taken_branch': taken_handle,
                'duration': duration,
            })
            continue

        elif node_type == NODE_TYPE_ACTION:
            action_type = data.get('type')

            if action_type == 'email':
                _execute_email_node(
                    run=run,
                    node_run=node_run,
                    node_id=node_id,
                    data=data,
                    node_outputs=node_outputs,
                    workflow_run_id=workflow_run_id,
                    fail_fast=fail_fast,
                )
                if run.status == 'failed':
                    break
                continue

            if action_type != 'script':
                # Unknown / future action types: mark success and move on so the flow doesn't stall.
                node_run.status = 'success'
                node_run.finished_at = dj_timezone.now()
                node_run.save(update_fields=['status', 'finished_at'])
                node_outputs[node_id] = {}
                duration = (node_run.finished_at - node_run.started_at).total_seconds()
                publish_workflow_log(workflow_run_id, 'node_complete', {
                    'node_id': node_id,
                    'node_label': node_run.node_label,
                    'node_type': 'action',
                    'action_type': action_type or 'unknown',
                    'status': 'success',
                    'duration': duration,
                })
                continue

            try:
                params = data.get('parameters', [])
                resolved_params = resolve_parameters(params, node_outputs, raw_inputs or run.inputs)

                # Build list of parameter names whose type is "password".
                # Sent to the exec-worker so it can report how many secrets
                # are being injected (without logging their values).
                secret_param_names = [
                    p.get("name", "")
                    for p in params
                    if p.get("type") == "password" and p.get("name")
                ]

                if resolved_params:
                    masked_resolved = {}
                    for k, v in resolved_params.items():
                        # Mask in the logged dictionary
                        is_pwd = any(p.get("name") == k and p.get("type") == "password" for p in params)
                        masked_resolved[k] = "*****" if is_pwd else v
                        
                    publish_workflow_log(workflow_run_id, 'log', {
                        'stdout': f"[PARAM] Resolved parameters: {masked_resolved}"
                    })
            except Exception as e:
                node_run.status = 'failed'
                node_run.error_message = f"Parameter resolution error: {str(e)}"
                node_run.finished_at = dj_timezone.now()
                node_run.save(update_fields=['status', 'error_message', 'finished_at'])
                
                publish_workflow_log(workflow_run_id, 'node_complete', {
                    'node_id': node_id,
                    'node_label': node_run.node_label,
                    'node_type': 'action',
                    'status': 'failed',
                    'duration': (node_run.finished_at - node_run.started_at).total_seconds(),
                })
                
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
                
                publish_workflow_log(workflow_run_id, 'node_complete', {
                    'node_id': node_id,
                    'node_label': node_run.node_label,
                    'node_type': 'action',
                    'status': 'failed',
                    'duration': (node_run.finished_at - node_run.started_at).total_seconds(),
                })
                
                if fail_fast:
                    run.status = 'failed'
                    run.error_message = "Execution worker URL not configured."
                    break
                continue

            try:
                script = Script.objects.get(id=node_run.script_id, owner=run.user)
                server = Server.objects.get(id=node_run.server_id, vault__owner=run.user)
                credential = Credential.objects.get(id=node_run.credential_id, vault__owner=run.user)
            except Exception as e:
                node_run.status = 'failed'
                node_run.error_message = f"Missing binding configuration: {str(e)}"
                node_run.finished_at = dj_timezone.now()
                node_run.save(update_fields=['status', 'error_message', 'finished_at'])
                
                publish_workflow_log(workflow_run_id, 'node_complete', {
                    'node_id': node_id,
                    'node_label': node_run.node_label,
                    'node_type': 'action',
                    'status': 'failed',
                    'duration': (node_run.finished_at - node_run.started_at).total_seconds(),
                })
                
                if fail_fast:
                    run.status = 'failed'
                    run.error_message = f"Node {node_id} binding error."
                    break
                continue

            server_host = server.host.strip()
            if server_host.startswith(('http://', 'https://')):
                server_host = server_host.split('://', 1)[1]

            # Fetch script content from GCS (authenticated) and resolve {{VAR}} placeholders
            # before sending to worker. This avoids the worker needing workflow state.
            rendered_script = None
            try:
                from execution_engine.helpers.gcs import download_script_content
                from execution_engine.helpers.params import resolve_template_variables

                script_body = download_script_content(script.blob_url)
                rendered_script = resolve_template_variables(script_body, resolved_params)
                logger.info(f"[Node {node_id}] Script rendered successfully ({len(rendered_script)} bytes)")
            except Exception as e:
                # Log and fall through — worker will attempt its own GCS fetch as fallback
                logger.error(f"[Node {node_id}] Failed to fetch/render script from GCS: {str(e)}")

            worker_payload = {
                "execution_id": str(node_run.id),
                "script": {
                    "id": str(script.id),
                    "name": script.name,
                    "pathname": script.pathname,
                    "blob_url": script.blob_url,
                    "content": rendered_script,
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
                # Names of secret parameters so the worker can log injection
                # counts without exposing values.
                "secret_keys": secret_param_names,
            }

            headers = build_worker_headers()
            
            stdout_text = ""
            stderr_text = ""
            logs_list = []
            final_exit_code = None

            logger.info(f"Calling execute-worker for node {node_id} (Run: {workflow_run_id})")
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
                                    publish_workflow_log(workflow_run_id, 'exit_code', {
                                        'node_id': node_id,
                                        'exit_code': final_exit_code,
                                    })
                                elif ctype == 'stdout':
                                    masked_cdata = mask_passwords(str(cdata))
                                    stdout_text += masked_cdata + "\n"
                                    logs_list.append({"type": "stdout", "data": masked_cdata, "ts": ts})
                                    publish_workflow_log(workflow_run_id, 'log', {
                                        'stdout': f"> {masked_cdata}" if not masked_cdata.startswith("[") else masked_cdata,
                                    })
                                elif ctype in ('stderr', 'error'):
                                    masked_cdata = mask_passwords(str(cdata))
                                    stderr_text += masked_cdata + "\n"
                                    logs_list.append({"type": "stderr", "data": masked_cdata, "ts": ts})
                                    publish_workflow_log(workflow_run_id, 'log', {
                                        'stdout': f"[ERROR] {masked_cdata}" if not masked_cdata.startswith("[") else masked_cdata,
                                    })
                                elif ctype == 'log':
                                    masked_cdata = mask_passwords(str(cdata))
                                    logs_list.append({"type": "log", "data": masked_cdata, "ts": ts})
                                    publish_workflow_log(workflow_run_id, 'log', {
                                        'stdout': f"[INFO] {masked_cdata}" if not masked_cdata.startswith("[") else masked_cdata,
                                    })
            except Exception as e:
                node_run.status = 'failed'
                node_run.error_message = f"Worker communication error: {str(e)}"
                stderr_text += f"{node_run.error_message}\n"
            
            if node_run.status != 'failed':
                node_run.status = 'success' if (final_exit_code is None or final_exit_code == 0) else 'failed'
                
            node_run.exit_code = final_exit_code
            node_run.finished_at = dj_timezone.now()
            node_run.save()

            duration = (node_run.finished_at - node_run.started_at).total_seconds()

            # Publish node completion event
            publish_workflow_log(workflow_run_id, 'node_complete', {
                'node_id': node_id,
                'node_label': node_run.node_label,
                'node_type': 'action',
                'status': node_run.status,
                'exit_code': final_exit_code,
                'duration': duration,
            })
            
            try:
                gcs_urls = upload_workflow_node_logs(
                    user_id=run.user_id,
                    workflow_id=str(run.workflow_id),
                    run_id=str(run.id),
                    node_id=node_id,
                    stdout=stdout_text,
                    stderr=stderr_text,
                    logs=logs_list
                )
                node_run.stdout_log_url = gcs_urls.get('stdout_log_url', '')
                node_run.stderr_log_url = gcs_urls.get('stderr_log_url', '')
                node_run.logs_url = gcs_urls.get('logs_url', '')
                node_run.save(update_fields=['stdout_log_url', 'stderr_log_url', 'logs_url'])
            except Exception as e:
                logger.error(f"Failed to upload GCS logs for NodeRun {node_run.id}: {str(e)}")

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

    # Publish final workflow status and done event
    publish_workflow_log(workflow_run_id, 'status', {
        'workflow_run_id': workflow_run_id,
        'status': run.status,
        'error_message': run.error_message or '',
    })
    logger.info(f"Workflow execution finished for Run: {workflow_run_id} with status {run.status}")
    publish_workflow_log(workflow_run_id, 'done', {
        'workflow_run_id': workflow_run_id,
        'status': run.status,
    })

    # Send the completion email if the user opted in at trigger time. Failures
    # here must not impact the run itself, so the helper swallows exceptions.
    if run.send_email and run.notification_email:
        try:
            from execution_engine.helpers.notifications.workflow_email import (
                send_workflow_completion_email,
            )
            send_workflow_completion_email(workflow_run_id)
        except Exception:
            logger.exception(
                "Workflow completion email failed for run %s", workflow_run_id,
            )
