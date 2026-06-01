"""Chat router: streaming + non-streaming message endpoints.

Per-turn flow:
  1. Verify Clerk JWT (`Depends(require_auth)`).
  2. Persist the user message via Django — also the per-user
     authorization check: `_get_thread_or_404` rejects cross-user
     thread ids with a plain 404 and no data write.
  3. Fetch thread + history + settings in parallel.
  4. Resolve provider chain (BYO single-element or admin primary+fallbacks).
  5. Stream the LLM response, dispatching tools as the model emits them.
  6. Persist the assistant reply.

The per-thread `system_prompt_override` APPENDS to the base prompt;
losing the Autosage grounding would let the model hallucinate workflow
shapes and trigger semantics.
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
    friendly_llm_message,
    resolve_for_thread,
)
from llm.prompts import get_panel_allowed_tools, get_system_prompt
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

# 20 turns × ~150 tokens ≈ 3k tokens — enough memory without bloating
# prompt cost. The summarizer takes over beyond this window.
_HISTORY_PAGE_SIZE = 20

_LLM_ROLES = {"user", "assistant", "system", "tool"}

_WRITE_TOOL_NAMES = {
    "create_script",
    "update_script",
    "create_workflow",
    "update_workflow",
}

_CHAT_RATE_LIMIT = "30/minute"


def _envelope(
    success: bool,
    message: str,
    *,
    data: Any = None,
    errors: Any = None,
    status_code: int = 200,
) -> JSONResponse:
    """Match Django's api_response envelope shape."""
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
    """Validate the inbound JSON body; raise 400 on shape errors."""
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
    panel: str = "",
) -> list[dict[str, Any]]:
    """Assemble the messages list passed to litellm.

    Order: [system, ...history (chronological), new user].

    Tool-call reconstruction: assistant turns may have empty `content`
    but carry `tool_calls`; tool turns carry `tool_call_id`. Both fields
    MUST be forwarded or LiteLLM's Gemini transformer (and OpenAI's tool-
    protocol validator) aborts with "Missing corresponding tool call for
    tool response message".

    When `summary_text` is non-empty, it's appended to the system prompt
    under `## Earlier conversation summary` rather than added as a
    separate `role: system` entry — avoids provider-specific weirdness
    around multi-system messages.
    """
    system_prompt = get_system_prompt(
        user_customizations=thread.get("system_prompt_override") or "",
        mode=mode,
        panel=panel,
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
    # Tool_call ids announced by assistants but not yet consumed by a
    # tool-result. Used to drop orphan `role: "tool"` entries.
    pending_tool_call_ids: set[str] = set()

    # Trim leading orphan messages — the recent-N fetch can land its cut
    # mid-turn. Gemini enforces "function call turn comes immediately
    # after a user turn or after a function response turn"; we walk
    # forward to the first user message and drop everything before it.
    first_user_idx: int | None = None
    for i, m in enumerate(history):
        if m.get("role") == "user":
            first_user_idx = i
            break
    if first_user_idx is None:
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
                # Orphan tool message — no preceding assistant tool_call.
                # Including it would 400 the next LLM call.
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
    content_type: str = body.get("content_type") or "text/plain"
    client_id: str | None = body.get("client_id")
    mode: str = body.get("mode") or ""
    panel: str = body.get("panel") or ""

    client = get_django_client()

    # Persisting first doubles as the per-user auth check (Django returns
    # 404 on cross-user thread ids) and means the user's input survives
    # an LLM failure. Idempotent on `client_id`.
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
        return JSONResponse(content=user_env, status_code=s)

    # Parallel fetch — auth already passed above, so a non-200 here means
    # a between-call deletion.
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

    # Non-streaming path skips fallback — single attempt is fine here.
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

    llm_messages = _build_llm_messages(
        thread, history_list, content, mode=mode, panel=panel,
    )
    try:
        result = await acomplete(llm_messages, resolution)
    except LLMError as e:
        logger.error(
            "LLM call failed (provider=%s, model=%s, kind=%s): %s",
            resolution.provider, resolution.model_name, e.kind, e,
        )
        # User msg already persisted; 502 lets the client retry without
        # re-sending. Never surface the raw provider error — it can
        # leak api keys, model ids, stack fragments.
        return _envelope(
            success=False,
            message=friendly_llm_message(e.kind),
            status_code=status.HTTP_502_BAD_GATEWAY,
        )

    assistant_payload: dict[str, Any] = {
        "role": "assistant",
        "content": result["content"],
        "content_type": "text/markdown",
        "provider": result["provider"],
        "model_name": result["model_name"],
        "prompt_tokens": result["prompt_tokens"],
        "completion_tokens": result["completion_tokens"],
        "total_tokens": result["total_tokens"],
        "is_byo": not resolution.is_admin,
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
        # Client should retry the whole turn; client_id idempotency on
        # the user message prevents double-recording.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service temporarily unavailable.",
        ) from e

    return JSONResponse(content=assistant_env, status_code=s)


@router.post("/threads/{thread_id}/messages/stream/")
@limiter.limit(_CHAT_RATE_LIMIT)
async def post_message_stream(
    thread_id: str,
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    """Streaming chat turn via Server-Sent Events.

    Event sequence:
      • One `stream_start` frame with the `stream_id` for /token-refresh/.
      • Zero or more `token` frames.
      • Optional interleaved `tool_call_start` / `tool_result` frames.
      • Exactly one terminal `done` or `error` frame.

    User-message POST happens BEFORE streaming so 4xx (unknown thread,
    expired JWT, validation) surfaces as a normal HTTP error. After
    StreamingResponse returns, the status is committed to 200 and
    failures can only be reported as `event: error` frames.

    Token refresh: every Django call inside the generator reads
    `auth_handle.raw_jwt`, not `auth.raw_jwt`. The handle is mutable —
    `/token-refresh/` swaps in a fresh AuthContext mid-stream.
    """
    body = await _read_message_body(request)
    content: str = body["content"]
    content_type: str = body.get("content_type") or "text/plain"
    client_id: str | None = body.get("client_id")
    mode: str = body.get("mode") or ""
    panel: str = body.get("panel") or ""

    client = get_django_client()

    # Done OUTSIDE the streaming generator so failures surface as normal
    # HTTP errors. Also acts as the per-user auth check.
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

    # Register stream before the generator so the first frame has its id.
    registry = get_stream_registry()
    stream_id, auth_handle = await registry.register(auth)

    async def event_stream():
        # First frame always — gives the client the stream_id it needs
        # to call /token-refresh/ if the JWT expires.
        yield sse_stream_start(stream_id, thread_id)

        # History uses `ordering=-created_at`; we reverse to chronological.
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
        history_list = list(reversed(history_list_raw))
        user_settings = (ue or {}).get("data") or {} if us == 200 else {}

        # Returns [byo] for BYO or [primary, ...fallbacks] for admin.
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
        # Primary drives context-window math and summarization; fallback
        # candidates have comparable budgets at the 60% trigger level.
        resolution = resolutions[0]

        # Per-user daily quota — admin only. BYO turns don't count.
        # Ticks once per chat turn regardless of tool-call rounds.
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

        # Context-window management: load summary → drop messages it
        # covers → precompact tool results → maybe summarize older
        # portion if still over budget.
        existing_summary = await load_latest_summary(thread_id, auth_handle.raw_jwt)
        existing_summary_text = (
            (existing_summary or {}).get("summary_text") or ""
        )
        if existing_summary:
            up_to_id = existing_summary.get("up_to_message")
            if up_to_id:
                # `up_to_message` is inclusive — keep rows strictly newer.
                kept: list[dict[str, Any]] = []
                seen_cutoff = False
                for m in history_list:
                    if not seen_cutoff:
                        if m.get("id") == up_to_id:
                            seen_cutoff = True
                        continue
                    kept.append(m)
                # If the cutoff was paginated off, keep what we fetched.
                if seen_cutoff:
                    history_list = kept

        history_list = precompact_tool_results(history_list)

        # Build a tentative messages list to measure tokens.
        tentative = _build_llm_messages(
            thread, history_list, content,
            summary_text=existing_summary_text,
            mode=mode,
            panel=panel,
        )
        context_window = get_model_context_window(resolution.model_name)
        target_tokens = int(
            context_window * settings.AUTOBOT_CONTEXT_TARGET_RATIO,
        )
        current_tokens = count_message_tokens(tentative)

        # Summarize when over budget AND we have more than KEEP_LAST_N
        # messages (so there's something older to compress).
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
                # Soft-fail — tiktoken estimates are approximate, the
                # provider may still accept the un-summarized context.
                logger.warning(
                    "Summarization LLM call failed; proceeding without: %s",
                    e,
                )
            else:
                # Persistence failures are non-fatal — we use the new
                # summary in-memory for THIS turn either way.
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

        # Tool-call loop. Each iteration streams one LLM call; on
        # tool_calls, dispatch + append results + loop. Exits on a
        # normal text reply or when the round cap is hit.
        llm_messages = _build_llm_messages(
            thread, history_list, content,
            summary_text=existing_summary_text,
            mode=mode,
            panel=panel,
        )
        tool_schemas = get_tool_schemas(
            allowed_names=get_panel_allowed_tools(panel),
        )
        if panel:
            logger.info(
                "Panel=%s: advertising %d tool(s)",
                panel, len(tool_schemas),
            )
        max_rounds = settings.AUTOBOT_MAX_TOOL_ROUNDS

        # Round 1 tries the candidate chain; rounds 2+ stay pinned to
        # the winner. Mid-loop swaps break tool_call id memory because
        # providers serialize them differently.
        selected_resolution: LLMResolution | None = None

        # Logged as TURN_TOKENS at exit — grep-friendly per-turn cost.
        turn_prompt_tokens = 0
        turn_completion_tokens = 0
        turn_total_tokens = 0
        turn_tool_calls = 0
        turn_provider = ""
        turn_model = ""

        for round_num in range(1, max_rounds + 1):
            accumulated = ""
            final_payload: dict[str, Any] | None = None

            # Round 1: full candidate chain. Round 2+: pinned winner.
            if round_num == 1 and selected_resolution is None:
                candidates = resolutions
            else:
                candidates = [selected_resolution or resolution]

            stream_succeeded = False
            # Tracked for the "all exhausted" branch to surface a message
            # reflecting why everything failed.
            last_err_kind = "unknown"
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
                    last_err_kind = e.kind or "unknown"
                    # Salvage when the stream errored AFTER content
                    # reached the client. Triggered by litellm 1.55.x's
                    # parser crashing on Groq's final usage-only chunk
                    # (`choices: []` is valid but the parser indexes
                    # `choices[0]` unguarded). Token counts are zeroed.
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
                    else:
                        # Try the next fallback only if no tokens have
                        # been streamed yet — otherwise we'd interleave
                        # two providers' deltas.
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
                            "model=%s, kind=%s): %s",
                            round_num, cand.provider, cand.model_name,
                            e.kind, e,
                        )
                        yield sse_error(
                            friendly_llm_message(e.kind),
                            code=f"llm_{e.kind}",
                        )
                        return

                # Pin subsequent rounds to the winner.
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
                # Reached when the candidate loop's `continue` path ran
                # out of fallbacks. Surface the "all exhausted" framing.
                logger.error(
                    "All Default LLM candidates exhausted (last_kind=%s) "
                    "after round=%d",
                    last_err_kind, round_num,
                )
                yield sse_error(
                    friendly_llm_message(last_err_kind, all_exhausted=True),
                    code=f"llm_{last_err_kind}_exhausted",
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

            turn_prompt_tokens += int(final_payload.get("prompt_tokens") or 0)
            turn_completion_tokens += int(final_payload.get("completion_tokens") or 0)
            turn_total_tokens += int(final_payload.get("total_tokens") or 0)
            turn_tool_calls += len(tool_calls)
            turn_provider = final_payload.get("provider") or turn_provider
            turn_model = final_payload.get("model_name") or turn_model

            # No tool calls → final answer.
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
                    "is_byo": not resolution.is_admin,
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
                logger.info(
                    "TURN_TOKENS thread=%s rounds=%d tool_calls=%d "
                    "prompt=%d completion=%d total=%d provider=%s model=%s",
                    thread_id, round_num, turn_tool_calls,
                    turn_prompt_tokens, turn_completion_tokens,
                    turn_total_tokens, turn_provider, turn_model,
                )
                yield sse_done((persisted_env or {}).get("data") or {})
                return

            # Model wants tools. Persist the assistant turn so future
            # chat turns see the same history the LLM saw.
            assistant_payload = {
                "role": "assistant",
                "content": final_payload["content"],
                "content_type": "text/markdown",
                "provider": final_payload["provider"],
                "model_name": final_payload["model_name"],
                "prompt_tokens": final_payload["prompt_tokens"],
                "completion_tokens": final_payload["completion_tokens"],
                "total_tokens": final_payload["total_tokens"],
                "is_byo": not resolution.is_admin,
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

            llm_messages.append({
                "role": "assistant",
                "content": final_payload["content"] or "",
                "tool_calls": tool_calls,
            })

            # Serial dispatch — parallel is possible but order matters
            # for deterministic behavior and Django dominates wall-clock.
            for tc in tool_calls:
                tc_id = tc.get("id") or ""
                fn_name = (tc.get("function") or {}).get("name") or ""
                fn_args = (tc.get("function") or {}).get("arguments") or ""

                yield sse_tool_call_start(tc_id, fn_name, fn_args)
                # Re-check the panel allow-list here so a hallucinated
                # tool name (not in the advertised set) is refused.
                result = await dispatch_tool(
                    fn_name,
                    fn_args,
                    auth_handle.raw_jwt,
                    allowed_names=get_panel_allowed_tools(panel),
                )
                yield sse_tool_result(tc_id, fn_name, result)

                if (
                    fn_name in _WRITE_TOOL_NAMES
                    and isinstance(result, dict)
                    and "error" not in result
                ):
                    try:
                        await get_cache().invalidate_thread_ctx(thread_id)
                    except Exception as e:
                        logger.warning(
                            "Cache invalidate failed for thread %s: %s",
                            thread_id, e,
                        )

                # `default=str` handles datetime/UUID values from Django.
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

                llm_messages.append({
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "content": result_content,
                })

        # Hit max rounds without converging. Everything's persisted; the
        # error frame lets the client offer a retry.
        logger.warning(
            "Tool-call loop hit max rounds (%d) without a final reply",
            max_rounds,
        )
        logger.info(
            "TURN_TOKENS thread=%s rounds=%d tool_calls=%d "
            "prompt=%d completion=%d total=%d provider=%s model=%s "
            "(hit_max_rounds)",
            thread_id, max_rounds, turn_tool_calls,
            turn_prompt_tokens, turn_completion_tokens,
            turn_total_tokens, turn_provider, turn_model,
        )
        yield sse_error(
            f"The assistant ran {max_rounds} tool rounds without "
            "settling on a final answer. Try rephrasing or asking again.",
            code="max_tool_rounds",
        )

    async def _stream_with_cleanup():
        """Unregister the stream on every exit path (success, exception,
        client disconnect) to avoid leaking handles in the registry."""
        try:
            async for frame in event_stream():
                yield frame
        finally:
            await registry.unregister(stream_id)

    return StreamingResponse(
        _stream_with_cleanup(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/threads/{thread_id}/token-refresh/")
@limiter.limit("60/minute")
async def refresh_stream_token(
    thread_id: str,
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    """Swap a refreshed Clerk JWT into an in-flight chat stream.

    The new Bearer is JWKS-verified by `require_auth` before this body
    runs. `thread_id` is informational only — the registry is keyed by
    `stream_id` alone (kept in the path for audit-log grep parity).

    403: caller's `sub` differs from the stream owner's. Blocks an
    attacker who guessed a stream_id from hijacking somebody's chat.
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
        # Generic 404 — don't leak whether the stream_id existed.
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
