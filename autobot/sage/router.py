"""HTTP/WebSocket entry point for Sage.

Every route authenticates with a SageCode key via `require_sage_auth` (or, for
the WebSocket, `authenticate_api_key` on the handshake). The only
unauthenticated routes in Autobot stay /health/ and the bounded public docs path.
"""

from fastapi import APIRouter, Depends, Request

from sage.auth import SageAuth, require_sage_auth
from settings import get_settings
from throttling import limiter

router = APIRouter(prefix="/sage", tags=["sage"])


@router.get("/whoami/")
@limiter.limit(get_settings().SAGE_RATE_LIMIT)
async def whoami(request: Request, auth: SageAuth = Depends(require_sage_auth)):
    """Authenticated canary: proves a SageCode key gets through to Sage."""
    return {"service": "sage", "session_id": auth.session_id}
