"""Keeping a Sage conversation's history small: old tool output is shortened.

Every tool result (a file read, a command's output) and every file the model
wrote stays in the history and is resent to the model on every later round.
With file tools that adds up fast. So once a turn is no longer one of the most
recent (`SAGE_FULL_TOOL_TURNS`), its long tool results become a short digest
(the result's first line plus the start and end of the output) and the file
text in its write_file/edit_file calls becomes a placeholder. The model is told
(prompts.py) to call a tool again when it needs exact content.

Compaction never removes a message: tool messages still answer their calls,
so the history stays valid for every provider. It is idempotent (a digest is
never re-digested) and deterministic, so a compacted turn stays byte-identical
afterwards and the provider's prompt cache keeps working from there on.
If the history is still over its character budget, older turns are dropped
whole (conversation.py).
"""

from __future__ import annotations

import json
from typing import Any

TRIMMED = "[trimmed from history"
_HEAD_LINES = 3
_TAIL_LINES = 2
_LINE_CHARS = 200
_ARG_CHARS = 200            # file text in an old call longer than this becomes a placeholder


def _line(text: str) -> str:
    return text if len(text) <= _LINE_CHARS else text[:_LINE_CHARS - 1] + "…"


def digest_result(content: str, limit: int) -> str:
    """A long tool result as a short digest; short ones (and digests) unchanged."""
    if len(content) <= limit or TRIMMED in content:
        return content
    if content.startswith("error:"):
        return content[:limit - 1] + "…"
    head, *body = content.splitlines() or [""]
    if len(body) > _HEAD_LINES + _TAIL_LINES:
        shown = [*body[:_HEAD_LINES], "…", *body[-_TAIL_LINES:]]
    else:
        shown = body
    note = (f"{TRIMMED}: {len(body)} lines, {len(content)} characters. Call the tool again if "
            "you need the full output.]")
    return "\n".join([_line(head), *(_line(s) for s in shown), note])


def _placeholder(text: str) -> str:
    lines = text.count("\n") + (0 if text.endswith("\n") else 1)
    return f"{TRIMMED}: {lines} lines]"


def _compact_arguments(name: str, raw: str) -> str:
    """write_file/edit_file arguments without their file text; others unchanged."""
    if name not in ("write_file", "edit_file") or TRIMMED in raw or len(raw) <= _ARG_CHARS:
        return raw
    try:
        args = json.loads(raw)
    except ValueError:
        return raw
    if not isinstance(args, dict):
        return raw
    if isinstance(args.get("content"), str) and len(args["content"]) > _ARG_CHARS:
        args["content"] = _placeholder(args["content"])
    if isinstance(args.get("edits"), list):
        for edit in args["edits"]:
            if isinstance(edit, dict):
                for key in ("old_text", "new_text"):
                    if isinstance(edit.get(key), str) and len(edit[key]) > _ARG_CHARS:
                        edit[key] = _placeholder(edit[key])
    return json.dumps(args, ensure_ascii=False)


def compact_turn(turn: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """A copy of a finished turn with long tool output and file text shortened."""
    out = []
    for message in turn:
        role = message.get("role")
        if role == "tool" and isinstance(message.get("content"), str):
            message = {**message, "content": digest_result(message["content"], limit)}
        elif role == "assistant" and message.get("tool_calls"):
            calls = []
            for call in message["tool_calls"]:
                fn = call.get("function") or {}
                raw = fn.get("arguments")
                if isinstance(raw, str):
                    fn = {**fn, "arguments": _compact_arguments(str(fn.get("name") or ""), raw)}
                    call = {**call, "function": fn}
                calls.append(call)
            message = {**message, "tool_calls": calls}
        out.append(message)
    return out


def turn_chars(turn: list[dict[str, Any]]) -> int:
    """Roughly what a turn costs to resend: its text plus tool-call arguments."""
    total = 0
    for message in turn:
        total += len(str(message.get("content") or ""))
        for call in message.get("tool_calls") or []:
            total += len(str((call.get("function") or {}).get("arguments") or ""))
    return total
