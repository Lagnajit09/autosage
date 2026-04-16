import os
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

# Execution Worker configuration
EXEC_WORKER_URL = getattr(settings, "EXEC_WORKER_URL", os.getenv("EXEC_WORKER_URL", ""))
WORKER_API_KEY = getattr(settings, "WORKER_API_KEY", os.getenv("WORKER_API_KEY", ""))
# ENVIRONMENT=PROD  → attach an OIDC identity token (Google Cloud IAM).
# ENVIRONMENT=DEV   → skip OIDC; plain X-API-Key is enough on localhost.
ENVIRONMENT = getattr(settings, "ENVIRONMENT", os.getenv("ENVIRONMENT", "")).upper().strip()
# Audience must equal the Cloud Run service root URL (no trailing path).
EXEC_WORKER_AUDIENCE = getattr(settings, "EXEC_WORKER_AUDIENCE", os.getenv("EXEC_WORKER_AUDIENCE", ""))

# Ensure the URL always has a scheme (guard against bare host/IP in env vars)
if EXEC_WORKER_URL and not EXEC_WORKER_URL.startswith(("http://", "https://")):
    EXEC_WORKER_URL = f"http://{EXEC_WORKER_URL}"

def get_oidc_token(audience: str) -> str:
    """
    Fetch a short-lived OIDC identity token for the given audience using
    Application Default Credentials (ADC).
    """
    from google.auth.transport.requests import Request as GoogleAuthRequest
    from google.oauth2 import id_token

    if not audience and EXEC_WORKER_URL:
        # Auto-derive audience from the worker URL if not explicitly provided
        from urllib.parse import urlparse
        parsed = urlparse(EXEC_WORKER_URL)
        audience = f"{parsed.scheme}://{parsed.netloc}"
        logger.info("Derived OIDC audience from worker URL: %s", audience)

    if not audience:
        raise ValueError("Cannot fetch OIDC token: audience is missing and could not be derived.")

    return id_token.fetch_id_token(GoogleAuthRequest(), audience)

def build_worker_headers(include_content_type: bool = True) -> dict:
    """
    Build the HTTP headers for a call to the exec-worker.
    """
    headers: dict = {"X-API-Key": WORKER_API_KEY}
    if include_content_type:
        headers["Content-Type"] = "application/json"
    
    if ENVIRONMENT == "PROD":
        try:
            token = get_oidc_token(EXEC_WORKER_AUDIENCE)
            headers["Authorization"] = f"Bearer {token}"
            logger.debug("Attached OIDC token to request headers (PROD)")
        except Exception as e:
            logger.error("Failed to fetch OIDC token for exec-worker: %s", str(e))
    else:
        logger.warning("Skipping OIDC token (ENVIRONMENT=%r) — requests to Cloud Run will be unauthenticated", ENVIRONMENT)
        
    return headers
