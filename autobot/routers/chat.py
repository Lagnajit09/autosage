"""Chat router: non-streaming message endpoint.

Flow for a single user turn (no tools, no streaming yet — T13/T14 add those):

  1. Verify Clerk JWT (Depends(require_auth)) — 401s before any DB I/O.
  2. Persist the new user message via Django (`POST .../messages/`).
     This is ALSO the per-user authorization check: Django's
     MessageListCreateView calls `_get_thread_or_404` before saving, so
     any thread the caller doesn't own returns 404 with no data leak
     and no DB write. Saving first also guarantees the user's typed
     input survives an LLM failure (they can retry without re-typing).
     `client_id`, if supplied, makes the POST idempotent (T07 contract).
  3. Fetch thread metadata + recent history in PARALLEL via
     `asyncio.gather`. Thread is needed for `system_prompt_override`
     (and T17 will read `llm_config` here too). History is the LLM's
     short-term memory. Parallel cuts ~25% off wall-clock latency.
  4. Resolve the admin LLM provider/model/key and call `litellm.acompletion`.
  5. Persist the assistant reply via Django with token-usage metadata.
  6. Return the persisted assistant message in Django's envelope shape.

System prompt composition: the per-thread `system_prompt_override`
APPENDS to the base prompt rather than replacing it. This is so power
users can layer custom rules ("answer in Spanish", "no code blocks")
without losing Autosage's domain context (workflows, scripts, triggers,
vault — to be expanded in T14's `llm/prompts.py`).

History-window note: T12 fetches the first page of size 20 from Django.
Threads longer than that will not see all prior context yet — T13 adds
the Redis hot-context cache and T16 adds proper token-budgeted windowing
+ summarization. The non-streaming endpoint here is the simplest possible
correct version; the SSE endpoint (T13) will become the primary path.
"""

from __future__ import annotations

import asyncio
import json as _json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, StreamingResponse

from auth import AuthContext, require_auth
from conversation.cache import get_cache
from conversation.persistence import DjangoUnavailable, get_django_client
from conversation.summarizer import (
    count_message_tokens,
    count_tokens,
    get_model_context_window,
    load_latest_summary,
    persist_summary,
    precompact_tool_results,
    summarize_to_text,
)
from llm.client import (
    LLMError,
    LLMResolution,
    acomplete,
    astream_complete,
    resolve_for_thread,
)
from llm.prompts import get_system_prompt
from llm.tools import dispatch_tool, get_tool_schemas
from settings import get_settings
from streaming.sse import (
    sse_done,
    sse_error,
    sse_stream_start,
    sse_token,
    sse_tool_call_start,
    sse_tool_result,
)
from streaming.stream_registry import get_stream_registry
from throttling import limiter

logger = logging.getLogger(__name__)
router = APIRouter()

# Max recent messages pulled from Django for LLM context. T13/T16 will
# replace this with a Redis-backed sliding window + summarizer. 20 turns
# × ~150 tokens average ≈ 3k tokens — plenty of memory for the LLM
# without bloating prompt cost on every turn.
_HISTORY_PAGE_SIZE = 20

# Roles LiteLLM understands. Anything else in the persisted history is
# skipped before the LLM call (defensive — Message.role is enum-bound at
# the model layer, so this is belt-and-suspenders).
_LLM_ROLES = {"user", "assistant", "system", "tool"}

# Base system prompt lives in `llm/prompts.py` (single source of truth
# for Autobot's persona + Autosage domain grounding). The per-thread
# override composition is handled by `get_system_prompt(user_customizations=...)`.


# Tools that mutate Django state. After a successful invocation we
# invalidate the thread's hot-context cache (`autobot:thread:<id>:ctx`)
# so the next chat turn re-hydrates from Postgres and sees the new
# row. The ctx cache itself isn't populated yet (T11 set up the helpers
# but no producer wires them); this hook is the prep so we can flip
# ctx caching on without auditing every tool.
_WRITE_TOOL_NAMES = {
    "create_script",
    "update_script",
    "create_workflow",
    "update_workflow",
}


# Per-user rate limit on the streaming chat endpoint (T18). 30/minute
# is generous for interactive use and conservative against runaway
# clients. Plain `acompletion` (non-streaming) endpoint is rarely used
# and gets the same limit for parity.
_CHAT_RATE_LIMIT = "30/minute"


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
    *,
    summary_text: str = "",
    mode: str = "",
) -> list[dict[str, Any]]:
    """Assemble the messages list passed to litellm.

    Order: [system, ...history (chronological), new user]. History should
    already be in ASC by created_at; the chat router reverses Django's
    `?ordering=-created_at` response before passing it here. The newly-
    persisted user message will appear in the history slice (we list
    AFTER persisting); the dedup guard at the end skips re-appending it.

    Tool-call history reconstruction
    ────────────────────────────────
    When the previous turn used tools, the persisted Django messages
    look like:
      • assistant — may have empty `content` but carries a non-empty
                    `tool_calls` array describing which tools to invoke.
      • tool      — `tool_call_id` references the matching entry in the
                    preceding assistant's `tool_calls`. `content` is the
                    JSON-encoded tool result.
    We MUST forward `tool_calls` and `tool_call_id` here. Without them,
    LiteLLM's Gemini transformer (and OpenAI's tool-protocol validator)
    sees an orphan `role: "tool"` and aborts with
    "Missing corresponding tool call for tool response message".

    System-prompt composition: `get_system_prompt` in `llm/prompts.py`
    owns the base Autosage grounding and APPENDS the per-thread
    `system_prompt_override` under a `## User customizations` heading.
    The override never replaces the base — losing the Autosage grounding
    would let the LLM hallucinate workflow shapes, script templates, or
    trigger semantics.

    Summary block (T16): when `summary_text` is non-empty, it's appended
    to the system prompt under an `## Earlier conversation summary`
    heading. Combining both into one system message (rather than two
    separate `role: system` entries) keeps the prompt clean and avoids
    provider-specific weirdness around multi-system messages.
    """
    system_prompt = get_system_prompt(
        user_customizations=thread.get("system_prompt_override") or "",
        mode=mode,
    )
    if summary_text:
        system_prompt = (
            f"{system_prompt}\n\n## Earlier conversation summary\n\n"
            f"{summary_text}\n\n"
            "Use the summary above as context for the messages that follow. "
            "Reference any ids or names from the summary exactly as written."
        )

    out: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
    ]
    # Tracks tool_call ids announced by assistant messages but not yet
    # consumed by a tool-result message. Used to drop orphan `role:
    # "tool"` entries (defensive — should not happen with correct
    # persistence, but a stray orphan would crash the LLM call).
    pending_tool_call_ids: set[str] = set()

    # ── Trim leading orphan messages ──────────────────────────────────
    # The recent-N fetch (T16: `ordering=-created_at&page_size=20`) can
    # land its cut MID-TURN. If the oldest message in our window is an
    # assistant message (with or without tool_calls), or a tool message,
    # we have an orphan prefix: there's no `user` turn for it to anchor
    # against. Gemini enforces this strictly:
    #   "function call turn comes immediately after a user turn or
    #    after a function response turn"
    # So we walk forward to the first `user` and drop everything before
    # it. OpenAI is more lenient but we apply the same rule for parity.
    first_user_idx: int | None = None
    for i, m in enumerate(history):
        if m.get("role") == "user":
            first_user_idx = i
            break
    if first_user_idx is None:
        # No user turn in the fetched window — likely a thread where
        # the latest messages are all assistant/tool with the originating
        # user paginated off. Drop history entirely and let the new user
        # message be the only non-system content. The LLM has the
        # summary (if any) for older context.
        if history:
            logger.warning(
                "History window contained no user turn — dropping all %d "
                "fetched messages and proceeding with new turn only",
                len(history),
            )
        history = []
    elif first_user_idx > 0:
        logger.info(
            "Trimming %d leading orphan messages (history started mid-turn)",
            first_user_idx,
        )
        history = history[first_user_idx:]

    for m in history:
        role = m.get("role")
        if role not in _LLM_ROLES:
            continue
        content = m.get("content") or ""

        if role == "assistant":
            raw_tool_calls = m.get("tool_calls")
            tool_calls = (
                raw_tool_calls if isinstance(raw_tool_calls, list) else []
            )
            # Drop empty assistant turns (no text, no tool_calls).
            if not content and not tool_calls:
                continue
            entry: dict[str, Any] = {"role": "assistant", "content": content}
            if tool_calls:
                entry["tool_calls"] = tool_calls
                for tc in tool_calls:
                    if isinstance(tc, dict) and tc.get("id"):
                        pending_tool_call_ids.add(tc["id"])
            out.append(entry)

        elif role == "tool":
            tool_call_id = m.get("tool_call_id") or ""
            if not tool_call_id or tool_call_id not in pending_tool_call_ids:
                # Orphan tool message — no preceding assistant tool_call
                # to bind it to. Silently skip; including it would 400
                # the next LLM call.
                logger.warning(
                    "Skipping orphan tool message (tool_call_id=%r)",
                    tool_call_id,
                )
                continue
            pending_tool_call_ids.discard(tool_call_id)
            out.append({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": content,
            })

        else:  # user / system
            if content:
                out.append({"role": role, "content": content})

    # If history already ends with the new user turn (because we listed
    # AFTER persisting the user message), don't duplicate it.
    if not (
        out
        and out[-1].get("role") == "user"
        and out[-1].get("content") == new_user_content
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
    # Optional Research/Generation/Execution mode hint from the UI. Used
    # only to bias the system prompt — unknown values are ignored.
    mode: str = body.get("mode") or ""

    client = get_django_client()

    # 1. Persist the user message first. This single call does double
    #    duty: it's both the data write AND the per-user authorization
    #    check. Django's MessageListCreateView.create runs
    #    `_get_thread_or_404(user=request.user)` before any save, so
    #    posting to a thread the caller doesn't own returns 404 here
    #    with no leak and no DB write. Persisting first also means the
    #    user's typed input survives an LLM failure — they can retry
    #    without re-typing. Idempotent on `client_id` (T07 contract).
    user_payload: dict[str, Any] = {
        "role": "user",
        "content": content,
        "content_type": content_type,
    }
    if client_id:
        user_payload["client_id"] = client_id
    try:
        s, user_env = await client.request(
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
        # 401, 403, 404, validation — return Django's envelope verbatim.
        return JSONResponse(content=user_env, status_code=s)

    # 2. Fetch thread metadata + recent history in PARALLEL. We need:
    #     • thread.system_prompt_override → composes the system prompt
    #     • thread.llm_config (T17)        → BYO provider override
    #     • history                        → LLM short-term memory
    #    Parallelizing cuts wall-clock latency: max(thread, history)
    #    instead of sum(thread, history). At this point auth has
    #    already passed (step 1), so neither fetch should 404 — but we
    #    still surface any non-200 in case of a between-call deletion.
    try:
        (thread_status, thread_env), (hist_status, hist_env), (settings_status, settings_env) = await asyncio.gather(
            client.request(
                method="GET",
                path=f"/api/autobot/threads/{thread_id}/",
                jwt=auth.raw_jwt,
            ),
            client.request(
                method="GET",
                path=f"/api/autobot/threads/{thread_id}/messages/",
                jwt=auth.raw_jwt,
                params={"page": "1", "page_size": str(_HISTORY_PAGE_SIZE)},
            ),
            client.request(
                method="GET",
                path="/api/autobot/settings/",
                jwt=auth.raw_jwt,
            ),
        )
    except DjangoUnavailable as e:
        logger.error("Storage unreachable during thread+history+settings fetch: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service temporarily unavailable.",
        ) from e
    if thread_status != 200:
        return JSONResponse(content=thread_env, status_code=thread_status)
    if hist_status != 200:
        return JSONResponse(content=hist_env, status_code=hist_status)

    thread = (thread_env or {}).get("data") or {}
    history_data = (hist_env or {}).get("data") or {}
    history_list = (
        history_data.get("messages", [])
        if isinstance(history_data, dict) else []
    )
    user_settings = (
        (settings_env or {}).get("data") or {}
        if settings_status == 200 else {}
    )

    # 3. Resolve provider/model/key. T17: per-thread Thread.llm_config >
    #    per-user UserSettings.default_llm_config > admin keys.
    #    T18a: returns a list (BYO → 1 element, admin → primary +
    #    fallbacks). The non-streaming endpoint doesn't bother with
    #    fallback — it's the deprecated path and a single attempt is
    #    fine. Pick the primary; let any error propagate as a 502.
    try:
        resolutions = await resolve_for_thread(
            jwt=auth.raw_jwt,
            thread=thread,
            user_settings=user_settings,
        )
    except LLMError as e:
        logger.error("LLM resolution failed: %s", e)
        return _envelope(
            success=False,
            message="LLM provider is not configured.",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    if not resolutions:
        return _envelope(
            success=False,
            message="LLM provider is not configured.",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    resolution = resolutions[0]

    # 4. Call the LLM.
    llm_messages = _build_llm_messages(
        thread, history_list, content, mode=mode,
    )
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

    # 5. Persist the assistant reply with token usage.
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


# ── Streaming endpoint (T13) ──────────────────────────────────────────


@router.post("/threads/{thread_id}/messages/stream/")
@limiter.limit(_CHAT_RATE_LIMIT)
async def post_message_stream(
    thread_id: str,
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    """Streaming chat turn via Server-Sent Events.

    Request body: ``{"content": str, "content_type"?: str, "client_id"?: str}``
    Response: ``text/event-stream`` with the following event sequence:

      • Exactly one ``event: stream_start`` frame with the `stream_id`
        the client uses for mid-stream token refresh (T18).
      • Zero or more ``event: token`` frames with ``{"content": "<delta>"}``.
      • Optional interleaved ``event: tool_call_start`` / ``event:
        tool_result`` frames during tool-using turns (T14).
      • Exactly one terminal frame, either:
            ``event: done``   with the persisted assistant message dict
            ``event: error``  with ``{"message": "...", "code": "..."}``

    The flow mirrors the non-streaming endpoint, with one important
    difference: the user-message POST happens BEFORE we start streaming,
    so any 4xx (404 unknown thread, 401 expired JWT, 422 validation)
    surfaces as a normal HTTP error code with a JSON body. Once we
    return the StreamingResponse, the HTTP status is committed to 200
    and runtime failures can only be reported as ``event: error``
    frames — which is how SSE clients are expected to handle them.

    Auth note: the upfront `POST /messages/` is the per-user check.
    Django's `_get_thread_or_404` rejects cross-user thread IDs with a
    plain 404; we surface that verbatim before any streaming begins.

    Token refresh (T18): every Django call inside the streaming
    generator reads `auth_handle.raw_jwt`, NOT `auth.raw_jwt`. The
    handle is mutable — the `/token-refresh/` endpoint swaps in a
    fresh `AuthContext` mid-stream when the original expires.
    """
    body = await _read_message_body(request)
    content: str = body["content"]
    content_type: str = body.get("content_type") or "text/plain"
    client_id: str | None = body.get("client_id")
    # Optional Research/Generation/Execution mode hint from the UI.
    # Closure-captured by the streaming generator below and passed to
    # `_build_llm_messages` so the LLM sees a mode-specific addendum
    # appended to its system prompt for this turn only.
    mode: str = body.get("mode") or ""

    client = get_django_client()

    # 1. Persist the user message. Also the auth check (see docstring).
    #    Done OUTSIDE the streaming generator so we can return a normal
    #    HTTP error code on failure.
    user_payload: dict[str, Any] = {
        "role": "user",
        "content": content,
        "content_type": content_type,
    }
    if client_id:
        user_payload["client_id"] = client_id
    try:
        s, user_env = await client.request(
            method="POST",
            path=f"/api/autobot/threads/{thread_id}/messages/",
            jwt=auth.raw_jwt,
            json_body=user_payload,
        )
    except DjangoUnavailable as e:
        logger.error(
            "Storage unreachable during streaming user-message persist: %s", e,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service temporarily unavailable.",
        ) from e
    if s not in (200, 201):
        return JSONResponse(content=user_env, status_code=s)

    # 2. Switch to streaming. From here on, any failure surfaces as an
    #    `event: error` frame on the already-open 200 response.
    #    Register the stream BEFORE entering the generator so we have
    #    a stream_id ready for the first frame. The handle is mutable —
    #    `/token-refresh/` rotates its inner AuthContext in-place; all
    #    subsequent Django reads use `auth_handle.raw_jwt` to pick up
    #    the new token.
    registry = get_stream_registry()
    stream_id, auth_handle = await registry.register(auth)

    async def event_stream():
        # 2a. First frame ALWAYS — gives the client the stream_id it
        #     needs to call /token-refresh/ if the JWT expires.
        yield sse_stream_start(stream_id, thread_id)

        # 2b. Fetch thread + history + settings in parallel.
        #     - history uses `ordering=-created_at` so page 1 returns
        #       the most RECENT N messages — we reverse them locally to
        #       chronological so `_build_llm_messages` sees turn order.
        #     - settings carries `default_llm_config` for T17 BYO
        #       resolution. The endpoint auto-creates the row on first
        #       GET, so it always returns 200; we still defensively
        #       treat a non-200 as "no settings, use admin".
        try:
            (ts, te), (hs, he), (us, ue) = await asyncio.gather(
                client.request(
                    method="GET",
                    path=f"/api/autobot/threads/{thread_id}/",
                    jwt=auth_handle.raw_jwt,
                ),
                client.request(
                    method="GET",
                    path=f"/api/autobot/threads/{thread_id}/messages/",
                    jwt=auth_handle.raw_jwt,
                    params={
                        "page": "1",
                        "page_size": str(_HISTORY_PAGE_SIZE),
                        "ordering": "-created_at",
                    },
                ),
                client.request(
                    method="GET",
                    path="/api/autobot/settings/",
                    jwt=auth_handle.raw_jwt,
                ),
            )
        except DjangoUnavailable as e:
            logger.error(
                "Storage unreachable during streaming thread+history+settings: %s",
                e,
            )
            yield sse_error(
                "Storage service temporarily unavailable.",
                code="storage_unavailable",
            )
            return
        if ts != 200:
            yield sse_error(
                "Failed to load thread.", code=f"thread_status_{ts}",
            )
            return
        if hs != 200:
            yield sse_error(
                "Failed to load message history.", code=f"history_status_{hs}",
            )
            return
        thread = (te or {}).get("data") or {}
        history_data = (he or {}).get("data") or {}
        history_list_raw = (
            history_data.get("messages", [])
            if isinstance(history_data, dict) else []
        )
        # Django returned DESC; reverse to chronological for the LLM.
        history_list = list(reversed(history_list_raw))
        user_settings = (ue or {}).get("data") or {} if us == 200 else {}

        # 2b. Resolve provider. T17: per-thread `Thread.llm_config` >
        #     per-user `UserSettings.default_llm_config` > admin keys.
        #     `resolve_for_thread` makes ONE Django reveal call if a
        #     user config is selected; falls back to admin on any
        #     failure (logged but non-fatal so a stale FK doesn't
        #     break chat).
        # T17 picks the (BYO | admin) path; T18a expands the admin path
        # into an ordered list of resolutions for round-1 fallback.
        try:
            resolutions = await resolve_for_thread(
                jwt=auth_handle.raw_jwt,
                thread=thread,
                user_settings=user_settings,
            )
        except LLMError as e:
            logger.error("LLM resolution failed during stream: %s", e)
            yield sse_error(
                "LLM provider is not configured.", code="llm_unconfigured",
            )
            return
        if not resolutions:
            yield sse_error(
                "No LLM provider is configured. Set an admin key in "
                "autobot.env or add a personal LLM key in Customize.",
                code="llm_unconfigured",
            )
            return
        # The primary is used for context-window math and summarization.
        # Fallback candidates may pick a different provider for the user-
        # facing chat call, but we don't re-compute the window — they're
        # all hosted models with comparable budgets at the level we care
        # about (60 % trigger).
        resolution = resolutions[0]

        # T18a: per-user daily quota gate on the ADMIN path. BYO turns
        # don't count (the user is paying their own way). The counter
        # ticks ONCE per chat turn, regardless of how many tool rounds
        # the LLM fans out into.
        settings = get_settings()
        if resolution.is_admin and settings.AUTOBOT_ADMIN_DAILY_LIMIT > 0:
            allowed, count = await get_cache().incr_admin_quota_for_today(
                auth_handle.user_sub,
                settings.AUTOBOT_ADMIN_DAILY_LIMIT,
            )
            if not allowed:
                yield sse_error(
                    f"You've used your daily allocation of "
                    f"{settings.AUTOBOT_ADMIN_DAILY_LIMIT} free LLM "
                    "calls. Add a personal LLM key in Customize to continue.",
                    code="admin_quota_exhausted",
                )
                return
            logger.info(
                "Admin quota tick: user_sub=%s count=%d/%d",
                auth_handle.user_sub, count,
                settings.AUTOBOT_ADMIN_DAILY_LIMIT,
            )

        # 2b'. Context-window management (T16).
        #      - Load any existing summary for this thread; only include
        #        messages newer than its `up_to_message` in raw history.
        #      - Pre-compact tool results > 2 KB to one-line digests
        #        in-memory (full content stays in Postgres).
        #      - If the assembled context still exceeds 60 % of the
        #        model window, summarize the OLD portion via a separate
        #        LLM call, persist a Django Summary row + Redis cache,
        #        and replace the old portion with the new summary.
        existing_summary = await load_latest_summary(thread_id, auth_handle.raw_jwt)
        existing_summary_text = (
            (existing_summary or {}).get("summary_text") or ""
        )
        if existing_summary:
            up_to_id = existing_summary.get("up_to_message")
            if up_to_id:
                # Drop any history entries already covered by the summary.
                # `up_to_message` is an inclusive cutoff — keep only
                # rows strictly newer than that.
                kept: list[dict[str, Any]] = []
                seen_cutoff = False
                for m in history_list:
                    if not seen_cutoff:
                        if m.get("id") == up_to_id:
                            seen_cutoff = True
                        continue
                    kept.append(m)
                # If the cutoff isn't in the fetched window (long-since
                # paginated off), assume EVERYTHING we fetched is newer
                # than the summary — keep as-is.
                if seen_cutoff:
                    history_list = kept

        # Tool-result compaction is cheap and almost always saves tokens.
        history_list = precompact_tool_results(history_list)

        # Build a tentative messages list to measure tokens.
        tentative = _build_llm_messages(
            thread, history_list, content,
            summary_text=existing_summary_text,
            mode=mode,
        )
        context_window = get_model_context_window(resolution.model_name)
        target_tokens = int(
            context_window * settings.AUTOBOT_CONTEXT_TARGET_RATIO,
        )
        current_tokens = count_message_tokens(tentative)

        # Trigger summarization if (a) we're over budget AND (b) we have
        # enough history to leave KEEP_LAST_N verbatim and still have
        # something OLDER to summarize.
        keep_n = settings.AUTOBOT_KEEP_LAST_N
        if current_tokens > target_tokens and len(history_list) > keep_n:
            to_summarize = history_list[:-keep_n]
            recent = history_list[-keep_n:]
            up_to_msg_id = (to_summarize[-1] or {}).get("id")
            try:
                new_summary_text = await summarize_to_text(
                    to_summarize, resolution,
                    existing_summary=existing_summary_text,
                )
            except LLMError as e:
                # Soft-fail — fall back to the pre-summarization context.
                # The provider may still accept it (tiktoken estimates
                # are approximate), and worst case the LLM call below
                # 400s and we surface that.
                logger.warning(
                    "Summarization LLM call failed; proceeding without: %s",
                    e,
                )
            else:
                # Persist to Django + Redis. Persistence failures are
                # non-fatal — we still use the new summary in-memory
                # for THIS turn so the LLM call below has the right
                # context budget; future turns just won't see it.
                if up_to_msg_id:
                    summary_tokens = count_message_tokens(
                        [{"role": "system", "content": new_summary_text}],
                    )
                    await persist_summary(
                        thread_id, auth_handle.raw_jwt,
                        summary_text=new_summary_text,
                        up_to_message_id=up_to_msg_id,
                        summary_tokens=summary_tokens,
                    )
                logger.info(
                    "Summarized %d old messages for thread %s (~%d tokens "
                    "→ ~%d-token summary)",
                    len(to_summarize), thread_id,
                    current_tokens, count_tokens(new_summary_text),
                )
                existing_summary_text = new_summary_text
                history_list = recent

        # 2c. Tool-call loop. Each iteration streams one LLM call; if
        #     the model emits tool_calls, dispatch them, append the
        #     results to the running conversation, and loop. Exit when
        #     the model returns a normal text reply or we hit the cap.
        llm_messages = _build_llm_messages(
            thread, history_list, content,
            summary_text=existing_summary_text,
            mode=mode,
        )
        tool_schemas = get_tool_schemas()
        max_rounds = settings.AUTOBOT_MAX_TOOL_ROUNDS

        # T18a: track which resolution actually succeeded on round 1.
        # Rounds 2+ stay pinned to that provider — we never swap mid-
        # tool-loop because the LLM's tool_calls memory is provider-
        # specific (different providers serialize tool_call ids
        # differently). `selected_resolution` becomes the active one
        # once we've committed to it.
        selected_resolution: LLMResolution | None = None

        for round_num in range(1, max_rounds + 1):
            accumulated = ""
            final_payload: dict[str, Any] | None = None

            # On round 1 with an admin chain we have multiple
            # candidates; on round 2+ or BYO, we have exactly one.
            if round_num == 1 and selected_resolution is None:
                candidates = resolutions
            else:
                # `selected_resolution` is set after round 1 succeeds.
                # If it's still None here (shouldn't happen — we'd have
                # already returned via sse_error), fall back to primary.
                candidates = [selected_resolution or resolution]

            stream_succeeded = False
            for cand_idx, cand in enumerate(candidates):
                attempt_yielded_token = False
                attempt_accumulated = ""
                attempt_final: dict[str, Any] | None = None
                try:
                    async for kind, payload in astream_complete(
                        llm_messages, cand, tools=tool_schemas,
                    ):
                        if kind == "token":
                            attempt_accumulated += payload
                            attempt_yielded_token = True
                            yield sse_token(payload)
                        elif kind == "done":
                            attempt_final = payload
                except LLMError as e:
                    # Salvage path: if the stream errored AFTER content
                    # was already delivered to the client, treat it as
                    # success. Real-world trigger: litellm 1.55.x's
                    # Databricks-shared chunk parser crashes on Groq's
                    # final usage-only chunk (`choices: []` is valid
                    # OpenAI protocol but the parser doesn't guard
                    # `choices[0]`). The full content reached the
                    # browser; we just need to persist it as the turn's
                    # answer so future turns see it in history. Token
                    # counts are zeroed since we lost the usage chunk —
                    # acceptable tradeoff.
                    if (
                        attempt_yielded_token
                        and attempt_accumulated
                        and attempt_final is None
                    ):
                        logger.warning(
                            "LLM stream errored after content was "
                            "delivered (provider=%s model=%s err=%s) — "
                            "salvaging accumulated reply",
                            cand.provider, cand.model_name, e,
                        )
                        attempt_final = {
                            "content": attempt_accumulated,
                            "tool_calls": [],
                            "provider": cand.provider,
                            "model_name": cand.model_name,
                            "prompt_tokens": 0,
                            "completion_tokens": 0,
                            "total_tokens": 0,
                        }
                        # Fall through to the success branch below.
                    else:
                        # No content yielded yet (or no content at all).
                        # Retryable + more candidates left = safe to
                        # try the next entry in the fallback chain.
                        # Anything else is terminal.
                        has_more = cand_idx < len(candidates) - 1
                        if (
                            e.retryable
                            and not attempt_yielded_token
                            and has_more
                        ):
                            logger.warning(
                                "Admin provider %s/%s failed (retryable): "
                                "%s — trying fallback",
                                cand.provider, cand.model_name, e,
                            )
                            continue
                        logger.error(
                            "LLM stream failed (round=%d, provider=%s, "
                            "model=%s): %s",
                            round_num, cand.provider, cand.model_name, e,
                        )
                        yield sse_error(
                            "The LLM provider is temporarily unavailable.",
                            code="llm_unavailable",
                        )
                        return

                # This candidate succeeded — commit its output to the
                # round-level variables and pin subsequent rounds to it.
                accumulated = attempt_accumulated
                final_payload = attempt_final
                selected_resolution = cand
                stream_succeeded = True
                if cand_idx > 0:
                    logger.info(
                        "Recovered via fallback after %d retries: "
                        "provider=%s model=%s",
                        cand_idx, cand.provider, cand.model_name,
                    )
                break

            if not stream_succeeded:
                # All candidates failed without a usable response. This
                # is reached only if every entry in the chain raised a
                # NON-retryable error or we ran out of fallbacks while
                # tokens had already been emitted. Either way, the user
                # has seen something useful — or nothing at all — and
                # there's no clean recovery beyond surfacing the error.
                yield sse_error(
                    "All admin LLM providers exhausted. Try again or "
                    "add a personal LLM key in Customize.",
                    code="all_llm_unavailable",
                )
                return

            # Defensive backstop — generator should always yield "done".
            if final_payload is None:
                final_payload = {
                    "content": accumulated,
                    "tool_calls": [],
                    "provider": resolution.provider,
                    "model_name": resolution.model_name,
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0,
                }
            tool_calls = final_payload.get("tool_calls") or []

            # ── Branch A: no tool calls → this is the final answer ──
            if not tool_calls:
                assistant_payload: dict[str, Any] = {
                    "role": "assistant",
                    "content": final_payload["content"],
                    "content_type": "text/markdown",
                    "provider": final_payload["provider"],
                    "model_name": final_payload["model_name"],
                    "prompt_tokens": final_payload["prompt_tokens"],
                    "completion_tokens": final_payload["completion_tokens"],
                    "total_tokens": final_payload["total_tokens"],
                }
                try:
                    ps, persisted_env = await client.request(
                        method="POST",
                        path=f"/api/autobot/threads/{thread_id}/messages/",
                        jwt=auth_handle.raw_jwt,
                        json_body=assistant_payload,
                    )
                except DjangoUnavailable as e:
                    logger.error(
                        "Storage unreachable persisting final assistant: %s", e,
                    )
                    yield sse_error(
                        "Storage service temporarily unavailable.",
                        code="storage_unavailable",
                    )
                    return
                if ps not in (200, 201):
                    yield sse_error(
                        "Failed to persist assistant message.",
                        code=f"assistant_persist_status_{ps}",
                    )
                    return
                yield sse_done((persisted_env or {}).get("data") or {})
                return

            # ── Branch B: model wants to call tools ─────────────────
            # Persist this round's assistant turn (content + tool_calls)
            # so future chat turns see the same history the LLM saw.
            assistant_payload = {
                "role": "assistant",
                "content": final_payload["content"],
                "content_type": "text/markdown",
                "provider": final_payload["provider"],
                "model_name": final_payload["model_name"],
                "prompt_tokens": final_payload["prompt_tokens"],
                "completion_tokens": final_payload["completion_tokens"],
                "total_tokens": final_payload["total_tokens"],
                "tool_calls": tool_calls,
            }
            try:
                ps, _ = await client.request(
                    method="POST",
                    path=f"/api/autobot/threads/{thread_id}/messages/",
                    jwt=auth_handle.raw_jwt,
                    json_body=assistant_payload,
                )
            except DjangoUnavailable as e:
                logger.error(
                    "Storage unreachable persisting intermediate assistant: %s",
                    e,
                )
                yield sse_error(
                    "Storage service temporarily unavailable.",
                    code="storage_unavailable",
                )
                return
            if ps not in (200, 201):
                yield sse_error(
                    "Failed to persist assistant tool-call message.",
                    code=f"assistant_persist_status_{ps}",
                )
                return

            # Extend the running conversation with the assistant's
            # tool-call turn so the LLM sees it next round.
            llm_messages.append({
                "role": "assistant",
                "content": final_payload["content"] or "",
                "tool_calls": tool_calls,
            })

            # Dispatch each tool serially. Parallel dispatch is possible
            # but order matters for deterministic LLM behavior, and the
            # round trip to Django dominates wall-clock anyway.
            for tc in tool_calls:
                tc_id = tc.get("id") or ""
                fn_name = (tc.get("function") or {}).get("name") or ""
                fn_args = (tc.get("function") or {}).get("arguments") or ""

                yield sse_tool_call_start(tc_id, fn_name, fn_args)
                result = await dispatch_tool(fn_name, fn_args, auth_handle.raw_jwt)
                yield sse_tool_result(tc_id, fn_name, result)

                # T18: invalidate the thread's hot-context cache on
                # successful write-tool calls. The cache itself isn't
                # populated yet (no producer wires `:ctx`), so this is
                # effectively a no-op now — but having the hook in
                # place means we can flip ctx caching on later without
                # auditing every tool dispatch site.
                if (
                    fn_name in _WRITE_TOOL_NAMES
                    and isinstance(result, dict)
                    and "error" not in result
                ):
                    try:
                        await get_cache().invalidate_thread_ctx(thread_id)
                    except Exception as e:
                        # Cache failures are observability, not control —
                        # never let them break the chat turn.
                        logger.warning(
                            "Cache invalidate failed for thread %s: %s",
                            thread_id, e,
                        )

                # Serialize the result as the tool message's content.
                # The LLM sees a JSON string; `default=str` handles
                # stray datetime/UUID values from Django envelopes.
                result_content = _json.dumps(result, default=str)
                tool_msg_payload = {
                    "role": "tool",
                    "content": result_content,
                    "content_type": "text/plain",
                    "tool_call_id": tc_id,
                }
                try:
                    ts2, _ = await client.request(
                        method="POST",
                        path=f"/api/autobot/threads/{thread_id}/messages/",
                        jwt=auth_handle.raw_jwt,
                        json_body=tool_msg_payload,
                    )
                except DjangoUnavailable as e:
                    logger.error(
                        "Storage unreachable persisting tool message: %s", e,
                    )
                    yield sse_error(
                        "Storage service temporarily unavailable.",
                        code="storage_unavailable",
                    )
                    return
                if ts2 not in (200, 201):
                    yield sse_error(
                        "Failed to persist tool-result message.",
                        code=f"tool_persist_status_{ts2}",
                    )
                    return

                # Feed the tool result back into the LLM's context.
                llm_messages.append({
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "content": result_content,
                })
            # Loop again — the LLM will react to the tool results in
            # the next iteration.

        # Hit max rounds without a final text reply. The user's chat is
        # in a consistent state (every assistant + tool turn is
        # persisted), but the model didn't converge. Surface as an
        # error frame so the client can offer a retry.
        logger.warning(
            "Tool-call loop hit max rounds (%d) without a final reply",
            max_rounds,
        )
        yield sse_error(
            f"The assistant ran {max_rounds} tool rounds without "
            "settling on a final answer. Try rephrasing or asking again.",
            code="max_tool_rounds",
        )

    async def _stream_with_cleanup():
        """Wraps `event_stream()` so the in-flight stream is unregistered
        on EVERY exit path — normal completion, exception, or client
        disconnect (FastAPI closes the generator in all three cases).
        Without this, the registry would slowly leak handles whenever a
        stream ended abnormally."""
        try:
            async for frame in event_stream():
                yield frame
        finally:
            await registry.unregister(stream_id)

    return StreamingResponse(
        _stream_with_cleanup(),
        media_type="text/event-stream",
        headers={
            # `no-cache` keeps intermediaries from caching incomplete
            # streams; `X-Accel-Buffering: no` belt-and-suspenders the
            # nginx `proxy_buffering off` directive already set on /api/ai/.
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Token refresh endpoint (T18) ──────────────────────────────────────


@router.post("/threads/{thread_id}/token-refresh/")
@limiter.limit("60/minute")
async def refresh_stream_token(
    thread_id: str,
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    """Swap a refreshed Clerk JWT into an in-flight chat stream (T18).

    Request body: ``{"stream_id": "<uuid>"}``
    Response: ``{"success": true, "message": "Token refreshed."}``

    The Bearer header carries the NEW token; `require_auth` verifies it
    via the JWKS path (same as every other endpoint), so by the time
    we have an `AuthContext` here the new token is known good.

    `thread_id` in the URL is informational — the registry is keyed by
    `stream_id` alone, so a stream_id mints regardless of which thread
    it belongs to. We keep `thread_id` in the path for symmetry with
    the streaming endpoint and to make audit logs grep-friendly.

    Error cases:
      • 400 — `stream_id` missing from the body.
      • 401 — Bearer missing or invalid (handled by `require_auth`).
      • 403 — the new token belongs to a different `sub` than the
              one that owns the stream. Blocks an attacker who guessed
              a stream_id from hijacking somebody else's chat.
      • 404 — no active stream with this `stream_id` (already
              finished, or never started).
    """
    try:
        body = _json.loads(await request.body() or b"{}")
    except _json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON body: {e.msg}",
        ) from e
    if not isinstance(body, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="JSON body must be an object.",
        )
    stream_id = body.get("stream_id")
    if not isinstance(stream_id, str) or not stream_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="`stream_id` is required and must be a non-empty string.",
        )

    registry = get_stream_registry()
    handle = await registry.get(stream_id)
    if handle is None:
        # Use a generic 404 — don't leak whether the stream_id existed.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active stream with that id.",
        )

    try:
        handle.refresh(auth)
    except PermissionError as e:
        logger.warning(
            "Token refresh rejected: thread_id=%s stream_id=%s caller_sub=%s",
            thread_id, stream_id, auth.user_sub,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e),
        ) from e

    logger.info(
        "Token refreshed: thread_id=%s stream_id=%s sub=%s",
        thread_id, stream_id, auth.user_sub,
    )
    return _envelope(
        success=True,
        message="Token refreshed.",
        data={"stream_id": stream_id, "thread_id": thread_id},
    )
