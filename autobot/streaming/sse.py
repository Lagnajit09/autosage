"""SSE (Server-Sent Events) frame formatter for autobot (T13).

Browsers (via the EventSource API or fetch-streaming readers) expect
each event to be a small text block:

    event: <name>\\n
    data: <utf8 payload>\\n
    \\n

The trailing blank line is the event terminator. Multiple `data:` lines
in a single event are concatenated with `\\n` by the EventSource parser,
so we always emit one-line, compact JSON to keep parsing trivial on the
client.

Event vocabulary used by the chat stream (T13+):

  • ``token``           — incremental text delta from the LLM.
  • ``done``            — final assistant message persisted by Django.
  • ``error``           — any failure after the stream has started
                          (Django down, LLM down, etc.); the HTTP
                          status is already 200 by the time we know.

T14 will add ``tool_call_start`` and ``tool_result`` here when the
tool-dispatch loop lands.

Frontend contract: every event payload is a single compact JSON object.
Clients never need to handle bare strings or multi-line `data:` blocks.
"""

from __future__ import annotations

import json
from typing import Any


def sse_event(name: str, data: Any) -> str:
    """Format one SSE event. Data is always JSON-encoded (compact).

    ``default=str`` is a safety net for datetime / UUID values that
    might slip into Django response envelopes.
    """
    payload = json.dumps(data, default=str, separators=(",", ":"))
    return f"event: {name}\ndata: {payload}\n\n"


def sse_token(content: str) -> str:
    """One text delta from the LLM. Multiple of these per chat turn."""
    return sse_event("token", {"content": content})


def sse_done(message: Any) -> str:
    """Final event of a chat turn. Payload is the persisted Django
    Message envelope's `data` dict (id, role=assistant, content, tokens).
    The client should treat this as authoritative — its `content` may
    differ from the concatenated tokens if the provider trimmed
    whitespace or our stream missed a chunk."""
    return sse_event("done", message)


def sse_error(message: str, *, code: str | None = None) -> str:
    """Mid-stream failure. Keep the message user-friendly — it surfaces
    in the chat UI. The optional `code` lets the client distinguish
    transport vs provider vs storage failures."""
    return sse_event("error", {"message": message, "code": code})
