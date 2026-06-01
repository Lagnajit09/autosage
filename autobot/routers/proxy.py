"""Proxy router: forwards /threads, /settings to Django.

Per-user authorization is enforced exactly once, in Django, off the
forwarded JWT. Autobot does no authorization checks here — if Django
says 403/404, autobot relays it as-is.

This proxy exists so the frontend hits one base URL (`/api/ai/`) for
everything chat-related, and so the chat endpoint can load state + call
LLM + persist messages + update cache in one coherent async function.
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


async def _safe_json(request: Request) -> Any | None:
    """Read the request body as JSON; return None on empty body, 400 on malformed."""
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


@router.get("/threads/")
async def list_threads(
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    return await _proxy(
        "GET", "/api/autobot/threads/", auth,
        params=dict(request.query_params),
    )


@router.post("/threads/")
async def create_thread(
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
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
    body = await _safe_json(request)
    return await _proxy(
        "PATCH", f"/api/autobot/threads/{thread_id}/", auth, json_body=body,
    )


@router.delete("/threads/{thread_id}/")
async def delete_thread(
    thread_id: str,
    auth: AuthContext = Depends(require_auth),
):
    return await _proxy(
        "DELETE", f"/api/autobot/threads/{thread_id}/", auth,
    )


# Read-only — writes happen via the chat endpoints since each write is
# interleaved with an LLM call. This exists so the frontend can load
# existing history on thread-open before subscribing to the live stream.
@router.get("/threads/{thread_id}/messages/")
async def list_messages(
    thread_id: str,
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    return await _proxy(
        "GET", f"/api/autobot/threads/{thread_id}/messages/", auth,
        params=dict(request.query_params),
    )


@router.get("/settings/")
async def get_user_settings(
    auth: AuthContext = Depends(require_auth),
):
    return await _proxy("GET", "/api/autobot/settings/", auth)


@router.patch("/settings/")
async def patch_user_settings(
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    body = await _safe_json(request)
    return await _proxy(
        "PATCH", "/api/autobot/settings/", auth, json_body=body,
    )
