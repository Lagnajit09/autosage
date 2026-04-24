import json
import logging
from django.utils import timezone
from django.http import StreamingHttpResponse
from django.contrib.auth.models import AnonymousUser
from django.views.decorators.csrf import csrf_exempt
from asgiref.sync import sync_to_async
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from server.utils import api_response
from server.rate_limiters import ExecutionBurstThrottle, ExecutionSustainedThrottle
from workflows.models import Workflow
from execution_engine.models import WorkflowRun, WorkflowNodeRun
from scripts.models import Script
from vault.models import Vault, Server, Credential
from execution_engine.serializers import (
    WorkflowRunRequestSerializer,
    WorkflowRunSerializer,
    WorkflowNodeRunSerializer,
)
from execution_engine.helpers.graph import (
    build_dag,
    topological_order,
    validate_executable_nodes,
    NODE_TYPE_ACTION,
)
from execution_engine.tasks import execute_workflow
from execution_engine.helpers.redis_pubsub import subscribe_workflow_logs
from execution_engine.helpers.script_execution.utils import sse_event, json_response, check_throttle

logger = logging.getLogger(__name__)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def trigger_workflow_run(request, workflow_id):
    logger.info(f"Triggering workflow run for ID: {workflow_id}")
    try:
        workflow = Workflow.objects.get(id=workflow_id, user=request.user)
    except Workflow.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow not found or access denied.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    serializer = WorkflowRunRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return api_response(
            success=False,
            message="Invalid request data.",
            errors=serializer.errors,
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    inputs = serializer.validated_data.get("inputs", {})

    try:
        G = build_dag(workflow.nodes, workflow.edges)
        topo_order = topological_order(G)
    except ValueError:
        return api_response(
            success=False,
            message="Workflow graph validation failed.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # Secondary validation: Enforce vault/server credentials presence and existence for scripts
    missing_bindings = validate_executable_nodes(workflow.nodes)
    if missing_bindings:
        return api_response(
            success=False,
            message=f"Missing script or credential bindings in nodes: {missing_bindings}",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # Validate existence of referenced objects in DB
    for node in workflow.nodes:
        if node.get("type") == NODE_TYPE_ACTION and node.get("data", {}).get("type") == "script":
            data = node.get("data", {})
            script_id = data.get("selectedScript", {}).get("scriptId")
            vault_details = data.get("vaultDetails", {})
            vault_id = vault_details.get("vaultId")
            server_id = vault_details.get("serverId")
            credential_id = vault_details.get("credentialId")

            # Check Vault, Server, Credential (must be owned by or accessible to user)
            # For brevity in this phase, we check existence. Proper multi-tenant access
            # is handled by the model managers or specific checks if needed.
            try:
                if not Script.objects.filter(id=script_id, owner=request.user).exists():
                    raise ValueError(f"Script ID {script_id} not found or access denied for node {node.get('id')}")
                if not Vault.objects.filter(id=vault_id, owner=request.user).exists():
                    raise ValueError(f"Vault ID {vault_id} not found or access denied for node {node.get('id')}")
                if not Server.objects.filter(id=server_id, vault_id=vault_id).exists():
                    raise ValueError(f"Server ID {server_id} not found in vault {vault_id}")
                if not Credential.objects.filter(id=credential_id, vault_id=vault_id).exists():
                    raise ValueError(f"Credential ID {credential_id} not found in vault {vault_id}")
            except (ValueError, Exception) as e:
                logger.error(f"Validation error for workflow {workflow_id}: {str(e)}")
                return api_response(
                    success=False,
                    message="One or more script or credential bindings are invalid or inaccessible.",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

    # Mask passwords before saving to DB
    masked_inputs = dict(inputs)
    password_param_ids = set()
    for node in workflow.nodes:
        params = node.get("data", {}).get("parameters", [])
        for p in params:
            if p.get("type") == "password":
                password_param_ids.add(p.get("id"))
                
    for pid in password_param_ids:
        if pid in masked_inputs and masked_inputs[pid]:
            masked_inputs[pid] = "*****"

    workflow_run = WorkflowRun.objects.create(
        workflow=workflow,
        user=request.user,
        status="queued",
        inputs=masked_inputs
    )

    # Create WorkflowNodeRuns
    execution_order = 0
    for node_id in topo_order:
        node_data = G.nodes[node_id]
        
        script_id = None
        vault_id = None
        server_id = None
        credential_id = None

        if node_data.get("type") == NODE_TYPE_ACTION and node_data.get("data", {}).get("type") == "script":
            data_dict = node_data.get("data", {})
            script_id_raw = data_dict.get("selectedScript", {}).get("scriptId")
            if script_id_raw:
                try:
                    script_id = int(script_id_raw)
                except (ValueError, TypeError):
                    script_id = None
            
            vault_details = data_dict.get("vaultDetails", {})
            vault_id = vault_details.get("vaultId")
            server_id = vault_details.get("serverId")
            credential_id = vault_details.get("credentialId")

        WorkflowNodeRun.objects.create(
            workflow_run=workflow_run,
            node_id=node_id,
            node_label=node_data.get("data", {}).get("label", node_id),
            script_id=script_id,
            vault_id=vault_id,
            server_id=server_id,
            credential_id=credential_id,
            status="pending",
            execution_order=execution_order,
        )
        execution_order += 1

    task = execute_workflow.delay(str(workflow_run.id), raw_inputs=inputs)
    workflow_run.celery_task_id = task.id
    workflow_run.save(update_fields=['celery_task_id'])

    return api_response(
        success=True,
        message="Workflow execution queued successfully.",
        data={"workflow_run_id": str(workflow_run.id), "status": "queued"},
        status_code=status.HTTP_202_ACCEPTED
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def list_workflow_runs(request):
    """GET /api/execution-engine/workflows/runs/"""
    workflow_id = request.query_params.get('workflow_id')
    runs = WorkflowRun.objects.filter(user=request.user)
    
    if workflow_id:
        runs = runs.filter(workflow_id=workflow_id)
        
    runs = runs.order_by('-created_at')
    serializer = WorkflowRunSerializer(runs, many=True)
    return api_response(
        success=True,
        message="Workflow runs retrieved successfully.",
        data=serializer.data
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def get_workflow_run(request, run_id):
    """GET /api/execution-engine/workflows/runs/<run_id>/"""
    try:
        run = WorkflowRun.objects.get(id=run_id, user=request.user)
    except WorkflowRun.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow run not found.",
            status_code=status.HTTP_404_NOT_FOUND
        )

    serializer = WorkflowRunSerializer(run)
    return api_response(
        success=True,
        message="Workflow run retrieved successfully.",
        data=serializer.data
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def get_workflow_node_runs(request, run_id):
    """GET /api/execution-engine/workflows/runs/<run_id>/nodes/"""
    try:
        run = WorkflowRun.objects.get(id=run_id, user=request.user)
    except WorkflowRun.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow run not found.",
            status_code=status.HTTP_404_NOT_FOUND
        )

    node_runs = WorkflowNodeRun.objects.filter(workflow_run=run).order_by('execution_order')
    serializer = WorkflowNodeRunSerializer(node_runs, many=True)
    return api_response(
        success=True,
        message="Node runs retrieved successfully.",
        data=serializer.data
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def cancel_workflow_run(request, run_id):
    """POST /api/execution-engine/workflows/runs/<run_id>/cancel/"""
    from server.celery import app as celery_app
    
    try:
        run = WorkflowRun.objects.get(id=run_id, user=request.user)
    except WorkflowRun.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow run not found.",
            status_code=status.HTTP_404_NOT_FOUND
        )

    if run.status not in ["queued", "running"]:
        return api_response(
            success=False,
            message=f"Cannot cancel run in '{run.status}' state.",
            status_code=status.HTTP_400_BAD_REQUEST
        )

    if run.celery_task_id:
        celery_app.control.revoke(run.celery_task_id, terminate=True)
        logger.info(f"Revoked Celery task {run.celery_task_id} for WorkflowRun {run.id}")

    # Mark as cancelled
    run.status = "cancelled"
    run.finished_at = timezone.now()
    run.save(update_fields=['status', 'finished_at'])
    
    # Mark running/pending nodes as cancelled
    WorkflowNodeRun.objects.filter(workflow_run=run, status__in=['pending', 'running']).update(
        status='cancelled', 
        finished_at=timezone.now()
    )

    WorkflowRun.objects.filter(id=run_id).update(
        status='cancelled', 
        finished_at=timezone.now()
    )

    return api_response(
        success=True,
        message="Workflow execution cancelled successfully."
    )


# ── Real-time SSE streaming endpoint ─────────────────────────────────────────

@csrf_exempt
async def stream_workflow_run(request, run_id):
    """
    GET /api/execution-engine/workflows/runs/<run_id>/stream/

    Native async Django view that subscribes to the Redis Pub/Sub channel
    for the given workflow run and relays log events as Server-Sent Events.

    The Celery task publishes events to the channel as it processes each
    node. This view yields them in real-time until a ``done`` event is
    received or the connection is closed.

    SSE event types emitted:
        status       – workflow-level status changes (running, success, failed)
        node_start   – a node has started executing
        node_complete– a node has finished (success/failed/skipped)
        stdout       – standard output line from a script node
        stderr       – standard error line from a script node
        exit_code    – exit code from a script node
        log          – generic log line
        done         – workflow execution is complete
    """
    if request.method != "GET":
        return json_response(False, "Method not allowed.", status_code=405)

    # ── Auth check ────────────────────────────────────────────────────────
    user = getattr(request, "user", None)
    if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
        return json_response(False, "Authentication required.", status_code=401)

    # ── Throttling ────────────────────────────────────────────────────────
    check_burst = sync_to_async(check_throttle)
    check_sustained = sync_to_async(check_throttle)

    if not await check_burst(request, ExecutionBurstThrottle):
        return json_response(False, "Rate limit exceeded.", status_code=429)
    if not await check_sustained(request, ExecutionSustainedThrottle):
        return json_response(False, "Rate limit exceeded.", status_code=429)

    # ── Verify the run exists and belongs to the user ─────────────────────
    get_run = sync_to_async(WorkflowRun.objects.get)
    try:
        run = await get_run(id=run_id, user=user)
    except WorkflowRun.DoesNotExist:
        return json_response(False, "Workflow run not found.", status_code=404)

    # If run is already finished, return its final status immediately
    if run.status in ('success', 'failed', 'cancelled'):
        async def finished_stream():
            yield sse_event('status', {
                'workflow_run_id': str(run_id),
                'status': run.status,
                'error_message': run.error_message or '',
            })
            yield sse_event('done', {
                'workflow_run_id': str(run_id),
                'status': run.status,
            })

        response = StreamingHttpResponse(
            finished_stream(),
            content_type='text/event-stream',
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response

    # ── Stream from Redis Pub/Sub ─────────────────────────────────────────
    async def log_stream():
        try:
            async for payload in subscribe_workflow_logs(str(run_id)):
                event_name = payload.get('event', 'log')
                event_data = payload.get('data', {})
                yield sse_event(event_name, event_data)
        except Exception as exc:
            logger.exception("SSE stream error for run %s: %s", run_id, exc)
            yield sse_event('error', {'message': f'Stream error: {str(exc)}'})
            yield sse_event('done', {'workflow_run_id': str(run_id), 'status': 'error'})

    response = StreamingHttpResponse(
        log_stream(),
        content_type='text/event-stream',
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    response['X-Workflow-Run-Id'] = str(run_id)
    return response
