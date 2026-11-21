"""Tool calls for models without (reliable) native tool support.

Two situations, one mechanism:

* A model that *has* native tools sometimes writes its call out as text
  instead — Hermes/Qwen `<tool_call>{json}</tool_call>`, Qwen3-coder
  `<function=name><parameter=k>v</parameter></function>`, or Claude-style
  `<function_calls><invoke name="…">…</invoke></function_calls>`. `parse()`
  turns those into ordinary tool calls, so they reach the CLI's approval
  cards like any other call, and `StreamFilter` keeps the markup off the
  user's screen while the reply streams.

* A model (or provider) that *rejects* the `tools` parameter is switched to
  "text mode" (`tools_unsupported()` recognises the error): the tools are
  described in the system prompt (`format_section()`), the model writes
  `<tool_call>` blocks, and `parse()` reads them back.

The conversation history always stays in the native shape (assistant
`tool_calls` + `tool` messages) so compaction and model switches keep
working; `to_text_messages()` renders it as plain text for a text-mode
request. Nothing here decides what may run: parsed calls go through the same
server bounds (sage/tools.py) and the same CLI checks and approvals.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

# Opener → its closer. A block runs from an opener to its closer, or to the
# end of the text if it's never closed (a model often stops mid-markup).
_BLOCKS: tuple[tuple[str, str], ...] = (
    ("<tool_call", "</tool_call>"),
    ("<function_calls", "</function_calls>"),
    ("<function=", "</function>"),
    ("<invoke", "</invoke>"),
)
_OPEN = re.compile(r"<(?:tool_call\b|function_calls\b|function=|invoke\b)", re.I)
_OPENERS = tuple(o for o, _ in _BLOCKS)

_QWEN_FN = re.compile(r"<function=\s*([^>\s]+)\s*>(.*?)(?:</function>|(?=<function=)|\Z)", re.S | re.I)
_QWEN_PARAM = re.compile(r"<parameter=\s*([^>\s]+)\s*>(.*?)(?:</parameter>|(?=<parameter=)|\Z)",
                         re.S | re.I)
_INVOKE = re.compile(r"<invoke\s+name\s*=\s*[\"']([^\"']+)[\"']\s*>(.*?)(?:</invoke>|(?=<invoke)|\Z)",
                     re.S | re.I)
_INVOKE_PARAM = re.compile(r"<parameter\s+name\s*=\s*[\"']([^\"']+)[\"']\s*>(.*?)</parameter>",
                           re.S | re.I)
_TAGS = re.compile(r"</?(?:tool_call|function_calls)\b[^>]*>", re.I)
_FENCE = re.compile(r"^```[a-zA-Z]*\s*|\s*```$")


def _closer_for(opener_text: str) -> str:
    low = opener_text.lower()
    return next(c for o, c in _BLOCKS if low.startswith(o))


def split(text: str) -> tuple[str, list[str]]:
    """(the prose, the markup blocks) of a reply."""
    prose: list[str] = []
    blocks: list[str] = []
    rest = text
    while (start := _OPEN.search(rest)) is not None:
        prose.append(rest[:start.start()])
        closer = _closer_for(rest[start.start():start.end()])
        end = rest.lower().find(closer.lower(), start.end())
        end = len(rest) if end < 0 else end + len(closer)
        blocks.append(rest[start.start():end])
        rest = rest[end:]
    prose.append(rest)
    return re.sub(r"\n{3,}", "\n\n", "".join(prose)).strip(), blocks


def strip_tool_markup(text: str) -> str:
    """The reply without any tool calls written as text."""
    return split(text)[0]


# --- reading calls -------------------------------------------------------------

def _value(raw: str) -> Any:
    """A parameter value: JSON when it parses (lists, numbers…), else the text."""
    text = raw.strip()
    try:
        return json.loads(text)
    except ValueError:
        return text


def _json_calls(block: str) -> list[tuple[str, Any]]:
    """`{"name": …, "arguments": {…}}` objects (one, several, or a list)."""
    body = _FENCE.sub("", _TAGS.sub("", block).strip())
    decoder = json.JSONDecoder()
    found: list[Any] = []
    i = 0
    while i < len(body):
        j = body.find("{", i)
        k = body.find("[", i)
        starts = [p for p in (j, k) if p >= 0]
        if not starts:
            break
        i = min(starts)
        try:
            obj, end = decoder.raw_decode(body, i)
        except ValueError:
            i += 1
            continue
        found.extend(obj if isinstance(obj, list) else [obj])
        i = end
    calls = []
    for obj in found:
        if not isinstance(obj, dict) or not isinstance(obj.get("name"), str):
            continue
        args = obj.get("arguments", obj.get("parameters", {}))
        if isinstance(args, str):
            args = _value(args)
        calls.append((obj["name"], args))
    return calls


def _block_calls(block: str) -> list[tuple[str, Any]]:
    calls = [(m.group(1), {p.group(1): _value(p.group(2)) for p in _QWEN_PARAM.finditer(m.group(2))})
             for m in _QWEN_FN.finditer(block)]
    if not calls:
        calls = [(m.group(1), {p.group(1): _value(p.group(2)) for p in _INVOKE_PARAM.finditer(m.group(2))})
                 for m in _INVOKE.finditer(block)]
    return calls or _json_calls(block)


def parse(text: str) -> tuple[str, list[dict[str, Any]]]:
    """(the prose, tool calls written in it) in the native tool_call shape.

    Unknown tool names are kept: the dispatcher answers them with an error the
    model can learn from, same as a hallucinated native call.
    """
    prose, blocks = split(text)
    calls = []
    for block in blocks:
        for name, args in _block_calls(block):
            calls.append({
                "id": f"call_{uuid.uuid4().hex[:24]}", "type": "function",
                "function": {"name": name.strip(),
                             "arguments": json.dumps(args if isinstance(args, dict) else {},
                                                     ensure_ascii=False)},
            })
    return prose, calls


# --- streaming -----------------------------------------------------------------

class StreamFilter:
    """Pass a reply's text through as it streams, minus any tool-call markup.

    Everything from the first opener on is held back (the call is read from
    the full content at the end). A chunk ending in what could be the start of
    an opener ("<too") is held until the next chunk settles it.
    """

    def __init__(self) -> None:
        self._pending = ""
        self._held = False
        self._rest = ""

    def feed(self, piece: str) -> str:
        if self._held:
            self._rest += piece
            return ""
        text = self._pending + piece
        start = _OPEN.search(text)
        if start is not None:
            self._held = True
            self._pending = ""
            self._rest = text[start.start():]
            return text[:start.start()].rstrip()
        # Hold a possible partial opener, and the whitespace before it, so a
        # call that follows doesn't leave a dangling space on screen.
        cut = len(text) - self._partial_tail(text)
        while cut > 0 and text[cut - 1].isspace():
            cut -= 1
        self._pending = text[cut:]
        return text[:cut]

    def finish(self) -> str:
        """What's left to show once the reply ends: a held-back partial opener
        that never became one, or prose after the markup's closer."""
        if not self._held:
            out, self._pending = self._pending, ""
            return out
        prose = strip_tool_markup(self._rest)
        return f" {prose}" if prose else ""

    @staticmethod
    def _partial_tail(text: str) -> int:
        low = text.lower()
        best = 0
        for opener in _OPENERS:
            for n in range(min(len(opener) - 1, len(low)), 0, -1):
                if low.endswith(opener[:n]):
                    best = max(best, n)
                    break
        return best


# --- models that reject the tools parameter ------------------------------------

_UNSUPPORTED = re.compile(
    r"(does ?n[o']t|do ?n[o']t|not|un)\s*support\w*\W+(\w+\W+){0,4}?(tools?|tool[ _-]?(use|calls?|calling|choice)"
    r"|function[ _-]?call\w*|functions)\b"
    r"|(tools?|tool[ _-]?(use|calls?|calling|choice)|function[ _-]?call\w*)\W+(\w+\W+){0,4}?"
    r"(is|are)\s+(not|un)\s*(supported|available|enabled|allowed)"
    r"|no endpoints found that support tool",
    re.I,
)


def tools_unsupported(message: str) -> bool:
    """Whether a provider error means "this model can't take tools"."""
    return bool(_UNSUPPORTED.search(message or ""))


def format_section(schemas: list[dict[str, Any]]) -> str:
    """The system-prompt section that teaches a text-mode model to call tools."""
    lines = []
    for schema in schemas:
        fn = schema.get("function") or {}
        params = json.dumps(fn.get("parameters") or {}, separators=(",", ":"), ensure_ascii=False)
        lines.append(f"- {fn.get('name')}: {fn.get('description', '').strip()}\n  arguments: {params}")
    return (
        "\n## How to call tools (this model)\n"
        "Call a tool by writing a block exactly like this, with the arguments as JSON:\n"
        "<tool_call>\n{\"name\": \"sagex_read\", \"arguments\": {\"args\": [\"list\", \"workflow\"]}}\n"
        "</tool_call>\n"
        "Put any calls at the end of your message and stop right after them; each result "
        "comes back in a <tool_response> block. Never write a <tool_response> yourself and "
        "never guess a result. A message without a <tool_call> is your answer to the user.\n"
        "Tools:\n" + "\n".join(lines) + "\n"
    )


def to_text_messages(messages: list[dict[str, Any]], section: str | None) -> list[dict[str, Any]]:
    """Native history → plain messages a text-mode model accepts.

    Assistant tool calls become `<tool_call>` blocks, tool results become
    `<tool_response>` user messages; consecutive user messages are merged
    (some providers insist on alternating roles). `section` (the tool format)
    is appended to the system prompt when tools are available this round.
    """
    names: dict[str, str] = {}
    out: list[dict[str, Any]] = []

    def add(role: str, content: str) -> None:
        if out and role == "user" and out[-1]["role"] == "user":
            out[-1] = {"role": "user", "content": f"{out[-1]['content']}\n\n{content}"}
        else:
            out.append({"role": role, "content": content})

    for m in messages:
        role = m.get("role")
        content = m.get("content") or ""
        if role == "system":
            add("system", content + (section or ""))
        elif role == "assistant" and m.get("tool_calls"):
            parts = [content] if content else []
            for call in m["tool_calls"]:
                fn = call.get("function") or {}
                names[call.get("id") or ""] = fn.get("name") or ""
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except ValueError:
                    args = fn.get("arguments") or ""
                parts.append("<tool_call>\n" + json.dumps({"name": fn.get("name"), "arguments": args},
                                                          ensure_ascii=False) + "\n</tool_call>")
            add("assistant", "\n".join(parts))
        elif role == "tool":
            name = names.get(m.get("tool_call_id") or "", "")
            label = f' name="{name}"' if name else ""
            add("user", f"<tool_response{label}>\n{content}\n</tool_response>")
        else:
            add(str(role), content)
    return out
