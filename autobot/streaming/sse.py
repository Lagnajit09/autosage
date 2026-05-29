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

  • ``stream_start``    — first frame of every stream. Carries the
                          `stream_id` the client passes to the
                          `/token-refresh/` endpoint to swap a fresh
                          JWT into the in-flight handle (T18).
                          Payload: ``{stream_id, thread_id}``.
  • ``token``           — incremental text delta from the LLM.
  • ``tool_call_start`` — the LLM has decided to invoke a tool. T14.
                          Payload: ``{id, name, arguments}`` (arguments
                          as a JSON-encoded string, ready for the
                          frontend to JSON.parse or display verbatim).
  • ``tool_result``     — the tool finished. T14.
                          Payload: ``{id, name, result}`` where `result`
                          is either the tool's data dict OR
                          ``{"error": "..."}`` on failure.
  • ``done``            — final assistant message persisted by Django.
  • ``error``           — any failure after the stream has started
                          (Django down, LLM down, etc.); the HTTP
                          status is already 200 by the time we know.

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


def sse_stream_start(stream_id: str, thread_id: str) -> str:
    """First event of every chat stream (T18).

    Carries the `stream_id` the client uses when calling
    `POST /threads/<id>/token-refresh/` to swap a refreshed JWT into
    the in-flight stream's auth handle. Also echoes `thread_id` so
    clients with multiple parallel streams can dispatch by context.
    """
    return sse_event("stream_start", {
        "stream_id": stream_id,
        "thread_id": thread_id,
    })


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


def sse_tool_call_start(call_id: str, name: str, arguments: str) -> str:
    """Emitted just before dispatching a tool. `arguments` is the raw
    JSON string the LLM produced (we don't re-parse it here — the
    frontend either renders it verbatim as a "Working: ..." badge or
    calls `JSON.parse` to display structured fields)."""
    return sse_event("tool_call_start", {
        "id": call_id,
        "name": name,
        "arguments": arguments,
    })


def sse_tool_result(call_id: str, name: str, result: Any) -> str:
    """Emitted right after the tool finishes. `result` is the dict the
    handler returned — either the tool's data OR ``{"error": "..."}``.
    The chat router persists the same dict to Django as the content of
    a ``role: "tool"`` message so the LLM sees it on the next round."""
    return sse_event("tool_result", {
        "id": call_id,
        "name": name,
        "result": result,
    })
