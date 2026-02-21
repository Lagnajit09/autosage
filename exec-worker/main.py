from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, validator
from typing import Optional
import httpx
import logging
import uvicorn
import bleach
import re
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from executors import ShellExecutor

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Rate Limiter
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Execution Worker")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

def sanitize_input(text: str) -> str:
    """Sanitize input to prevent XSS and other injection attacks."""
    if not isinstance(text, str):
        return text
    # Remove HTML tags using bleach
    clean_text = bleach.clean(text, tags=[], strip=True)
    return clean_text

class Credentials(BaseModel):
    username: str
    password: Optional[str] = None
    ssh_key: Optional[str] = None
    key_passphrase: Optional[str] = None
    port: int = 22

    @validator('ssh_key', always=True)
    def require_auth_method(cls, v, values):
        if not v and not values.get('password'):
            raise ValueError('Either password or ssh_key must be provided')
        return v

class ExecutionRequest(BaseModel):
    blob_url: str
    server_address: str
    credentials: Credentials

    @validator('blob_url', 'server_address')
    def validate_and_sanitize(cls, v):
        # Basic URL/Address validation
        if not v or len(v) > 2048:
            raise ValueError("Invalid length for input field")
        
        # Sanitize to prevent XSS
        sanitized = sanitize_input(v)
        
        # Simple SSRF protection: Ensure blob_url looks like a valid Vercel Blob or secure URL
        # Note: In a real production app, you'd want to whitelist specific domains
        if 'blob' in sanitized and not sanitized.startswith(('http://', 'https://')):
             raise ValueError("URL must start with http or https")
            
        return sanitized

@app.get("/")
@limiter.limit("10/minute")
async def root(request: Request):
    return {"message": "Execution microservice ready"}

@app.post("/execute")
@limiter.limit("5/minute")
async def execute_script(request: Request, exec_request: ExecutionRequest):
    logger.info(f"Received execution request for blob: {exec_request.blob_url}")
    
    try:
        # Fetch content from Vercel Blob
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(exec_request.blob_url)
            
            if response.status_code != 200:
                logger.error(f"Failed to fetch script: Status {response.status_code}")
                raise HTTPException(
                    status_code=500, 
                    detail=f"Failed to fetch script content from storage. Status code: {response.status_code}"
                )
            
            script_content = response.text

        # Execute script on remote server via SSH
        executor = ShellExecutor(
            host=exec_request.server_address,
            username=exec_request.credentials.username,
            password=exec_request.credentials.password,
            ssh_key=exec_request.credentials.ssh_key,
            key_passphrase=exec_request.credentials.key_passphrase,
            port=exec_request.credentials.port,
        )

        result = executor.run(script_content)

        if result.error:
            logger.error(f"Execution error: {result.error}")
            raise HTTPException(status_code=502, detail=result.error)

        return {
            "success": result.success,
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
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8020)