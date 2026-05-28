"""Proxy router: forwards /threads, /settings to Django.

Every endpoint here is a thin pass-through:
  1. Require auth (`Depends(require_auth)`) — returns 401 on missing/invalid JWT.
  2. Call Django's matching `/api/autobot/*` endpoint with the user's
     forwarded JWT (`auth.raw_jwt`).
  3. Return Django's response (envelope + status) verbatim.

Why proxy at all instead of letting the frontend hit Django directly?
─────────────────────────────────────────────────────────────────────
The chat endpoint needs to load the thread state, call the LLM,
persist new messages, update cache, and stream tokens back — all in a
single autobot request. Having a clean persistence layer inside autobot
turns that loop into one coherent async function rather than an awkward
cross-service dance. Also: the frontend hits one base URL (`/api/ai/`)
for everything chat-related instead of straddling two services.

Security
────────
• Per-user authorization is enforced exactly once, in Django, off the
  forwarded JWT. Autobot does no authorization checks here — Django's
  `IsAuthenticated` + per-user queryset filtering remain the source of
  truth. If Django says 403 / 404, autobot relays it as-is.
• The JWT is NEVER logged: the persistence client uses headers (which
  the redactor scrubs from any DEBUG-level httpx output) and never
  embeds it in URLs or log message bodies.
• Django's existing rate-limits (Autobot* throttles, T04) apply at the
  upstream — autobot doesn't double-throttle here.
"""

from __future__ import annotations

import json as _json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from auth import AuthContext, require_auth
from conversation.persistence import DjangoUnavailable, get_django_client

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────


async def _safe_json(request: Request) -> Any | None:
    """Read the request body as JSON. Return None on empty body.

    Bubbles a 400 on malformed JSON so the client sees a clean error
    rather than Django getting a corrupt forward.
    """
    body = await request.body()
    if not body:
        return None
    try:
        return _json.loads(body)
    except _json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON body: {e.msg}",
        ) from e


async def _proxy(
    method: str,
    path: str,
    auth: AuthContext,
    *,
    json_body: Any | None = None,
    params: dict[str, Any] | None = None,
) -> JSONResponse:
    """Forward to Django and return its envelope + status verbatim."""
    client = get_django_client()
    try:
        upstream_status, body = await client.request(
            method=method,
            path=path,
            jwt=auth.raw_jwt,
            json_body=json_body,
            params=params,
        )
    except DjangoUnavailable as e:
        logger.error("Django proxy failed: method=%s path=%s err=%s",
                     method, path, e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service temporarily unavailable.",
        ) from e
    return JSONResponse(content=body, status_code=upstream_status)


# ── Threads ──────────────────────────────────────────────────────────


@router.get("/threads/")
async def list_threads(
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    """List the caller's threads. Forwards query params (page, page_size,
    is_archived) to Django, which handles pagination + filtering."""
    return await _proxy(
        "GET", "/api/autobot/threads/", auth,
        params=dict(request.query_params),
    )


@router.post("/threads/")
async def create_thread(
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    """Create a new thread. Body shape: `{title?, llm_config?, ...}` —
    Django validates fields and rejects cross-user llm_config FKs."""
    body = await _safe_json(request)
    return await _proxy(
        "POST", "/api/autobot/threads/", auth, json_body=body,
    )


@router.get("/threads/{thread_id}/")
async def get_thread(
    thread_id: str,
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    """Retrieve a single thread. 404 from Django if not owned by caller."""
    return await _proxy(
        "GET", f"/api/autobot/threads/{thread_id}/", auth,
        params=dict(request.query_params),
    )


@router.patch("/threads/{thread_id}/")
async def patch_thread(
    thread_id: str,
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    """Update thread fields (rename, archive, change llm_config)."""
    body = await _safe_json(request)
    return await _proxy(
        "PATCH", f"/api/autobot/threads/{thread_id}/", auth, json_body=body,
    )


@router.delete("/threads/{thread_id}/")
async def delete_thread(
    thread_id: str,
    auth: AuthContext = Depends(require_auth),
):
    """Hard-delete the thread (cascades to messages + summaries in Django)."""
    return await _proxy(
        "DELETE", f"/api/autobot/threads/{thread_id}/", auth,
    )


# ── Settings ─────────────────────────────────────────────────────────


@router.get("/settings/")
async def get_user_settings(
    auth: AuthContext = Depends(require_auth),
):
    """Retrieve user's autobot settings. Django auto-creates the row
    with defaults on first call."""
    return await _proxy("GET", "/api/autobot/settings/", auth)


@router.patch("/settings/")
async def patch_user_settings(
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    """Update user's autobot settings. Django validates `default_llm_config`
    belongs to the caller."""
    body = await _safe_json(request)
    return await _proxy(
        "PATCH", "/api/autobot/settings/", auth, json_body=body,
    )
