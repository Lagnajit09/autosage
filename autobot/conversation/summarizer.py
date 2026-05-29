"""Conversation summarizer (T16).

Three jobs:

  1. **Token accounting** — count tokens of a chat history so the chat
     loop can decide whether to summarize. Uses tiktoken's `cl100k_base`
     encoder as a vendor-neutral approximation. Per-provider tokenizers
     would be more accurate (±10–20 % for Gemini) but tiktoken is good
     enough to gate the summarization trigger, and shipping multiple
     tokenizers just to refine the estimate isn't worth the weight.

  2. **Pre-compaction** — when a tool result message is huge (e.g. a 5 KB
     `list_scripts` dump), collapse it to a one-line digest IN-MEMORY
     before feeding to the LLM. The full content stays in Postgres for
     audit; only the LLM-visible context gets compressed. This defers
     full summarization by 5–10 turns.

  3. **Summarization** — when the assembled context still exceeds
     `AUTOBOT_CONTEXT_TARGET_RATIO * model_context_window` after
     pre-compaction, do a separate non-streaming LLM call that turns the
     OLD portion of history into a paragraph summary. Persist as a
     Django Summary row (+ Redis cache) and replace the old portion with
     the summary in-context for THIS turn and future turns.

The chat router (`routers/chat.py`) is the only intended caller; this
module doesn't enforce ordering or know about SSE.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any

import tiktoken

from conversation.cache import get_cache
from conversation.persistence import DjangoUnavailable, get_django_client
from llm.client import LLMError, LLMResolution, acomplete
from llm.prompts import SUMMARIZER_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


# ── Token accounting ─────────────────────────────────────────────────


@lru_cache(maxsize=1)
def _get_tiktoken_encoding():
    """`cl100k_base` is OpenAI's encoder for GPT-4/3.5; it's the closest
    portable approximation we have for Gemini, Groq Llama, etc. Counts
    will diverge by ±10–20 % vs the provider's true tokenizer, but for
    the trigger threshold (60 % of window) that's well within margin."""
    return tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    """Token count for a single string."""
    if not text:
        return 0
    return len(_get_tiktoken_encoding().encode(text))


def count_message_tokens(messages: list[dict[str, Any]]) -> int:
    """Approximate token cost of a full OpenAI-format messages list.

    Each message carries a small structural overhead (role tag + JSON
    wrapping); OpenAI's reference doc says ~4 tokens per message plus 2
    priming tokens. We use 3 per message as the rough constant — close
    enough for budgeting, and the actual provider serialization will
    differ slightly anyway. Tool calls and tool_call_ids are counted
    against the message that carries them.
    """
    total = 0
    for m in messages:
        total += 3  # role tag + JSON wrapping overhead
        content = m.get("content") or ""
        total += count_tokens(content)
        tool_calls = m.get("tool_calls") or []
        for tc in tool_calls:
            if isinstance(tc, dict):
                # Each tool_call is a small JSON object. Counting its
                # serialized form is the easiest accurate estimate.
                try:
                    total += count_tokens(json.dumps(tc))
                except (TypeError, ValueError):
                    total += 50  # fallback constant
        tool_call_id = m.get("tool_call_id") or ""
        if tool_call_id:
            total += count_tokens(tool_call_id)
    return total + 2  # priming overhead per OpenAI doc


# ── Model context windows ────────────────────────────────────────────


# Known max-token windows. LiteLLM has `litellm.model_cost` but it's
# patchy and version-dependent; hardcoding the models we actually use
# is more reliable. Add new entries as new providers / models land.
_MODEL_CONTEXT_WINDOWS: dict[str, int] = {
    # Gemini family — all 1M-context.
    "gemini-1.5-flash":   1_000_000,
    "gemini-1.5-pro":     1_000_000,
    "gemini-2.0-flash":   1_000_000,
    "gemini-2.5-flash":   1_000_000,
    "gemini-2.5-pro":     2_000_000,
    # OpenAI / OpenAI-compatible.
    "gpt-4o":             128_000,
    "gpt-4o-mini":        128_000,
    "gpt-4-turbo":        128_000,
    # Groq (Llama 3.1 generation).
    "llama-3.1-70b-versatile": 131_072,
    "llama-3.1-8b-instant":    131_072,
    # Older Groq Llama-3 — much smaller context.
    "llama3-70b-8192":    8_192,
    "llama3-8b-8192":     8_192,
    # Anthropic.
    "claude-3-5-sonnet":  200_000,
    "claude-3-haiku":     200_000,
    "claude-sonnet-4":    200_000,
    "claude-opus-4":      200_000,
}

# Conservative fallback when the model name doesn't match — picks a
# small window so summarization triggers EARLY rather than after a
# silent overflow. Better to over-summarize than to 400 the call.
_DEFAULT_CONTEXT_WINDOW = 32_000


def get_model_context_window(model_name: str) -> int:
    """Resolve a model name (with or without provider prefix) to its
    max context window in tokens. Falls back to a conservative default."""
    if not model_name:
        return _DEFAULT_CONTEXT_WINDOW
    bare = model_name.rsplit("/", 1)[-1].lower().strip()
    if bare in _MODEL_CONTEXT_WINDOWS:
        return _MODEL_CONTEXT_WINDOWS[bare]
    # Substring match catches versioned variants (e.g. "gemini-2.5-flash-001").
    for key, window in _MODEL_CONTEXT_WINDOWS.items():
        if key in bare:
            return window
    logger.info(
        "Unknown model '%s' — using fallback context window %d",
        model_name, _DEFAULT_CONTEXT_WINDOW,
    )
    return _DEFAULT_CONTEXT_WINDOW


# ── Pre-compaction ───────────────────────────────────────────────────


# Tool messages over this size get replaced with a one-line digest in
# the LLM-visible context. The full content stays in Postgres.
TOOL_RESULT_BYTES_THRESHOLD = 2048


def precompact_tool_results(
    messages: list[dict[str, Any]],
    max_bytes: int = TOOL_RESULT_BYTES_THRESHOLD,
) -> list[dict[str, Any]]:
    """Replace `role: tool` messages with content larger than `max_bytes`
    by a short digest. Returns a NEW list — does not mutate input or
    Django storage.

    The digest tries to be informative: for JSON list-of-objects results
    (e.g. `{"scripts": [...]}`), it reports the count per top-level
    array. For error results, it surfaces the error. For unknown shapes,
    it lists the top-level keys.
    """
    out: list[dict[str, Any]] = []
    for m in messages:
        if m.get("role") != "tool":
            out.append(m)
            continue
        content = m.get("content") or ""
        if len(content.encode("utf-8", errors="replace")) <= max_bytes:
            out.append(m)
            continue
        digest = _tool_result_digest(content)
        # Preserve every field except `content` so tool_call_id stays
        # bound to the originating assistant tool_call.
        compacted = {**m, "content": digest}
        out.append(compacted)
    return out


def _tool_result_digest(content: str) -> str:
    """Build a one-line digest of a tool result JSON. Best-effort."""
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return (
            f"[tool result compacted: {len(content)} chars of non-JSON "
            "content; full data in Postgres]"
        )
    if not isinstance(parsed, dict):
        return (
            f"[tool result compacted: non-object JSON of {len(content)} "
            "chars; full data in Postgres]"
        )
    if "error" in parsed:
        # Errors are usually short; surface the message verbatim.
        return f"[tool error: {parsed['error']}]"
    # Common shape: {"<resource>": [item, item, ...]}
    list_keys = [k for k, v in parsed.items() if isinstance(v, list)]
    if list_keys:
        counts = ", ".join(f"{len(parsed[k])} {k}" for k in list_keys)
        return f"[tool result compacted: {counts}; full data in Postgres]"
    # Fall back to listing top-level keys.
    keys = list(parsed.keys())[:6]
    return (
        f"[tool result compacted: object with keys "
        f"{', '.join(keys)}; full data in Postgres]"
    )


# ── Summary load / persist ───────────────────────────────────────────


async def load_latest_summary(
    thread_id: str,
    jwt: str,
) -> dict[str, Any] | None:
    """Return the latest summary dict for a thread, or None.

    Shape (on hit):
      ``{"id": ..., "summary_text": "...", "summary_tokens": N,
         "up_to_message": "<uuid>", "created_at": "..."}``

    Tries Redis first (JSON-encoded). On miss, hits Django's
    `/api/autobot/threads/<id>/summaries/?page=1&page_size=1` and warms
    the cache.
    """
    cache = get_cache()
    cached = await cache.get_thread_summary(thread_id)
    if cached:
        try:
            data = json.loads(cached)
            # Sanity-check it has the expected shape; otherwise treat
            # as a corrupt entry (e.g. older plain-text format from
            # before this module landed).
            if isinstance(data, dict) and "summary_text" in data:
                return data
        except json.JSONDecodeError:
            logger.info(
                "Stale plain-text summary cache for thread %s; reloading",
                thread_id,
            )

    client = get_django_client()
    try:
        s, body = await client.request(
            method="GET",
            path=f"/api/autobot/threads/{thread_id}/summaries/",
            jwt=jwt,
            params={"page": "1", "page_size": "1"},
        )
    except DjangoUnavailable as e:
        logger.warning("Summary fetch failed (storage unreachable): %s", e)
        return None
    if s != 200:
        return None
    summaries = ((body or {}).get("data") or {}).get("summaries") or []
    if not summaries:
        return None
    latest = summaries[0]
    # Warm the cache for the next turn.
    try:
        await cache.set_thread_summary(thread_id, json.dumps(latest, default=str))
    except Exception as e:
        logger.warning("Failed to warm summary cache: %s", e)
    return latest


async def persist_summary(
    thread_id: str,
    jwt: str,
    *,
    summary_text: str,
    up_to_message_id: str,
    summary_tokens: int,
) -> dict[str, Any] | None:
    """Write a new Summary row to Django and update the Redis cache.

    Returns the persisted summary dict, or None on failure (caller may
    still proceed with the summary in-memory — Django storage is
    persistence for future turns, not for THIS one).
    """
    client = get_django_client()
    try:
        s, body = await client.request(
            method="POST",
            path=f"/api/autobot/threads/{thread_id}/summaries/",
            jwt=jwt,
            json_body={
                "summary_text": summary_text,
                "summary_tokens": summary_tokens,
                "up_to_message": up_to_message_id,
            },
        )
    except DjangoUnavailable as e:
        logger.error("Summary persist failed (storage unreachable): %s", e)
        return None
    if s not in (200, 201):
        logger.error(
            "Summary persist failed: HTTP %d body=%s",
            s, (body or {}).get("message"),
        )
        return None
    summary = (body or {}).get("data") or {}
    try:
        cache = get_cache()
        await cache.set_thread_summary(
            thread_id, json.dumps(summary, default=str),
        )
    except Exception as e:
        logger.warning("Failed to update summary cache after persist: %s", e)
    return summary


# ── LLM-driven summarization ─────────────────────────────────────────
#
# The system prompt for the summarizer LLM call lives in `llm/prompts.py`
# (as `SUMMARIZER_SYSTEM_PROMPT`) — kept alongside the main system prompt
# so all LLM-facing prompts are auditable in one place.


async def summarize_to_text(
    messages: list[dict[str, Any]],
    resolution: LLMResolution,
    *,
    existing_summary: str = "",
) -> str:
    """Produce a paragraph summary of `messages` via a non-streaming LLM call.

    If `existing_summary` is non-empty, the model is asked to merge it
    with the new content rather than start fresh — so the summary stays
    coherent across multiple summarization rounds over a long thread.

    Raises:
      LLMError — propagated; the chat router catches and either skips
      summarization or surfaces a soft warning.
    """
    if existing_summary:
        user_prompt = (
            "Below is an existing summary of the EARLIER conversation, "
            "followed by NEW messages that continued it. Produce an "
            "UPDATED summary that incorporates both — preserve all "
            "ids/names from the existing summary and add what's new.\n\n"
            f"=== EXISTING SUMMARY ===\n{existing_summary}\n\n"
            f"=== NEW MESSAGES ===\n{_format_messages_for_summary(messages)}"
        )
    else:
        user_prompt = (
            "Summarize the following conversation:\n\n"
            f"{_format_messages_for_summary(messages)}"
        )

    summary_messages: list[dict[str, Any]] = [
        {"role": "system", "content": SUMMARIZER_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]
    # Low temperature so summaries are deterministic — we don't want
    # creative paraphrasing of UUIDs or counts.
    result = await acomplete(summary_messages, resolution, temperature=0.2)
    return result["content"]


def _format_messages_for_summary(messages: list[dict[str, Any]]) -> str:
    """Render OpenAI-format messages as plain text the summarizer can read.

    Tool calls and tool results are tagged distinctly so the summarizer
    can pick them out as "actions" rather than chat.
    """
    lines: list[str] = []
    for m in messages:
        role = (m.get("role") or "?").upper()
        content = m.get("content") or ""
        tool_calls = m.get("tool_calls") or []
        if tool_calls:
            for tc in tool_calls:
                if not isinstance(tc, dict):
                    continue
                fn = tc.get("function") or {}
                name = fn.get("name", "?")
                args = fn.get("arguments", "{}")
                lines.append(f"[{role} → tool call: {name}({args})]")
            if content:
                lines.append(f"[{role}]: {content}")
        elif role == "TOOL":
            lines.append(f"[TOOL RESULT]: {content}")
        else:
            lines.append(f"[{role}]: {content}")
    return "\n".join(lines)
