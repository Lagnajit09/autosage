"""
Execution Worker – FastAPI microservice.

Receives script execution requests from the Django server and streams
real-time stdout/stderr back as NDJSON (one JSON object per line).

Supported targets:
  • Linux / Unix  – executes via SSH/bash  (ShellExecutor / Paramiko)
  • Windows       – executes via WinRM/PowerShell  (PowerShellExecutor / pywinrm)

Stream format:
    {"type": "stdout",    "data": "<line text>"}
    {"type": "stderr",    "data": "<line text>"}
    {"type": "exit_code", "data": <int>}
    {"type": "error",     "data": "<error message>"}
"""

import json
import logging
import os
from typing import AsyncGenerator, Dict, Any, Literal, Optional

import uvicorn
import bleach
import httpx
from google.cloud import storage
from google.cloud.exceptions import GoogleCloudError
from google.api_core.exceptions import NotFound
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Header, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from executors import ShellExecutor, PowerShellExecutor

load_dotenv(override=True)

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Inter-service API Key ─────────────────────────────────────────────────────
WORKER_API_KEY = os.getenv("WORKER_API_KEY", "")
STOP_EVENTS: Dict[str, asyncio.Event] = {}

# ── Environment ───────────────────────────────────────────────────────────────
ENVIRONMENT = os.getenv("ENVIRONMENT", "DEV").upper()


def build_gcs_client() -> storage.Client:
    """
    Return an authenticated GCS client.

    PROD  → Application Default Credentials (ADC).
            Cloud Run automatically provides the credentials of the service
            account attached to the revision — no key file needed.

    DEV   → Explicit service-account JSON key file located at the path
            set in GOOGLE_APPLICATION_CREDENTIALS.
    """
    if ENVIRONMENT == "PROD":
        logger.info("GCS auth: using Application Default Credentials (PROD)")
        return storage.Client()
    else:
        key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
        if not key_path:
            raise RuntimeError(
                "GOOGLE_APPLICATION_CREDENTIALS is not set. "
                "Set it to the path of your service-account JSON key file for DEV."
            )
        logger.info("GCS auth: using key file at %s (DEV)", key_path)
        from google.oauth2 import service_account
        credentials = service_account.Credentials.from_service_account_file(
            key_path,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        return storage.Client(credentials=credentials)


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
    # SSH port (Linux).  Ignored for Windows targets.
    port: int = 22
    # Connection method reported by Django ("ssh" or "winrm").
    # If not provided we fall back to os_type.
    connection_method: str = "ssh"
    # Explicit OS type – "linux" (default) or "windows".
    os_type: Literal["linux", "windows"] = "linux"
    # WinRM-specific settings (only used when os_type == "windows")
    winrm_port: int = 5985          # 5985 = HTTP, 5986 = HTTPS
    winrm_use_ssl: bool = False     # True → connect over HTTPS
    winrm_transport: str = "ntlm"  # "ntlm" | "basic" | "kerberos"

    @validator("os_type", always=True, pre=True)
    def infer_os_type(cls, v, values):
        """
        If os_type was not sent, try to infer it from connection_method so
        that older Django payloads ("connection_method": "winrm") still work.
        """
        if v:
            return v
        method = values.get("connection_method", "ssh")
        return "windows" if method in ("winrm", "powershell") else "linux"


class Credentials(BaseModel):
    username: str
    password: Optional[str] = None
    ssh_key: Optional[str] = None
    key_passphrase: Optional[str] = None

    # Validation is now deferred to the executor so that Windows targets
    # (which only use password) don't need to supply an SSH key.
    @validator("password", always=True)
    def require_at_least_one_auth(cls, v, values):
        # We only enforce the minimal requirement here; the executor will
        # raise its own error if a required field is missing.
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


# ── Executor factory ──────────────────────────────────────────────────────────

def build_executor(req: ExecutionRequest):
    """
    Return the appropriate executor instance based on server.os_type.

    Linux  → ShellExecutor  (SSH + bash)
    Windows → PowerShellExecutor  (WinRM + PowerShell)
    """
    server = req.server
    creds  = req.credentials

    if server.os_type == "windows":
        if not creds.password:
            raise ValueError(
                "Windows/WinRM execution requires a password. "
                "SSH key authentication is not supported for Windows targets."
            )
        return PowerShellExecutor(
            host=server.host,
            port=server.winrm_port,
            username=creds.username,
            password=creds.password,
            use_ssl=server.winrm_use_ssl,
            transport=server.winrm_transport,
        )

    # Default: Linux via SSH
    if not creds.password and not creds.ssh_key:
        raise ValueError(
            "Linux/SSH execution requires either a password or an SSH private key."
        )

    return ShellExecutor(
        host=server.host,
        port=server.port,
        username=creds.username,
        password=creds.password or None,
        ssh_key=creds.ssh_key or None,
        key_passphrase=creds.key_passphrase or None,
    )


@app.post("/api/worker/stop/{execution_id}")
async def stop_execution(
    execution_id: str,
    _: None = Depends(verify_api_key),
):
    """Signal a running execution to stop."""
    if execution_id in STOP_EVENTS:
        logger.info("Setting stop event for execution_id=%s", execution_id)
        STOP_EVENTS[execution_id].set()
        return {"message": "Stop signal sent", "execution_id": execution_id}
    else:
        logger.warning("Stop signal received for unknown execution_id=%s", execution_id)
        return {"message": "Execution not found or already finished", "execution_id": execution_id}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
@limiter.limit("10/minute")
async def health(request: Request):
    return {"message": "Execution microservice is healthy.", "status": "healthy", "version": "1.0.0", "timestamp": datetime.now().isoformat()}


@app.post("/api/worker/execute")
@limiter.limit("5/minute")
async def execute_script(
    request: Request,
    exec_request: ExecutionRequest,
    _: None = Depends(verify_api_key),
):
    """
    Stream script execution output as NDJSON.

    Automatically dispatches to the correct executor:
      • Linux servers  → SSH + bash (ShellExecutor)
      • Windows servers → WinRM + PowerShell (PowerShellExecutor)

    Each line in the response body is a JSON object:
        {"type": "stdout",    "data": "hello world"}
        {"type": "stderr",    "data": "some warning"}
        {"type": "exit_code", "data": 0}
        {"type": "error",     "data": "connection refused"}

    The Django server consumes this stream and re-emits it as SSE to the
    frontend client, allowing a real-time terminal view.
    """
    logger.info(
        "Streaming execution: id=%s script=%s server=%s os=%s",
        exec_request.execution_id,
        exec_request.script.name,
        exec_request.server.host,
        exec_request.server.os_type,
    )

    async def generate() -> AsyncGenerator[str, None]:
        # ── 1. Fetch script content from GCS ──────────────────────
        try:
            # blob_url format: https://storage.googleapis.com/bucket-name/path/to/blob
            # Or we can use the pathname and assume a bucket if it's not in the URL
            bucket_name = "autosagex-drive"
            blob_url = exec_request.script.blob_url
            
            # Extract bucket and path from GCS URL if it's in that format
            if "storage.googleapis.com" in blob_url:
                parts = blob_url.replace("https://storage.googleapis.com/", "").split("/", 1)
                if len(parts) == 2:
                    bucket_name = parts[0]
                    blob_path = parts[1]
                else:
                    blob_path = exec_request.script.pathname
            else:
                blob_path = exec_request.script.pathname

            logger.info("Fetching script from GCS: bucket=%s path=%s", bucket_name, blob_path)

            # Initialize client based on current environment
            storage_client = build_gcs_client()
            bucket = storage_client.bucket(bucket_name)
            blob = bucket.blob(blob_path)
            
            # Use run_in_executor for synchronous storage call
            loop = asyncio.get_event_loop()
            script_content = await loop.run_in_executor(None, blob.download_as_text)

        except NotFound:
            yield ndjson({"type": "error", "data": "Script file not found in cloud storage."})
            return
        except GoogleCloudError as e:
            yield ndjson({"type": "error", "data": f"Cloud storage error: {e}"})
            return
        except Exception as e:
            logger.exception("Failed to fetch script from GCS")
            yield ndjson({"type": "error", "data": f"Unexpected error fetching script: {e}"})
            return

        logger.info(
            "Fetched script '%s' (%d bytes)", exec_request.script.name, len(script_content)
        )

        # ── 2. Build executor & stream execution ──────────────────────────
        try:
            executor = build_executor(exec_request)
            stop_event = asyncio.Event()
            STOP_EVENTS[exec_request.execution_id] = stop_event
        except ValueError as e:
            yield ndjson({"type": "error", "data": str(e)})
            return

        try:
            async for chunk in executor.stream(script_content, stop_event=stop_event):
                # chunk = {"type": "stdout"|"stderr"|"exit_code"|"error", "data": ...}
                line = ndjson(chunk)
                logger.debug("Chunk: %s", line.strip())
                yield line

        except Exception as e:
            logger.exception("Unexpected error during streaming: %s", e)
            yield ndjson({"type": "error", "data": f"Unexpected error: {e}"})
        finally:
            STOP_EVENTS.pop(exec_request.execution_id, None)

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