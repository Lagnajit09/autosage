from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, validator
import httpx
import logging
import uvicorn
import bleach
import re
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

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

class ExecutionRequest(BaseModel):
    blob_url: str
    server_address: str
    credentials: dict

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
            
            # TODO: Parse and validate script content
            
            return {
                "success": True,
                "message": "Script content fetched successfully",
                "data": {
                    "script_content": script_content,
                    "server_address": exec_request.server_address
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