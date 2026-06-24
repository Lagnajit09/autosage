"""Public docs-chat router (Pillar A) — the no-Clerk documentation assistant.

`POST /docs/chat/stream/` (external `/api/ai/docs/chat/stream/`) is the
browser-facing endpoint for the Docusaurus widget. It is the FIRST and ONLY
unauthenticated endpoint on autobot, so it is bounded on every axis:

  • No `require_auth` — anonymous, but IP-keyed slowapi throttle (the
    limiter's key_func falls back to client IP when there's no Bearer).
  • Per-IP daily cap in Redis /2 (fail-open) — bounds free-LLM-key abuse
    separately from burst throttling.
  • Admin LLM chain ONLY — never BYO on a public path (no user, no key).
  • Exactly ONE tool advertised AND dispatch-floored: `search_docs`. Even a
    hallucinated tool name is refused by the dispatcher allow-list.
  • Tightly-scoped `DOCS_SYSTEM_PROMPT` (not the in-app composer, which would
    layer modes whose tool sets include write/exec tools).
  • Bounded message length, history length, and tool rounds.
  • Anonymous session memory in Redis keyed by a CLIENT-GENERATED session_id.
    That id is untrusted: it only ever names a Redis key (length/charset
    clamped) — it never addresses a Django row, so it carries no authz weight.

SSE vocabulary is unchanged (token / tool_call_start / tool_result / done /
error) so the widget reuses the same frame parser as the in-app chat.
"""

from __future__ import annotations

import json as _json
import logging
import re
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from slowapi.util import get_remote_address

from conversation.cache import get_cache
from llm.client import (
    LLMError,
    astream_complete,
    friendly_llm_message,
    resolve_admin_chain,
)
from llm.prompts import DOCS_SYSTEM_PROMPT
from llm.tools import ToolContext, dispatch_tool, get_tool_schemas
from settings import get_settings
from streaming.sse import (
    sse_done,
    sse_error,
    sse_token,
    sse_tool_call_start,
    sse_tool_result,
)
from throttling import limiter

logger = logging.getLogger(__name__)
router = APIRouter()

# The public docs path may call exactly one tool. This is the hard floor —
# advertised to the model AND re-checked at dispatch, so a hallucinated tool
# name (or any future-registered in-app tool) is uncallable here.
_DOCS_ALLOWED_TOOLS = frozenset({"search_docs"})

# session_id is client-generated and untrusted. We only use it as a Redis key
# suffix, but still clamp it: bounded length stops an attacker minting
# unbounded distinct keys, and a strict charset keeps it from doing anything
# odd in the key namespace. UUID/opaque tokens easily satisfy this.
_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,128}$")


def _docs_settings():
    return get_settings()


async def _read_docs_body(request: Request) -> tuple[str, str]:
    """Parse + validate the docs-chat body → (session_id, message).

    Raises 400 on any shape error. `message` is clamped to the configured
    max length; `session_id` must match the opaque-token charset.
    """
    raw = await request.body()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request body is required.",
        )
    try:
        parsed = _json.loads(raw)
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

    session_id = parsed.get("session_id")
    if not isinstance(session_id, str) or not _SESSION_ID_RE.match(session_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "`session_id` is required and must be an opaque token "
                "(8–128 chars: letters, digits, '-', '_')."
            ),
        )

    message = parsed.get("message")
    if not isinstance(message, str) or not message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="`message` is required and must be a non-empty string.",
        )
    message = message.strip()[: _docs_settings().AUTOBOT_DOCS_MAX_MESSAGE_CHARS]
    return session_id, message


def _build_docs_messages(
    history: list[dict[str, Any]],
    new_user_message: str,
) -> list[dict[str, Any]]:
    """Assemble [system, ...sanitized history, new user] for the docs LLM.

    History entries from Redis are untrusted JSON — keep only well-formed
    user/assistant text turns (the docs loop never persists tool turns into
    the session). The system prompt is the standalone DOCS_SYSTEM_PROMPT, NOT
    the in-app composer.
    """
    out: list[dict[str, Any]] = [
        {"role": "system", "content": DOCS_SYSTEM_PROMPT},
    ]
    for m in history:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        content = m.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content:
            out.append({"role": role, "content": content})
    out.append({"role": "user", "content": new_user_message})
    return out


@router.post("/docs/chat/stream/")
@limiter.limit(get_settings().AUTOBOT_DOCS_RATE_LIMIT)
async def docs_chat_stream(request: Request):
    """Public, anonymous, streaming docs Q&A. SSE; no auth.

    Body: ``{"session_id": "<opaque>", "message": "<text>"}``.
    Emits the standard SSE frames: token / tool_call_start / tool_result /
    done / error. `done` carries ``{"content": "<full answer>"}`` (no Django
    Message row exists on this path).
    """
    settings = _docs_settings()
    session_id, message = await _read_docs_body(request)

    # IP for the per-IP daily cap. The slowapi burst throttle above is already
    # IP-keyed via the limiter's no-Bearer fallback.
    client_ip = get_remote_address(request)

    # Pre-resolve the admin chain OUTSIDE the generator so a "no LLM
    # configured" misdeploy surfaces as a normal HTTP error, not a mid-stream
    # frame. resolve_admin_chain() never raises (returns [] when unconfigured).
    resolutions = resolve_admin_chain()
    if not resolutions:
        logger.error("Docs chat: no admin LLM provider configured.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The docs assistant is temporarily unavailable.",
        )

    async def event_stream():
        cache = get_cache()

        # ── Per-IP daily cap (fail-open) ─────────────────────────────────
        if settings.AUTOBOT_DOCS_DAILY_LIMIT > 0:
            allowed, count = await cache.incr_docs_quota_for_today(
                client_ip, settings.AUTOBOT_DOCS_DAILY_LIMIT,
            )
            if not allowed:
                yield sse_error(
                    "You've reached today's limit for the docs assistant. "
                    "Please try again tomorrow.",
                    code="docs_quota_exhausted",
                )
                return
            logger.info(
                "Docs-quota tick: ip=%s count=%d/%d",
                client_ip, count, settings.AUTOBOT_DOCS_DAILY_LIMIT,
            )

        # ── Load anon session history (fail-open → fresh thread) ─────────
        history = await cache.get_docs_session(session_id)
        # Clamp replayed history to the last N turns (bounds prompt cost on
        # the small free models even if the stored list grew large).
        max_msgs = settings.AUTOBOT_DOCS_MAX_HISTORY_TURNS * 2
        if len(history) > max_msgs:
            history = history[-max_msgs:]

        llm_messages = _build_docs_messages(history, message)
        tool_schemas = get_tool_schemas(allowed_names=_DOCS_ALLOWED_TOOLS)
        max_rounds = settings.AUTOBOT_DOCS_MAX_TOOL_ROUNDS

        # Round 1 tries the admin candidate chain (primary + fallbacks),
        # exactly like the in-app stream; rounds 2+ pin the winner so we
        # don't interleave two providers' tool-call id schemes.
        selected = None
        answer = ""

        for round_num in range(1, max_rounds + 1):
            candidates = resolutions if (round_num == 1 and selected is None) \
                else [selected]

            attempt_accumulated = ""
            final_payload: dict[str, Any] | None = None
            stream_succeeded = False
            last_err_kind = "unknown"

            for cand_idx, cand in enumerate(candidates):
                attempt_accumulated = ""
                attempt_yielded = False
                attempt_final: dict[str, Any] | None = None
                try:
                    async for kind, payload in astream_complete(
                        llm_messages, cand, tools=tool_schemas,
                    ):
                        if kind == "token":
                            attempt_accumulated += payload
                            attempt_yielded = True
                            yield sse_token(payload)
                        elif kind == "done":
                            attempt_final = payload
                except LLMError as e:
                    last_err_kind = e.kind or "unknown"
                    # Salvage content that already reached the client.
                    if attempt_yielded and attempt_accumulated and attempt_final is None:
                        attempt_final = {
                            "content": attempt_accumulated,
                            "tool_calls": [],
                            "provider": cand.provider,
                            "model_name": cand.model_name,
                        }
                    else:
                        # Only fall back if nothing was streamed yet —
                        # otherwise we'd interleave providers' deltas.
                        has_more = cand_idx < len(candidates) - 1
                        if e.retryable and not attempt_yielded and has_more:
                            logger.warning(
                                "Docs admin provider %s/%s failed "
                                "(retryable): %s — trying fallback",
                                cand.provider, cand.model_name, e,
                            )
                            continue
                        logger.error(
                            "Docs LLM stream failed (round=%d provider=%s "
                            "model=%s kind=%s): %s",
                            round_num, cand.provider, cand.model_name,
                            e.kind, e,
                        )
                        yield sse_error(
                            friendly_llm_message(e.kind), code=f"llm_{e.kind}",
                        )
                        return

                final_payload = attempt_final
                selected = cand
                stream_succeeded = True
                break

            if not stream_succeeded:
                logger.error(
                    "Docs chat: all admin candidates exhausted "
                    "(last_kind=%s) round=%d",
                    last_err_kind, round_num,
                )
                yield sse_error(
                    friendly_llm_message(last_err_kind, all_exhausted=True),
                    code=f"llm_{last_err_kind}_exhausted",
                )
                return

            if final_payload is None:
                final_payload = {
                    "content": attempt_accumulated, "tool_calls": [],
                }
            tool_calls = final_payload.get("tool_calls") or []

            # No tool calls → final answer.
            if not tool_calls:
                answer = (final_payload.get("content") or "").strip() or (
                    "I couldn't find an answer to that in the Autosage docs. "
                    "Try rephrasing, or ask about a specific feature."
                )
                break

            # Model wants tools — record the assistant tool-call turn into the
            # LLM context (NOT into the persisted session: tool plumbing is
            # ephemeral; the session only stores user/assistant prose).
            llm_messages.append({
                "role": "assistant",
                "content": final_payload.get("content") or "",
                "tool_calls": tool_calls,
            })

            for tc in tool_calls:
                tc_id = tc.get("id") or ""
                fn_name = (tc.get("function") or {}).get("name") or ""
                fn_args = (tc.get("function") or {}).get("arguments") or ""

                yield sse_tool_call_start(tc_id, fn_name, fn_args)
                # Hard floor: only `search_docs` is dispatchable here, and the
                # handler runs with NO jwt (internal-secret mode inside the
                # tool). A hallucinated name returns an {"error": ...}.
                result = await dispatch_tool(
                    fn_name,
                    fn_args,
                    jwt="",  # public path — no user JWT
                    allowed_names=_DOCS_ALLOWED_TOOLS,
                    context=ToolContext(),
                )
                yield sse_tool_result(tc_id, fn_name, result)

                result_content = _json.dumps(result, default=str)
                llm_messages.append({
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "content": result_content,
                })
            # loop back for the model to use the tool results
        else:
            # Hit max rounds without a text answer — force ONE tool-free call
            # so the model must reply from what it gathered.
            logger.warning(
                "Docs chat hit max rounds (%d); forcing tool-free answer",
                max_rounds,
            )
            try:
                forced = ""
                async for kind, payload in astream_complete(
                    llm_messages, selected or resolutions[0], tools=None,
                ):
                    if kind == "token":
                        forced += payload
                        yield sse_token(payload)
                answer = forced.strip() or (
                    "I searched the docs but couldn't compose a complete "
                    "answer. Please try rephrasing your question."
                )
            except LLMError as e:
                logger.error("Docs forced-final failed (kind=%s): %s", e.kind, e)
                yield sse_error(
                    friendly_llm_message(e.kind), code=f"llm_{e.kind}",
                )
                return

        # ── Persist the turn to the anon session (best-effort) ───────────
        history.append({"role": "user", "content": message})
        history.append({"role": "assistant", "content": answer})
        # Re-clamp before storing so the stored list can't grow unbounded.
        if len(history) > max_msgs:
            history = history[-max_msgs:]
        try:
            await cache.set_docs_session(
                session_id, history, ttl=settings.AUTOBOT_DOCS_SESSION_TTL,
            )
        except Exception as e:
            logger.warning(
                "Docs-session persist failed for session=%s: %s",
                session_id, e,
            )

        yield sse_done({"content": answer})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
