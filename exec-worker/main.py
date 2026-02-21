from fastapi import FastAPI, HTTPException, Request, Header, Depends
from pydantic import BaseModel, validator
from typing import Optional, Dict, Any
import httpx
import logging
import uvicorn
import bleach
import os
from dotenv import load_dotenv

load_dotenv()
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from executors import ShellExecutor

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Inter-service API Key ────────────────────────────────────────────────────
# Both Django and exec-worker must share this secret key
WORKER_API_KEY = os.getenv("WORKER_API_KEY", "")

async def verify_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    """Verify the inter-service API key from the Django server."""
    if not WORKER_API_KEY:
        logger.error("WORKER_API_KEY is not configured on the worker")
        raise HTTPException(status_code=500, detail="Worker API key not configured")
    if x_api_key != WORKER_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

# Initialize Rate Limiter
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Execution Worker")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def sanitize_input(text: str) -> str:
    """Sanitize input to prevent XSS and other injection attacks."""
    if not isinstance(text, str):
        return text
    clean_text = bleach.clean(text, tags=[], strip=True)
    return clean_text


# ── Request Models (synced with Django execution_engine payload) ─────────────

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

    @validator('ssh_key', always=True)
    def require_auth_method(cls, v, values):
        if not v and not values.get('password'):
            raise ValueError('Either password or ssh_key must be provided')
        return v

class ExecutionRequest(BaseModel):
    execution_id: str
    script: ScriptInfo
    server: ServerInfo
    credentials: Credentials
    inputs: Dict[str, Any] = {}

    @validator('execution_id')
    def validate_execution_id(cls, v):
        if not v or len(v) > 255:
            raise ValueError("Invalid execution_id")
        return sanitize_input(v)


# ── Endpoints ────────────────────────────────────────────────────────────────

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
    logger.info(
        "Received execution request: execution_id=%s, script=%s, server=%s",
        exec_request.execution_id,
        exec_request.script.name,
        exec_request.server.host,
    )

    try:
        # ── 1. Fetch script content from Vercel Blob ─────────────────────
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(exec_request.script.blob_url)

            if response.status_code != 200:
                logger.error(f"Failed to fetch script: Status {response.status_code}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to fetch script content from storage. Status code: {response.status_code}"
                )

            script_content = response.text

        # ── 2. Execute script on remote server via SSH ───────────────────
        executor = ShellExecutor(
            host=exec_request.server.host,
            username=exec_request.credentials.username,
            password=exec_request.credentials.password,
            ssh_key=exec_request.credentials.ssh_key,
            key_passphrase=exec_request.credentials.key_passphrase,
            port=exec_request.server.port,
        )

        result = executor.run(script_content)

        if result.error:
            logger.error(f"Execution error: {result.error}")
            return {
                "success": False,
                "execution_id": exec_request.execution_id,
                "message": result.error,
                "data": {
                    "exit_code": result.exit_code,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                }
            }

        return {
            "success": result.success,
            "execution_id": exec_request.execution_id,
            "message": "Script executed successfully" if result.success else "Script execution failed",
            "data": {
                "exit_code": result.exit_code,
                "stdout": result.stdout,
                "stderr": result.stderr,
            }
        }

    except httpx.TimeoutException:
        logger.error("Timeout fetching script content")
        raise HTTPException(status_code=504, detail="Request to fetch script content timed out.")
    except httpx.RequestError as e:
        logger.error(f"Error fetching script: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch script content: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8020)