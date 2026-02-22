"""
Execution Worker – FastAPI microservice.

Receives script execution requests from the Django server and streams
real-time stdout/stderr back as NDJSON (one JSON object per line).

Stream format:
    {"type": "stdout",    "data": "<line text>"}
    {"type": "stderr",    "data": "<line text>"}
    {"type": "exit_code", "data": <int>}
    {"type": "error",     "data": "<error message>"}
"""

import json
import logging
import os
from typing import AsyncGenerator, Dict, Any, Optional

import uvicorn
import bleach
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Header, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from executors import ShellExecutor

load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Inter-service API Key ─────────────────────────────────────────────────────
WORKER_API_KEY = os.getenv("WORKER_API_KEY", "")


async def verify_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    """Verify the inter-service API key from the Django server."""
    if not WORKER_API_KEY:
        logger.error("WORKER_API_KEY is not configured on the worker")
        raise HTTPException(status_code=500, detail="Worker API key not configured")
    if x_api_key != WORKER_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


# ── App setup ─────────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Execution Worker")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── Utilities ─────────────────────────────────────────────────────────────────

def sanitize_input(text: str) -> str:
    """Sanitize input to prevent XSS and injection attacks."""
    if not isinstance(text, str):
        return text
    return bleach.clean(text, tags=[], strip=True)


def ndjson(chunk: dict) -> str:
    """Serialize a dict to a single NDJSON line (JSON + newline)."""
    return json.dumps(chunk, ensure_ascii=False) + "\n"


# ── Request models ────────────────────────────────────────────────────────────

class ScriptInfo(BaseModel):
    id: str
    name: str
    pathname: str
    blob_url: str


class ServerInfo(BaseModel):
    id: str
    host: str
    port: int = 22
    connection_method: str = "ssh"


class Credentials(BaseModel):
    username: str
    password: Optional[str] = None
    ssh_key: Optional[str] = None
    key_passphrase: Optional[str] = None

    @validator("ssh_key", always=True)
    def require_auth_method(cls, v, values):
        if not v and not values.get("password"):
            raise ValueError("Either password or ssh_key must be provided")
        return v


class ExecutionRequest(BaseModel):
    execution_id: str
    script: ScriptInfo
    server: ServerInfo
    credentials: Credentials
    inputs: Dict[str, Any] = {}

    @validator("execution_id")
    def validate_execution_id(cls, v):
        if not v or len(v) > 255:
            raise ValueError("Invalid execution_id")
        return sanitize_input(v)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
@limiter.limit("10/minute")
async def root(request: Request):
    return {"message": "Execution microservice ready"}


@app.post("/api/worker/execute")
@limiter.limit("5/minute")
async def execute_script(
    request: Request,
    exec_request: ExecutionRequest,
    _: None = Depends(verify_api_key),
):
    """
    Stream script execution output as NDJSON.

    Each line in the response body is a JSON object:
        {"type": "stdout",    "data": "hello world"}
        {"type": "stderr",    "data": "some warning"}
        {"type": "exit_code", "data": 0}
        {"type": "error",     "data": "connection refused"}

    The Django server consumes this stream and re-emits it as SSE to the
    frontend client, allowing a real-time terminal view.
    """
    logger.info(
        "Streaming execution: id=%s script=%s server=%s",
        exec_request.execution_id,
        exec_request.script.name,
        exec_request.server.host,
    )

    async def generate() -> AsyncGenerator[str, None]:
        # ── 1. Fetch script content from Vercel Blob ──────────────────────
        try:
            async with httpx.AsyncClient(timeout=30.0) as http:
                resp = await http.get(exec_request.script.blob_url)
                if resp.status_code != 200:
                    yield ndjson({
                        "type": "error",
                        "data": f"Failed to fetch script (HTTP {resp.status_code})",
                    })
                    return
                script_content = resp.text
        except httpx.TimeoutException:
            yield ndjson({"type": "error", "data": "Timed out fetching script content."})
            return
        except httpx.RequestError as e:
            yield ndjson({"type": "error", "data": f"Failed to fetch script: {e}"})
            return

        logger.info(
            "Fetched script '%s' (%d bytes)", exec_request.script.name, len(script_content)
        )

        # ── 2. Stream execution over SSH ──────────────────────────────────
        executor = ShellExecutor(
            host=exec_request.server.host,
            port=exec_request.server.port,
            username=exec_request.credentials.username,
            password=exec_request.credentials.password or None,
            ssh_key=exec_request.credentials.ssh_key or None,
            key_passphrase=exec_request.credentials.key_passphrase or None,
        )

        try:
            async for chunk in executor.stream(script_content):
                # chunk = {"type": "stdout"|"stderr"|"exit_code"|"error", "data": ...}
                line = ndjson(chunk)
                logger.debug("Chunk: %s", line.strip())
                yield line

        except Exception as e:
            logger.exception("Unexpected error during streaming: %s", e)
            yield ndjson({"type": "error", "data": f"Unexpected error: {e}"})

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={
            # Prevent any proxy/nginx from buffering the stream
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
        },
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8020)