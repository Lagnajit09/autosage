"""Conversation summarizer.

Three jobs:
  1. Token accounting via tiktoken's `cl100k_base` (vendor-neutral
     approximation, ±10–20% off per-provider but good enough to gate
     the summarization trigger).
  2. Pre-compaction: collapse tool messages >2KB to one-line digests
     in-memory (full content stays in Postgres for audit).
  3. Summarization: when post-compaction context still exceeds
     `AUTOBOT_CONTEXT_TARGET_RATIO * model_context_window`, do a
     separate non-streaming LLM call, persist a Summary row, and
     replace the old portion of history in-context.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any

import tiktoken

from conversation.cache import get_cache
from conversation.persistence import DjangoUnavailable, get_django_client
from llm.client import LLMResolution, acomplete
from llm.prompts import SUMMARIZER_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_tiktoken_encoding():
    return tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    if not text:
        return 0
    return len(_get_tiktoken_encoding().encode(text))


def count_message_tokens(messages: list[dict[str, Any]]) -> int:
    """Approximate token cost of an OpenAI-format messages list.

    Uses 3 tokens per message for role+wrapping overhead plus 2 priming
    tokens (per OpenAI's reference doc).
    """
    total = 0
    for m in messages:
        total += 3
        content = m.get("content") or ""
        total += count_tokens(content)
        tool_calls = m.get("tool_calls") or []
        for tc in tool_calls:
            if isinstance(tc, dict):
                try:
                    total += count_tokens(json.dumps(tc))
                except (TypeError, ValueError):
                    total += 50
        tool_call_id = m.get("tool_call_id") or ""
        if tool_call_id:
            total += count_tokens(tool_call_id)
    return total + 2


# LiteLLM has `litellm.model_cost` but it's patchy and version-dependent;
# hardcoding the models we use is more reliable.
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
    "llama-3.1-70b-versatile":          131_072,
    "llama-3.1-8b-instant":             131_072,
    "llama-4-scout-17b-16e-instruct":   131_072,
    # Older Groq Llama-3 — much smaller context.
    "llama3-70b-8192":    8_192,
    "llama3-8b-8192":     8_192,
    # Anthropic.
    "claude-3-5-sonnet":  200_000,
    "claude-3-haiku":     200_000,
    "claude-sonnet-4":    200_000,
    "claude-opus-4":      200_000,
}

# Conservative fallback — summarize early rather than 400 on overflow.
_DEFAULT_CONTEXT_WINDOW = 32_000


def get_model_context_window(model_name: str) -> int:
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


# Tool messages over this size are digested before being sent to the LLM.
TOOL_RESULT_BYTES_THRESHOLD = 2048


def precompact_tool_results(
    messages: list[dict[str, Any]],
    max_bytes: int = TOOL_RESULT_BYTES_THRESHOLD,
) -> list[dict[str, Any]]:
    """Replace oversized `role: tool` messages with a short digest.

    Returns a new list — does not mutate input or Django storage.
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
        # Preserve every other field so tool_call_id stays bound to the
        # originating assistant tool_call.
        compacted = {**m, "content": digest}
        out.append(compacted)
    return out


def _tool_result_digest(content: str) -> str:
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
        return f"[tool error: {parsed['error']}]"
    # Common shape: {"<resource>": [item, item, ...]}
    list_keys = [k for k, v in parsed.items() if isinstance(v, list)]
    if list_keys:
        counts = ", ".join(f"{len(parsed[k])} {k}" for k in list_keys)
        return f"[tool result compacted: {counts}; full data in Postgres]"
    keys = list(parsed.keys())[:6]
    return (
        f"[tool result compacted: object with keys "
        f"{', '.join(keys)}; full data in Postgres]"
    )


async def load_latest_summary(
    thread_id: str,
    jwt: str,
) -> dict[str, Any] | None:
    """Return the latest summary dict for a thread, or None.

    Tries Redis first; on miss, fetches from Django and warms the cache.
    """
    cache = get_cache()
    cached = await cache.get_thread_summary(thread_id)
    if cached:
        try:
            data = json.loads(cached)
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
    """Write a new Summary row and update the Redis cache.

    Returns None on failure — the caller can still proceed with the
    summary in-memory for this turn.
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


async def summarize_to_text(
    messages: list[dict[str, Any]],
    resolution: LLMResolution,
    *,
    existing_summary: str = "",
) -> str:
    """Produce a paragraph summary of `messages` via a non-streaming LLM call.

    A non-empty `existing_summary` is merged with the new content so the
    summary stays coherent across multiple summarization rounds.
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
    # Low temperature: avoid creative paraphrasing of UUIDs or counts.
    result = await acomplete(summary_messages, resolution, temperature=0.2)
    return result["content"]


def _format_messages_for_summary(messages: list[dict[str, Any]]) -> str:
    """Render messages as plain text; tag tool calls/results distinctly."""
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
