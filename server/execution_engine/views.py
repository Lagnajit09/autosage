import json
import logging
import asyncio
from datetime import datetime, timezone

import httpx
from django.http import StreamingHttpResponse
from django.utils import timezone as dj_timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from vault.models import Vault, Server, Credential
from scripts.models import Script
from .models import ScriptExecution
from .serializers import ScriptExecutionRequestSerializer
from server.utils import api_response
from server.rate_limiters import ExecutionBurstThrottle, ExecutionSustainedThrottle

logger = logging.getLogger(__name__)

# Execution Worker endpoint
import os
from django.conf import settings

EXEC_WORKER_URL = getattr(settings, "EXEC_WORKER_URL", os.getenv("EXEC_WORKER_URL", ""))
WORKER_API_KEY = getattr(settings, "WORKER_API_KEY", os.getenv("WORKER_API_KEY", ""))


# SSE helpers
def _sse_event(event: str, data: dict) -> str:
    """Format a Server-Sent Event frame."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# Core async generator – streams execution updates to the client
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
                    if not line:
                        continue

                    try:
                        chunk: dict = json.loads(line)
                    except json.JSONDecodeError:
                        # Plain text line – treat as stdout
                        chunk = {"type": "stdout", "data": line}

                    chunk_type = chunk.get("type", "stdout")
                    chunk_data = chunk.get("data", "")

                    if chunk_type == "stdout":
                        stdout_chunks.append(chunk_data)
                        logs.append({"type": "stdout", "data": chunk_data, "ts": dj_timezone.now().isoformat()})
                        yield _sse_event("stdout", {"data": chunk_data})

                    elif chunk_type == "stderr":
                        stderr_chunks.append(chunk_data)
                        logs.append({"type": "stderr", "data": chunk_data, "ts": dj_timezone.now().isoformat()})
                        yield _sse_event("stderr", {"data": chunk_data})

                    elif chunk_type == "exit_code":
                        exit_code = int(chunk_data)
                        yield _sse_event("exit_code", {"exit_code": exit_code})

                    elif chunk_type == "log":
                        logs.append({"type": "log", "data": chunk_data, "ts": dj_timezone.now().isoformat()})
                        yield _sse_event("log", {"data": chunk_data})

                    else:
                        # Forward unknown event types transparently
                        yield _sse_event(chunk_type, chunk)

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


# View
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def execute_script(request):
    """
    POST /executions/run/
    """
    # ── Throttling ───────────────────────────────────────────────────
    for throttle in [ExecutionBurstThrottle(), ExecutionSustainedThrottle()]:
        if not throttle.allow_request(request, execute_script):
            return api_response(
                success=False,
                message="Rate limit exceeded.",
                status_code=status.HTTP_429_TOO_MANY_REQUESTS
            )

    serializer = ScriptExecutionRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return api_response(
            success=False,
            message="Invalid request data.",
            errors=serializer.errors,
            status_code=status.HTTP_400_BAD_REQUEST
        )

    data = serializer.validated_data
    script_details = data["script_details"]
    vault_details = data["vault_details"]
    inputs = data.get("inputs", {})

    # ── Fetch and Validate Ownership ─────────────────────────────────────
    try:
        # Check vault ownership
        vault = Vault.objects.get(id=vault_details["vault_id"], owner=request.user)
        
        # Check server and credential belong to this user AND this vault
        server = Server.objects.get(id=vault_details["server_id"], vault=vault)
        credential = Credential.objects.get(id=vault_details["credential_id"], vault=vault)
        
        # Check script ownership
        script = Script.objects.get(id=script_details["script_id"], owner=request.user)
        
    except Vault.DoesNotExist:
        return api_response(success=False, message="Vault not found or access denied.", status_code=status.HTTP_404_NOT_FOUND)
    except Server.DoesNotExist:
        return api_response(success=False, message="Server not found in vault.", status_code=status.HTTP_404_NOT_FOUND)
    except Credential.DoesNotExist:
        return api_response(success=False, message="Credential not found in vault.", status_code=status.HTTP_404_NOT_FOUND)
    except Script.DoesNotExist:
        return api_response(success=False, message="Script not found or access denied.", status_code=status.HTTP_404_NOT_FOUND)

    # ── Create execution record ──────────────────────────────────────────
    execution = ScriptExecution.objects.create(
        script=script,
        vault=vault,
        server=server,
        credential=credential,
        user=request.user,
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
            "port": server.port or (5985 if server.connection_method == 'winrm' else 22),
            "connection_method": server.connection_method,
        },
        "credentials": {
            "username": credential.username or "",
            "password": credential.password or "",
            "ssh_key": credential.ssh_key or "",
            "key_passphrase": credential.key_passphrase or "",
        },
        "inputs": inputs,
    }

    # ── Validate exec-worker URL is configured ───────────────────────────
    if not EXEC_WORKER_URL:
        execution.status = "failed"
        execution.stderr = "EXEC_WORKER_URL is not configured."
        execution.save()
        return api_response(
            success=False,
            message="Execution worker URL is not configured.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    # ── Stream SSE response ──────────────────────────────────────────────
    async def event_stream():
        async for chunk in _stream_execution(str(execution.id), worker_payload):
            yield chunk

    streaming_response = StreamingHttpResponse(
        event_stream(),
        content_type="text/event-stream",
    )
    streaming_response["Cache-Control"] = "no-cache"
    streaming_response["X-Accel-Buffering"] = "no"
    streaming_response["X-Execution-Id"] = str(execution.id)
    return streaming_response


# Status endpoint – lightweight poll fallback
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def execution_status(request, execution_id):
    """
    GET /executions/<execution_id>/status/
    """
    # ── Throttling ───────────────────────────────────────────────────
    for throttle in [ExecutionBurstThrottle(), ExecutionSustainedThrottle()]:
        if not throttle.allow_request(request, execution_status):
            return api_response(
                success=False,
                message="Rate limit exceeded.",
                status_code=status.HTTP_429_TOO_MANY_REQUESTS
            )

    try:
        execution = ScriptExecution.objects.get(id=execution_id, user=request.user)
    except ScriptExecution.DoesNotExist:
        return api_response(
            success=False,
            message="Execution record not found or access denied.",
            status_code=status.HTTP_404_NOT_FOUND
        )

    from .serializers import ScriptExecutionResponseSerializer
    return api_response(
        success=True,
        message="Execution status retrieved successfully.",
        data=ScriptExecutionResponseSerializer(execution).data
    )