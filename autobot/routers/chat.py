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
from conversation.persistence import DjangoUnavailable, get_django_client
from llm.client import LLMError, acomplete, astream_complete, resolve_admin
from llm.prompts import get_system_prompt
from llm.tools import dispatch_tool, get_tool_schemas
from settings import get_settings
from streaming.sse import (
    sse_done,
    sse_error,
    sse_token,
    sse_tool_call_start,
    sse_tool_result,
)

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
    reversal is needed. The newly-persisted user message will appear in
    the history slice (we list AFTER persisting); the dedup guard at the
    end skips re-appending it.

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
    """
    system_prompt = get_system_prompt(
        user_customizations=thread.get("system_prompt_override") or "",
    )

    out: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
    ]
    # Tracks tool_call ids announced by assistant messages but not yet
    # consumed by a tool-result message. Used to drop orphan `role:
    # "tool"` entries (defensive — should not happen with correct
    # persistence, but a stray orphan would crash the LLM call).
    pending_tool_call_ids: set[str] = set()

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
        (thread_status, thread_env), (hist_status, hist_env) = await asyncio.gather(
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
        )
    except DjangoUnavailable as e:
        logger.error("Storage unreachable during thread+history fetch: %s", e)
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

    # 3. Resolve provider/model/key. T17 will branch on
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

    # 4. Call the LLM.
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
async def post_message_stream(
    thread_id: str,
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    """Streaming chat turn via Server-Sent Events.

    Request body: ``{"content": str, "content_type"?: str, "client_id"?: str}``
    Response: ``text/event-stream`` with the following event sequence:

      • Zero or more ``event: token`` frames with ``{"content": "<delta>"}``.
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
    """
    body = await _read_message_body(request)
    content: str = body["content"]
    content_type: str = body.get("content_type") or "text/plain"
    client_id: str | None = body.get("client_id")

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
    async def event_stream():
        # 2a. Fetch thread + history in parallel (same optimization as
        #     the non-streaming path).
        try:
            (ts, te), (hs, he) = await asyncio.gather(
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
            )
        except DjangoUnavailable as e:
            logger.error(
                "Storage unreachable during streaming thread+history: %s", e,
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
        history_list = (
            history_data.get("messages", [])
            if isinstance(history_data, dict) else []
        )

        # 2b. Resolve provider.
        try:
            resolution = resolve_admin()
        except LLMError as e:
            logger.error("LLM resolution failed during stream: %s", e)
            yield sse_error(
                "LLM provider is not configured.", code="llm_unconfigured",
            )
            return

        # 2c. Tool-call loop. Each iteration streams one LLM call; if
        #     the model emits tool_calls, dispatch them, append the
        #     results to the running conversation, and loop. Exit when
        #     the model returns a normal text reply or we hit the cap.
        llm_messages = _build_llm_messages(thread, history_list, content)
        tool_schemas = get_tool_schemas()
        max_rounds = get_settings().AUTOBOT_MAX_TOOL_ROUNDS

        for round_num in range(1, max_rounds + 1):
            accumulated = ""
            final_payload: dict[str, Any] | None = None

            try:
                async for kind, payload in astream_complete(
                    llm_messages, resolution, tools=tool_schemas,
                ):
                    if kind == "token":
                        accumulated += payload
                        yield sse_token(payload)
                    elif kind == "done":
                        final_payload = payload
            except LLMError as e:
                logger.error(
                    "LLM stream failed (round=%d, provider=%s, model=%s): %s",
                    round_num, resolution.provider, resolution.model_name, e,
                )
                yield sse_error(
                    "The LLM provider is temporarily unavailable.",
                    code="llm_unavailable",
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
                        jwt=auth.raw_jwt,
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
                    jwt=auth.raw_jwt,
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
                result = await dispatch_tool(fn_name, fn_args, auth.raw_jwt)
                yield sse_tool_result(tc_id, fn_name, result)

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
                        jwt=auth.raw_jwt,
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

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            # `no-cache` keeps intermediaries from caching incomplete
            # streams; `X-Accel-Buffering: no` belt-and-suspenders the
            # nginx `proxy_buffering off` directive already set on /api/ai/.
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
