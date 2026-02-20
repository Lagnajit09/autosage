from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
import logging
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Execution Worker")

class ExecutionRequest(BaseModel):
    blob_url: str
    server_address: str
    credentials: dict

@app.get("/")
async def root():
    return {"message": "Execution microservice ready"}

@app.post("/execute")
async def execute_script(request: ExecutionRequest):
    logger.info(f"Received execution request for blob: {request.blob_url}")
    
    try:
        # Fetch content from Vercel Blob
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(request.blob_url)
            
            if response.status_code != 200:
                logger.error(f"Failed to fetch script: Status {response.status_code}")
                raise HTTPException(
                    status_code=500, 
                    detail=f"Failed to fetch script content from storage. Status code: {response.status_code}"
                )
            
            script_content = response.text
            
            # For now, we just return the content as requested (first step)
            return {
                "success": True,
                "message": "Script content fetched successfully",
                "data": {
                    "script_content": script_content,
                    "server_address": request.server_address
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