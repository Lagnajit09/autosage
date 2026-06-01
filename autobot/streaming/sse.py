"""SSE frame formatter for autobot.

Each event is emitted as a single compact-JSON `data:` line:

    event: <name>\\n
    data: <utf8 payload>\\n
    \\n

Event vocabulary used by the chat stream:
  • stream_start    — first frame; carries `stream_id` for /token-refresh/.
  • token           — incremental text delta from the LLM.
  • tool_call_start — model decided to invoke a tool.
  • tool_result     — tool finished; result is data dict or {"error": "..."}.
  • done            — final assistant message persisted by Django.
  • error           — failure after the stream started (HTTP is already 200).
"""

from __future__ import annotations

import json
from typing import Any


def sse_event(name: str, data: Any) -> str:
    """Format one SSE event with compact JSON payload."""
    payload = json.dumps(data, default=str, separators=(",", ":"))
    return f"event: {name}\ndata: {payload}\n\n"


def sse_stream_start(stream_id: str, thread_id: str) -> str:
    return sse_event("stream_start", {
        "stream_id": stream_id,
        "thread_id": thread_id,
    })


def sse_token(content: str) -> str:
    return sse_event("token", {"content": content})


def sse_done(message: Any) -> str:
    """Final event of a chat turn — payload is the persisted Message dict.

    The client should treat this as authoritative; its `content` may
    differ from concatenated tokens if the provider trimmed whitespace
    or a chunk was missed.
    """
    return sse_event("done", message)


def sse_error(message: str, *, code: str | None = None) -> str:
    """Mid-stream failure. `message` surfaces in the UI."""
    return sse_event("error", {"message": message, "code": code})


def sse_tool_call_start(call_id: str, name: str, arguments: str) -> str:
    """`arguments` is the raw JSON string from the LLM — not re-parsed."""
    return sse_event("tool_call_start", {
        "id": call_id,
        "name": name,
        "arguments": arguments,
    })


def sse_tool_result(call_id: str, name: str, result: Any) -> str:
    return sse_event("tool_result", {
        "id": call_id,
        "name": name,
        "result": result,
    })
