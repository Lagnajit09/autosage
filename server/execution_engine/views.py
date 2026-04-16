import json
import logging
from django.http import StreamingHttpResponse
from django.contrib.auth.models import AnonymousUser
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from asgiref.sync import sync_to_async

from vault.models import Vault, Server, Credential
from scripts.models import Script
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
    uuid_to_str, 
    check_throttle
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
    script_details = data["script_details"]
    vault_details = data["vault_details"]
    # Convert UUIDs in inputs to strings to avoid JSON serialization errors in DB/Worker
    inputs = uuid_to_str(data)

    # ── Fetch and validate ownership (sync ORM via sync_to_async) ────────
    get_vault = sync_to_async(Vault.objects.get)
    get_server = sync_to_async(Server.objects.get)
    get_credential = sync_to_async(Credential.objects.get)
    get_script = sync_to_async(Script.objects.get)
    create_execution = sync_to_async(ScriptExecution.objects.create)

    try:
        vault = await get_vault(id=vault_details["vault_id"], owner=user)
    except Vault.DoesNotExist:
        return json_response(False, "Vault not found or access denied.", status_code=404)

    try:
        server = await get_server(id=vault_details["server_id"], vault=vault)
    except Server.DoesNotExist:
        return json_response(False, "Server not found in vault.", status_code=404)

    try:
        credential = await get_credential(id=vault_details["credential_id"], vault=vault)
    except Credential.DoesNotExist:
        return json_response(False, "Credential not found in vault.", status_code=404)

    try:
        script = await get_script(id=script_details["script_id"], owner=user)
    except Script.DoesNotExist:
        return json_response(False, "Script not found or access denied.", status_code=404)

    # ── Create execution record ───────────────────────────────────────────
    execution = await create_execution(
        script=script,
        vault=vault,
        server=server,
        credential=credential,
        user=user,
        inputs=inputs,
        status="pending",
    )

    server_host = server.host.strip()
    if server_host.startswith(('http://', 'https://')):
        server_host = server_host.split('://', 1)[1]

    # ── Build payload for exec-worker ─────────────────────────────────────
    worker_payload = {
        "execution_id": str(execution.id),
        "script": {
            "id": str(script_details["script_id"]),
            "name": script_details["script_name"],
            "pathname": script_details["pathname"],
            "blob_url": script_details["url"],
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
        "inputs": inputs,
    }

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
            message=f"Failed to communicate with worker: {str(e)}",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([AllowAny])
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
            message=f"Could not reach execution worker: {str(e)}",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE
        )