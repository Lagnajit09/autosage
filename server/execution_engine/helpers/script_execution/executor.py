import json
import logging
import asyncio
import httpx
from django.utils import timezone as dj_timezone
from asgiref.sync import sync_to_async

from execution_engine.models import ScriptExecution
from execution_engine.helpers.gcs import upload_execution_logs
from execution_engine.helpers.script_execution.utils import sse_event
from execution_engine.helpers.script_execution.worker import EXEC_WORKER_URL, build_worker_headers

logger = logging.getLogger(__name__)

async def stream_execution(execution_id: str, payload: dict):
    """
    Async generator that:
    1. Sends the execution request to the exec-worker (streaming response).
    2. Yields SSE events for each chunk / status update received.
    3. Persists final result to the ScriptExecution record.
    """
    get_execution = sync_to_async(ScriptExecution.objects.get)
    save_execution = sync_to_async(lambda obj: obj.save())

    # ── Initial "started" event ──────────────────────────────────────────
    yield sse_event("status", {"execution_id": execution_id, "status": "running"})

    # Update DB: mark as running
    try:
        execution = await get_execution(id=execution_id)
        execution.status = "running"
        execution.started_at = dj_timezone.now()
        await save_execution(execution)
    except ScriptExecution.DoesNotExist:
        yield sse_event("error", {"message": "Execution record not found."})
        return

    stdout_chunks = []
    stderr_chunks = []
    logs = []
    exit_code = None
    final_status = "failed"

    try:
        # ── Call exec-worker ──────────────────────────────────────────
        # Build headers on a thread so the synchronous google-auth call
        # doesn't block the event loop in PROD.
        worker_headers = await sync_to_async(build_worker_headers)()

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                EXEC_WORKER_URL,
                json=payload,
                headers=worker_headers,
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
                        yield sse_event("exit_code", {"exit_code": exit_code})
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
                        yield sse_event("stdout", {"data": chunk_data})

                    elif chunk_type == "stderr":
                        stderr_chunks.append(chunk_data)
                        logs.append({"type": "stderr", "data": chunk_data, "ts": ts})
                        yield sse_event("stderr", {"data": chunk_data})

                    elif chunk_type == "error":
                        # Worker-level errors (SSH failure, fetch error, etc.)
                        # Surface as stderr so they appear in the terminal
                        stderr_chunks.append(chunk_data)
                        logs.append({"type": "error", "data": chunk_data, "ts": ts})
                        yield sse_event("stderr", {"data": chunk_data})

                    elif chunk_type == "log":
                        logs.append({"type": "log", "data": chunk_data, "ts": ts})
                        yield sse_event("log", {"data": chunk_data})

                    else:
                        # Forward unknown event types transparently
                        yield sse_event(chunk_type, {"data": chunk_data})

        # ── Execution finished successfully ──────────────────────────────
        if exit_code == -1:
            final_status = "cancelled"
            yield sse_event("status", {"execution_id": execution_id, "status": "cancelled"})
        else:
            final_status = "completed" if (exit_code is None or exit_code == 0) else "failed"

    except asyncio.CancelledError:
        final_status = "cancelled"
        logger.warning("Execution %s was cancelled.", execution_id)
        yield sse_event("status", {"execution_id": execution_id, "status": "cancelled"})

    except Exception as exc:
        final_status = "failed"
        error_msg = f"Worker Error: {str(exc)}"
        stderr_chunks.append(error_msg)
        ts = dj_timezone.now().isoformat()
        logs.append({"type": "error", "data": error_msg, "ts": ts})
        
        logger.exception("Execution %s failed: %s", execution_id, exc)
        yield sse_event("error", {"execution_id": execution_id, "message": error_msg})

    # ── Upload logs to GCS and persist final state ────────────────────────
    try:
        execution = await get_execution(id=execution_id)
        stdout_text = "\n".join(stdout_chunks)
        stderr_text = "\n".join(stderr_chunks)

        # Upload logs to GCS in a thread (GCS SDK is synchronous)
        loop = asyncio.get_event_loop()
        user_id = execution.user_id
        gcs_urls = await loop.run_in_executor(
            None,
            upload_execution_logs,
            user_id,
            execution_id,
            stdout_text,
            stderr_text,
            logs,
        )

        execution.status = final_status
        execution.stdout_log_url = gcs_urls["stdout_log_url"]
        execution.stderr_log_url = gcs_urls["stderr_log_url"]
        execution.logs_url       = gcs_urls["logs_url"]
        execution.exit_code = exit_code
        execution.completed_at = dj_timezone.now()
        if execution.started_at:
            execution.duration = execution.completed_at - execution.started_at
        await save_execution(execution)

    except Exception as exc:
        logger.exception("Failed to persist/upload execution %s: %s", execution_id, exc)

    yield sse_event("status", {"execution_id": execution_id, "status": final_status})
    yield sse_event("done", {"execution_id": execution_id})
