"""HTTP/WebSocket entry point for Sage.

Every route authenticates with a SageCode key via `require_sage_auth` (or, for
the WebSocket, `authenticate_api_key` on the handshake). The only
unauthenticated routes in Autobot stay /health/ and the bounded public docs path.
"""

import asyncio
import json

from fastapi import APIRouter, Depends, Request, WebSocket

from sage.auth import API_KEY_HEADER, SageAuth, SageAuthError, authenticate_api_key, require_sage_auth
from sage.conversation import CLOSE_FORBIDDEN, CLOSE_TRY_AGAIN, CLOSE_UNAUTHENTICATED, serve
from settings import get_settings
from throttling import limiter

router = APIRouter(prefix="/sage", tags=["sage"])


@router.get("/whoami/")
@limiter.limit(get_settings().SAGE_RATE_LIMIT)
async def whoami(request: Request, auth: SageAuth = Depends(require_sage_auth)):
    """Authenticated canary: proves a SageCode key gets through to Sage."""
    return {"service": "sage", "session_id": auth.session_id}


@router.websocket("/ws")
async def sage_socket(websocket: WebSocket):
    """The SageCode agent session (protocol: sage/conversation.py).

    Terminal-only: browsers always send an Origin header on a WebSocket
    handshake and SageCode never does, so any Origin is refused before
    accepting. (A browser couldn't present the X-API-Key header anyway.)
    """
    if websocket.headers.get("origin"):
        await websocket.close(code=CLOSE_FORBIDDEN)
        return
    await websocket.accept()

    lock = asyncio.Lock()           # the turn task and the read loop both send

    async def send(frame: dict) -> None:
        async with lock:
            await websocket.send_text(json.dumps(frame))

    try:
        auth = await authenticate_api_key(websocket.headers.get(API_KEY_HEADER), websocket.headers)
    except SageAuthError as e:
        unauthenticated = e.status_code == 401
        await send({"type": "error", "fatal": True, "message": e.detail,
                    "code": "unauthenticated" if unauthenticated else "unavailable"})
        await websocket.close(code=CLOSE_UNAUTHENTICATED if unauthenticated else CLOSE_TRY_AGAIN)
        return

    await serve(websocket, auth, send)
