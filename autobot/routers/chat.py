"""Chat router: non-streaming message endpoint.

Flow for a single user turn (no tools, no streaming yet — T13/T14 add those):

  1. Verify Clerk JWT (Depends(require_auth)) — 401s before any DB I/O.
  2. Load the thread from Django (`GET /api/autobot/threads/<id>/`).
     This is also the per-user auth check: Django scopes by request.user
     and returns 404 for any thread the caller doesn't own. We pass that
     status through verbatim.
  3. Load recent message history from Django for LLM context.
  4. Persist the new user message via Django (`POST .../messages/`).
     `client_id`, if supplied, makes the POST idempotent (T07 contract).
  5. Resolve the admin LLM provider/model/key and call `litellm.acompletion`.
  6. Persist the assistant reply via Django with token-usage metadata.
  7. Return the persisted assistant message in Django's envelope shape.

History-window note: T12 fetches the first page of size 50 from Django.
Threads longer than that will not see all prior context yet — T13 adds
the Redis hot-context cache and T16 adds proper token-budgeted windowing
+ summarization. The non-streaming endpoint here is the simplest possible
correct version; the SSE endpoint (T13) will become the primary path.
"""

from __future__ import annotations

import json as _json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from auth import AuthContext, require_auth
from conversation.persistence import DjangoUnavailable, get_django_client
from llm.client import LLMError, acomplete, resolve_admin

logger = logging.getLogger(__name__)
router = APIRouter()

# Max recent messages pulled from Django for LLM context. T13/T16 will
# replace this with a Redis-backed sliding window + summarizer.
_HISTORY_PAGE_SIZE = 50

# Roles LiteLLM understands. Anything else in the persisted history is
# skipped before the LLM call (defensive — Message.role is enum-bound at
# the model layer, so this is belt-and-suspenders).
_LLM_ROLES = {"user", "assistant", "system", "tool"}

# Default system prompt. Moves to llm/prompts.py in T14 alongside tool
# guidance. Per-thread override on Thread.system_prompt_override wins.
_DEFAULT_SYSTEM_PROMPT = (
    "You are Autobot, the AI assistant inside the Autosage automation "
    "platform. Be concise, accurate, and helpful. When you don't know "
    "something, say so plainly rather than guessing."
)


def _envelope(
    success: bool,
    message: str,
    *,
    data: Any = None,
    errors: Any = None,
    status_code: int = 200,
) -> JSONResponse:
    """Match Django's api_response envelope so the client sees one shape."""
    return JSONResponse(
        status_code=status_code,
        content={
            "success": success,
            "message": message,
            "data": data,
            "errors": errors,
        },
    )


async def _read_message_body(request: Request) -> dict[str, Any]:
    """Validate the inbound JSON body. Raises 400 on shape errors."""
    body = await request.body()
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request body is required.",
        )
    try:
        parsed = _json.loads(body)
    except _json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON body: {e.msg}",
        ) from e
    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="JSON body must be an object.",
        )
    content = parsed.get("content")
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="`content` is required and must be a non-empty string.",
        )
    return parsed


def _build_llm_messages(
    thread: dict[str, Any],
    history: list[dict[str, Any]],
    new_user_content: str,
) -> list[dict[str, Any]]:
    """Assemble the messages list passed to litellm.

    Order: [system, ...history (chronological), new user]. History from
    Django comes back ASC by created_at (T07 view orders that way), so no
    reversal is needed. The newly-persisted user message MAY appear in the
    history slice too if our list-then-create ordering left a race window
    open — guard against duplication by appending `new_user_content` only
    if it isn't already the most recent entry.
    """
    system_prompt = (
        thread.get("system_prompt_override")
        or _DEFAULT_SYSTEM_PROMPT
    )
    out: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
    ]
    for m in history:
        role = m.get("role")
        content = m.get("content")
        if role in _LLM_ROLES and isinstance(content, str) and content:
            out.append({"role": role, "content": content})

    # If history already ends with the new user turn (because we listed
    # AFTER persisting the user message), don't duplicate it.
    if not (
        out
        and out[-1]["role"] == "user"
        and out[-1]["content"] == new_user_content
    ):
        out.append({"role": "user", "content": new_user_content})
    return out


@router.post("/threads/{thread_id}/messages/")
async def post_message(
    thread_id: str,
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    """Non-streaming chat turn.

    Request body: `{"content": str, "content_type"?: str, "client_id"?: str}`
    Response: Django envelope wrapping the persisted assistant Message.
    """
    body = await _read_message_body(request)
    content: str = body["content"]
    # Django's Message.content_type accepts only the MIME forms
    # ("text/plain", "text/markdown"). User-typed input defaults to
    # text/plain; LLM output is always treated as text/markdown below.
    content_type: str = body.get("content_type") or "text/plain"
    client_id: str | None = body.get("client_id")

    client = get_django_client()

    # 1. Load thread (this is the per-user auth check; Django 404s if not owned).
    try:
        s, thread_env = await client.request(
            method="GET",
            path=f"/api/autobot/threads/{thread_id}/",
            jwt=auth.raw_jwt,
        )
    except DjangoUnavailable as e:
        logger.error("Storage unreachable during thread fetch: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service temporarily unavailable.",
        ) from e
    if s != 200:
        return JSONResponse(content=thread_env, status_code=s)
    thread = (thread_env or {}).get("data") or {}

    # 2. Persist the user message BEFORE the LLM call. If the LLM fails,
    #    the user's turn is still recorded — they can retry without losing
    #    what they typed. Idempotent on `client_id` (T07 contract).
    user_payload: dict[str, Any] = {
        "role": "user",
        "content": content,
        "content_type": content_type,
    }
    if client_id:
        user_payload["client_id"] = client_id
    try:
        s, _user_env = await client.request(
            method="POST",
            path=f"/api/autobot/threads/{thread_id}/messages/",
            jwt=auth.raw_jwt,
            json_body=user_payload,
        )
    except DjangoUnavailable as e:
        logger.error("Storage unreachable during user-message persist: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service temporarily unavailable.",
        ) from e
    if s not in (200, 201):
        return JSONResponse(content=_user_env, status_code=s)

    # 3. Load history AFTER user-persist so the LLM sees its own turn last.
    try:
        s, hist_env = await client.request(
            method="GET",
            path=f"/api/autobot/threads/{thread_id}/messages/",
            jwt=auth.raw_jwt,
            params={"page": "1", "page_size": str(_HISTORY_PAGE_SIZE)},
        )
    except DjangoUnavailable as e:
        logger.error("Storage unreachable during history fetch: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service temporarily unavailable.",
        ) from e
    if s != 200:
        return JSONResponse(content=hist_env, status_code=s)
    history_data = (hist_env or {}).get("data") or {}
    history_list = (
        history_data.get("messages", [])
        if isinstance(history_data, dict) else []
    )

    # 4. Resolve provider/model/key. T17 will branch on
    #    Thread.llm_config / UserSettings.default_llm_config here.
    try:
        resolution = resolve_admin()
    except LLMError as e:
        logger.error("LLM resolution failed: %s", e)
        return _envelope(
            success=False,
            message="LLM provider is not configured.",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # 5. Call the LLM.
    llm_messages = _build_llm_messages(thread, history_list, content)
    try:
        result = await acomplete(llm_messages, resolution)
    except LLMError as e:
        logger.error(
            "LLM call failed (provider=%s, model=%s): %s",
            resolution.provider, resolution.model_name, e,
        )
        # User's message is already persisted; the LLM failure surfaces
        # as a 502 so the client can retry without re-sending the user msg.
        return _envelope(
            success=False,
            message="The LLM provider is temporarily unavailable. Please try again.",
            status_code=status.HTTP_502_BAD_GATEWAY,
        )

    # 6. Persist the assistant reply with token usage.
    #    LLMs emit markdown by default; we store as text/markdown so the
    #    frontend renders code fences, lists, and inline formatting.
    assistant_payload: dict[str, Any] = {
        "role": "assistant",
        "content": result["content"],
        "content_type": "text/markdown",
        "provider": result["provider"],
        "model_name": result["model_name"],
        "prompt_tokens": result["prompt_tokens"],
        "completion_tokens": result["completion_tokens"],
        "total_tokens": result["total_tokens"],
    }
    try:
        s, assistant_env = await client.request(
            method="POST",
            path=f"/api/autobot/threads/{thread_id}/messages/",
            jwt=auth.raw_jwt,
            json_body=assistant_payload,
        )
    except DjangoUnavailable as e:
        logger.error("Storage unreachable during assistant-message persist: %s", e)
        # We have the assistant reply in memory but can't persist it.
        # Surface as 503 — client should retry the whole turn; idempotency
        # via client_id on the user message prevents double-recording.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service temporarily unavailable.",
        ) from e

    # Pass Django's envelope + status through verbatim.
    return JSONResponse(content=assistant_env, status_code=s)
