import json
import logging
from django.http import StreamingHttpResponse
from django.contrib.auth.models import AnonymousUser
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from asgiref.sync import sync_to_async

from execution_engine.models import ScriptExecution
from execution_engine.serializers import (
    ScriptExecutionRequestSerializer, 
    ScriptExecutionResponseSerializer,
    ScriptExecutionHistorySerializer
)
from server.utils import api_response
from server.rate_limiters import ExecutionBurstThrottle, ExecutionSustainedThrottle

# For non-streaming endpoints still using DRF decorators
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny

# Modular helpers
from execution_engine.helpers.script_execution.worker import EXEC_WORKER_URL, build_worker_headers
from execution_engine.helpers.script_execution.utils import (
    json_response,
    sse_event,
    check_throttle,
    resolve_run_targets,
    build_worker_payload,
    RunTargetError,
)
from execution_engine.helpers.script_execution.executor import stream_execution

import httpx

logger = logging.getLogger(__name__)

# ── Async execute view (SSE streaming) ───────────────────────────────────────

@csrf_exempt
async def execute_script(request):
    """
    POST /api/execution-engine/run/

    Native async Django view so that StreamingHttpResponse can consume
    the async generator directly (requires ASGI server, e.g. uvicorn/daphne).
    """
    if request.method != "POST":
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

    # ── Parse & validate request body ────────────────────────────────────
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, Exception):
        return json_response(False, "Invalid JSON body.", status_code=400)

    serializer = ScriptExecutionRequestSerializer(data=body)
    if not serializer.is_valid():
        return json_response(
            False,
            "Invalid request data.",
            errors=serializer.errors,
            status_code=400,
        )

    data = serializer.validated_data

    # ── Fetch and validate ownership (shared with run_script_async) ──────
    try:
        script, vault, server, credential, inputs = await sync_to_async(
            resolve_run_targets
        )(user, data)
    except RunTargetError as exc:
        return json_response(False, exc.message, status_code=exc.status_code)

    # ── Create execution record ───────────────────────────────────────────
    create_execution = sync_to_async(ScriptExecution.objects.create)
    execution = await create_execution(
        script=script,
        vault=vault,
        server=server,
        credential=credential,
        user=user,
        inputs=inputs,
        status="pending",
    )

    # ── Build payload for exec-worker (shared with run_script_async) ──────
    worker_payload = build_worker_payload(execution.id, script, server, credential, inputs)

    # ── Validate exec-worker URL is configured ────────────────────────────
    if not EXEC_WORKER_URL:
        save_execution = sync_to_async(lambda obj: obj.save())
        execution.status = "failed"
        execution.stderr = "EXEC_WORKER_URL is not configured."
        await save_execution(execution)
        return json_response(
            False,
            "Execution worker URL is not configured.",
            status_code=503,
        )

    # ── Return async SSE stream ───────────────────────────────────────────
    streaming_response = StreamingHttpResponse(
        stream_execution(str(execution.id), worker_payload),
        content_type="text/event-stream",
    )
    streaming_response["Cache-Control"] = "no-cache"
    streaming_response["X-Accel-Buffering"] = "no"
    streaming_response["X-Execution-Id"] = str(execution.id)
    return streaming_response


# ── Async (fire-and-forget) execute view – non-streaming ──────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def run_script_async_view(request):
    """
    POST /api/execution-engine/run/async/

    Non-streaming sibling of ``execute_script`` for server-to-server callers
    that can't consume the SSE stream (e.g. Autobot's run_script tool). Same
    request body + same ownership validation, but instead of streaming it
    enqueues a Celery task and returns 202 immediately. The caller watches
    progress via ``GET /<execution_id>/status/`` and the signed log URLs.
    """
    if not EXEC_WORKER_URL:
        return api_response(
            success=False,
            message="Execution worker URL is not configured.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    serializer = ScriptExecutionRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return api_response(
            success=False,
            message="Invalid request data.",
            errors=serializer.errors,
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # Shared with the streaming view — never drifts on authorization.
    try:
        script, vault, server, credential, inputs = resolve_run_targets(
            request.user, serializer.validated_data
        )
    except RunTargetError as exc:
        return api_response(
            success=False,
            message=exc.message,
            status_code=exc.status_code,
        )

    execution = ScriptExecution.objects.create(
        script=script,
        vault=vault,
        server=server,
        credential=credential,
        user=request.user,
        inputs=inputs,
        status="pending",
    )

    worker_payload = build_worker_payload(execution.id, script, server, credential, inputs)

    # Fire-and-forget on the default Celery queue (same queue as workflow runs).
    from execution_engine.tasks import run_script_async
    run_script_async.delay(str(execution.id), worker_payload)

    return api_response(
        success=True,
        message="Script execution queued successfully.",
        data={"execution_id": str(execution.id), "status": "pending"},
        status_code=status.HTTP_202_ACCEPTED,
    )


# ── Status endpoint – lightweight poll fallback ────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def execution_status(request, execution_id):
    """
    GET /api/execution-engine/<execution_id>/status/
    """
    # ── Throttling ───────────────────────────────────────────────────
    for throttle_cls in [ExecutionBurstThrottle, ExecutionSustainedThrottle]:
        throttle = throttle_cls()
        if not throttle.allow_request(request, execution_status):
            return api_response(
                success=False,
                message="Rate limit exceeded.",
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            )

    try:
        execution = ScriptExecution.objects.get(id=execution_id, user=request.user)
    except ScriptExecution.DoesNotExist:
        return api_response(
            success=False,
            message="Execution record not found or access denied.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    return api_response(
        success=True,
        message="Execution status retrieved successfully.",
        data=ScriptExecutionResponseSerializer(execution).data,
    )

# ── History endpoint ─────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def execution_history(request):
    """
    GET /api/execution-engine/history/
    Retrieves the execution history for the authenticated user.
    """
    from django.core.paginator import Paginator, EmptyPage

    # ── Throttling ───────────────────────────────────────────────────
    for throttle_cls in [ExecutionBurstThrottle, ExecutionSustainedThrottle]:
        throttle = throttle_cls()
        if not throttle.allow_request(request, execution_history):
            return api_response(
                success=False,
                message="Rate limit exceeded.",
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            )

    try:
        page_number = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('page_size', 50))
        # Cap page_size to prevent excessive load
        page_size = min(max(page_size, 1), 100)
    except ValueError:
        return api_response(
            success=False,
            message="Invalid pagination parameters.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    executions = ScriptExecution.objects.filter(user=request.user).select_related('script')
    paginator = Paginator(executions, page_size)

    try:
        page_obj = paginator.page(page_number)
    except EmptyPage:
        return api_response(
            success=True,
            message="Execution history retrieved successfully.",
            data={'executions': [], 'total_count': paginator.count, 'total_pages': paginator.num_pages, 'current_page': page_number}
        )

    serializer = ScriptExecutionHistorySerializer(page_obj.object_list, many=True)
    return api_response(
        success=True,
        message="Execution history retrieved successfully.",
        data={
            'executions': serializer.data,
            'total_count': paginator.count,
            'total_pages': paginator.num_pages,
            'current_page': page_number
        },
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def stop_execution(request, execution_id):
    """
    POST /api/execution-engine/executions/<execution_id>/stop/
    Signals a running execution to terminate.
    """
    try:
        execution = ScriptExecution.objects.get(id=execution_id, user=request.user)
    except ScriptExecution.DoesNotExist:
        return api_response(
            success=False,
            message="Execution not found or access denied.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if execution.status != "running":
        return api_response(
            success=False,
            message=f"Execution is in status '{execution.status}' and cannot be stopped.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if not EXEC_WORKER_URL:
        return api_response(
            success=False,
            message="Execution worker URL not configured.",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # EXEC_WORKER_URL typically includes "/api/worker/execute"
    # We need to reach "/api/worker/stop/{id}"
    base_url = EXEC_WORKER_URL.split("/api/worker/execute")[0].rstrip("/")
    stop_endpoint = f"{base_url}/api/worker/stop/{execution_id}"

    try:
        # We use a synchronous httpx call here.
        # Headers include the OIDC token in PROD (no Content-Type needed for a
        # body-less stop signal).
        stop_headers = build_worker_headers(include_content_type=False)
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(stop_endpoint, headers=stop_headers)
            
            if resp.status_code == 200:
                logger.info("Sent stop signal to worker for execution %s", execution_id)
                return api_response(
                    success=True,
                    message="Stop signal sent to worker.",
                )
            else:
                logger.error("Worker returned error %d stopping %s: %s", resp.status_code, execution_id, resp.text)
                return api_response(
                    success=False,
                    message=f"Worker error: {resp.text}",
                    status_code=status.HTTP_502_BAD_GATEWAY,
                )

    except Exception as e:
        logger.exception("Failed to communicate with worker to stop execution %s", execution_id)
        return api_response(
            success=False,
            message="Failed to communicate with execution worker.",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def health_check(request):
    """
    GET /api/execution-engine/health/
    Proxies a health check request to the execution worker.
    """
    if not EXEC_WORKER_URL:
        return api_response(
            success=False,
            message="Execution worker URL not configured.",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Derived health endpoint from EXEC_WORKER_URL
    base_url = EXEC_WORKER_URL.split("/api/worker/execute")[0].rstrip("/")
    health_endpoint = f"{base_url}/api/health"

    try:
        # Get headers (OIDC in PROD, plain X-API-Key in DEV)
        # Note: Health endpoint on worker doesn't strictly need X-API-Key,
        # but the OIDC token in Authorization header is required for Cloud Run IAM.
        headers = build_worker_headers(include_content_type=False)
        
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(health_endpoint, headers=headers)
            
            if resp.status_code == 200:
                worker_data = resp.json()
                return api_response(
                    success=True,
                    message="Execution worker is healthy.",
                    data=worker_data
                )
            else:
                return api_response(
                    success=False,
                    message=f"Worker health check failed with status {resp.status_code}.",
                    errors=resp.text,
                    status_code=status.HTTP_502_BAD_GATEWAY
                )

    except Exception as e:
        logger.exception("Failed to connect to execution worker for health check")
        return api_response(
            success=False,
            message="Could not reach execution worker.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def all_executions(request):
    """
    GET /api/execution-engine/executions/all/
    Fetches all script executions and workflow runs for the authenticated user,
    with signed GCS URLs so they can be fetched when the user requests it.
    Supports pagination via 'page' and 'page_size' query parameters.
    """
    from execution_engine.models import WorkflowRun, ScriptExecution
    from execution_engine.helpers.gcs import (
        generate_signed_url,
        get_blob_path_from_url,
        logs_expired,
    )
    from django.core.paginator import Paginator, EmptyPage

    user = request.user

    # Pagination parameters
    try:
        page = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('page_size', 20))
    except ValueError:
        page = 1
        page_size = 20

    # 1. Fetch script executions and workflow runs
    script_execs = ScriptExecution.objects.filter(user=user).select_related('script')
    workflow_runs = WorkflowRun.objects.filter(user=user).select_related('workflow')

    def get_signed_url(log_url):
        if not log_url:
            return ""
        try:
            path = get_blob_path_from_url(log_url)
            return generate_signed_url(path) if path else ""
        except Exception:
            return ""

    def format_duration(duration_delta):
        if not duration_delta:
            return "0s"
        seconds = int(duration_delta.total_seconds())
        if seconds < 60:
            return f"{seconds}s"
        minutes = seconds / 60
        if minutes < 60:
            return f"{minutes:.1f}m"
        hours = minutes / 60
        return f"{hours:.1f}h"

    results = []

    for se in script_execs:
        duration_str = "0s"
        if se.duration:
            duration_str = format_duration(se.duration)
        elif se.completed_at and se.started_at:
            duration_str = format_duration(se.completed_at - se.started_at)
        # Past the lifecycle retention the blobs are gone — return empty URLs +
        # a flag rather than minting links to deleted objects.
        expired = logs_expired(se.created_at)
        results.append({
            'id': str(se.id),
            'name': se.script.name if se.script else "Unknown Script",
            'duration': duration_str,
            'status': se.status,
            'tag': 'script',
            'stdout_signed_url': "" if expired else get_signed_url(se.stdout_log_url),
            'stderr_signed_url': "" if expired else get_signed_url(se.stderr_log_url),
            'logs_signed_url': "" if expired else get_signed_url(se.logs_url),
            'logs_expired': expired,
            'created_at': se.created_at.isoformat(),
            'timestamp': se.created_at,
        })

    for wr in workflow_runs:
        duration_str = "0s"
        if wr.finished_at and wr.started_at:
            duration_str = format_duration(wr.finished_at - wr.started_at)
        results.append({
            'id': str(wr.id),
            'name': wr.workflow.name if wr.workflow else "Unknown Workflow",
            'workflow_id': str(wr.workflow.id) if wr.workflow else None,
            'duration': duration_str,
            'status': wr.status,
            'tag': 'workflow',
            'created_at': wr.created_at.isoformat(),
            'timestamp': wr.created_at,
        })
        
    # Sort combined results by timestamp descending
    results.sort(key=lambda x: x['timestamp'], reverse=True)
    
    # Clean up the internal timestamp key
    for item in results:
        item.pop('timestamp', None)
        
    # If pagination parameters are not supplied, return full results without pagination
    if not request.GET.get('page') and not request.GET.get('page_size'):
        return api_response(
            success=True,
            message="All executions retrieved successfully.",
            data=results,
        )

    # Apply pagination
    paginator = Paginator(results, page_size)
    try:
        page_obj = paginator.page(page)
    except EmptyPage:
        page_obj = paginator.page(paginator.num_pages)

    return api_response(
        success=True,
        message="All executions retrieved successfully.",
        data={
            "executions": page_obj.object_list,
            "total_count": paginator.count,
            "total_pages": paginator.num_pages,
            "current_page": page_obj.number,
        },
    )