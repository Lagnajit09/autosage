import json
import logging
import asyncio
from datetime import datetime, timezone

import httpx
from django.http import StreamingHttpResponse, JsonResponse
from django.utils import timezone as dj_timezone
from django.contrib.auth.models import AnonymousUser
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.throttling import UserRateThrottle
from rest_framework import status

from vault.models import Vault, Server, Credential
from scripts.models import Script
from .models import ScriptExecution
from .serializers import ScriptExecutionRequestSerializer, ScriptExecutionResponseSerializer
from server.utils import api_response
from server.rate_limiters import ExecutionBurstThrottle, ExecutionSustainedThrottle

# For non-streaming endpoints still using DRF decorators
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.request import Request as DRFRequest

logger = logging.getLogger(__name__)

# Execution Worker endpoint
import os
from django.conf import settings

EXEC_WORKER_URL = getattr(settings, "EXEC_WORKER_URL", os.getenv("EXEC_WORKER_URL", ""))
WORKER_API_KEY = getattr(settings, "WORKER_API_KEY", os.getenv("WORKER_API_KEY", ""))


# ── Helpers ───────────────────────────────────────────────────────────────────

def _json_response(success: bool, message: str, data=None, errors=None, status_code: int = 200) -> JsonResponse:
    """Async-safe replacement for api_response() that returns JsonResponse."""
    return JsonResponse(
        {"success": success, "message": message, "data": data, "errors": errors},
        status=status_code,
    )


def _sse_event(event: str, data: dict) -> str:
    """Format a Server-Sent Event frame."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _check_throttle(request, throttle_class):
    """
    Run a DRF throttle against the raw Django request.
    Returns True when the request is allowed.
    """
    throttle = throttle_class()
    # DRF throttles need a DRF Request wrapper; we build a minimal one.
    drf_request = DRFRequest(request)
    drf_request._user = request.user
    return throttle.allow_request(drf_request, None)


# ── Core async SSE generator ──────────────────────────────────────────────────

async def _stream_execution(execution_id: str, payload: dict):
    """
    Async generator that:
    1. Sends the execution request to the exec-worker (streaming response).
    2. Yields SSE events for each chunk / status update received.
    3. Persists final result to the ScriptExecution record.
    """
    from asgiref.sync import sync_to_async

    get_execution = sync_to_async(ScriptExecution.objects.get)
    save_execution = sync_to_async(lambda obj: obj.save())

    # ── Initial "started" event ──────────────────────────────────────────
    yield _sse_event("status", {"execution_id": execution_id, "status": "running"})

    # Update DB: mark as running
    try:
        execution = await get_execution(id=execution_id)
        execution.status = "running"
        execution.started_at = dj_timezone.now()
        await save_execution(execution)
    except ScriptExecution.DoesNotExist:
        yield _sse_event("error", {"message": "Execution record not found."})
        return

    stdout_chunks = []
    stderr_chunks = []
    logs = []
    exit_code = None
    final_status = "failed"

    try:
        # ── Call exec-worker ──────────────────────────────────────────
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": WORKER_API_KEY,
        }

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                EXEC_WORKER_URL,
                json=payload,
                headers=headers,
            ) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    raise RuntimeError(
                        f"Exec worker returned {response.status_code}: {error_body.decode()}"
                    )

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue

                    # ── Parse NDJSON line from exec-worker ───────────────
                    try:
                        chunk: dict = json.loads(line)
                    except json.JSONDecodeError:
                        # Bare text (shouldn't happen) – treat as stdout
                        chunk = {"type": "stdout", "data": line}

                    chunk_type = chunk.get("type", "stdout")
                    raw_data   = chunk.get("data", "")

                    # ── Normalise data per chunk type ─────────────────────
                    if chunk_type == "exit_code":
                        # data is an int from the worker
                        try:
                            exit_code = int(raw_data)
                        except (TypeError, ValueError):
                            exit_code = -1
                        yield _sse_event("exit_code", {"exit_code": exit_code})
                        continue

                    # For stdout / stderr / error: data is a string
                    # The string may itself be JSON-formatted output from the
                    # user's script – we pass it through as-is so the
                    # frontend can decide whether to pretty-print it.
                    chunk_data = str(raw_data) if not isinstance(raw_data, str) else raw_data
                    ts = dj_timezone.now().isoformat()

                    if chunk_type == "stdout":
                        stdout_chunks.append(chunk_data)
                        logs.append({"type": "stdout", "data": chunk_data, "ts": ts})
                        yield _sse_event("stdout", {"data": chunk_data})

                    elif chunk_type == "stderr":
                        stderr_chunks.append(chunk_data)
                        logs.append({"type": "stderr", "data": chunk_data, "ts": ts})
                        yield _sse_event("stderr", {"data": chunk_data})

                    elif chunk_type == "error":
                        # Worker-level errors (SSH failure, fetch error, etc.)
                        # Surface as stderr so they appear in the terminal
                        stderr_chunks.append(chunk_data)
                        logs.append({"type": "error", "data": chunk_data, "ts": ts})
                        yield _sse_event("stderr", {"data": chunk_data})

                    elif chunk_type == "log":
                        logs.append({"type": "log", "data": chunk_data, "ts": ts})
                        yield _sse_event("log", {"data": chunk_data})

                    else:
                        # Forward unknown event types transparently
                        yield _sse_event(chunk_type, {"data": chunk_data})

        # ── Execution finished successfully ──────────────────────────────
        final_status = "completed" if (exit_code is None or exit_code == 0) else "failed"

    except asyncio.CancelledError:
        final_status = "cancelled"
        logger.warning("Execution %s was cancelled.", execution_id)
        yield _sse_event("status", {"execution_id": execution_id, "status": "cancelled"})

    except Exception as exc:
        final_status = "failed"
        logger.exception("Execution %s failed: %s", execution_id, exc)
        yield _sse_event("error", {"execution_id": execution_id, "message": str(exc)})

    # ── Persist final state ──────────────────────────────────────────────
    try:
        execution = await get_execution(id=execution_id)
        execution.status = final_status
        execution.stdout = "".join(stdout_chunks)
        execution.stderr = "".join(stderr_chunks)
        execution.exit_code = exit_code
        execution.completed_at = dj_timezone.now()
        if execution.started_at:
            execution.duration = execution.completed_at - execution.started_at
        execution.logs = logs
        await save_execution(execution)
    except Exception as exc:
        logger.exception("Failed to persist execution %s: %s", execution_id, exc)

    yield _sse_event("status", {"execution_id": execution_id, "status": final_status})
    yield _sse_event("done", {"execution_id": execution_id})


# ── Async execute view (SSE streaming) ───────────────────────────────────────

@csrf_exempt
async def execute_script(request):
    """
    POST /api/execution-engine/run/

    Native async Django view so that StreamingHttpResponse can consume
    the async generator directly (requires ASGI server, e.g. uvicorn/daphne).
    """
    if request.method != "POST":
        return _json_response(False, "Method not allowed.", status_code=405)

    # ── Auth check ────────────────────────────────────────────────────────
    user = getattr(request, "user", None)
    if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
        return _json_response(False, "Authentication required.", status_code=401)

    # ── Throttling ────────────────────────────────────────────────────────
    from asgiref.sync import sync_to_async
    check_burst = sync_to_async(_check_throttle)
    check_sustained = sync_to_async(_check_throttle)

    if not await check_burst(request, ExecutionBurstThrottle):
        return _json_response(False, "Rate limit exceeded.", status_code=429)
    if not await check_sustained(request, ExecutionSustainedThrottle):
        return _json_response(False, "Rate limit exceeded.", status_code=429)

    # ── Parse & validate request body ────────────────────────────────────
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, Exception):
        return _json_response(False, "Invalid JSON body.", status_code=400)

    serializer = ScriptExecutionRequestSerializer(data=body)
    if not serializer.is_valid():
        return _json_response(
            False,
            "Invalid request data.",
            errors=serializer.errors,
            status_code=400,
        )

    data = serializer.validated_data
    script_details = data["script_details"]
    vault_details = data["vault_details"]
    inputs = data.get("inputs", {})

    # ── Fetch and validate ownership (sync ORM via sync_to_async) ────────
    get_vault = sync_to_async(Vault.objects.get)
    get_server = sync_to_async(Server.objects.get)
    get_credential = sync_to_async(Credential.objects.get)
    get_script = sync_to_async(Script.objects.get)
    create_execution = sync_to_async(ScriptExecution.objects.create)

    try:
        vault = await get_vault(id=vault_details["vault_id"], owner=user)
    except Vault.DoesNotExist:
        return _json_response(False, "Vault not found or access denied.", status_code=404)

    try:
        server = await get_server(id=vault_details["server_id"], vault=vault)
    except Server.DoesNotExist:
        return _json_response(False, "Server not found in vault.", status_code=404)

    try:
        credential = await get_credential(id=vault_details["credential_id"], vault=vault)
    except Credential.DoesNotExist:
        return _json_response(False, "Credential not found in vault.", status_code=404)

    try:
        script = await get_script(id=script_details["script_id"], owner=user)
    except Script.DoesNotExist:
        return _json_response(False, "Script not found or access denied.", status_code=404)

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
            "host": server.host,
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
        return _json_response(
            False,
            "Execution worker URL is not configured.",
            status_code=503,
        )

    # ── Return async SSE stream ───────────────────────────────────────────
    streaming_response = StreamingHttpResponse(
        _stream_execution(str(execution.id), worker_payload),
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

    from .serializers import ScriptExecutionHistorySerializer
    
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
