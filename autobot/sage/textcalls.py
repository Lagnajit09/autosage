"""What a model writes that isn't meant for the user, and tool calls written as text.

A model's text can carry things that aren't prose:

* tool calls written out instead of sent natively — Hermes/Qwen
  `<tool_call>{json}</tool_call>`, Qwen3-coder `<function=x><parameter=k>v`,
  Claude-style `<function_calls><invoke name=…>`, Gemma `<tool_code>` /
  ```` ```tool_code ````, Mistral `[TOOL_CALLS]`, Llama `<|python_tag|>` or a
  bare `{"name": …, "parameters": …}`, DeepSeek's `<｜tool▁calls▁begin｜>`,
  gpt-oss `<|channel|>commentary to=functions.x<|message|>{…}`;
* reasoning (`<think>…</think>`, gpt-oss's analysis channel);
* leaked chat-template tokens (`<|im_end|>`, `<|eot_id|>`, `</s>`…).

`parse()` turns the calls into ordinary native tool calls — they then go
through the same server bounds (sage/tools.py) and the same CLI checks and
approvals as any other call — and returns the prose without the rest.
`StreamFilter` applies the same scan while the reply streams, so none of it
flashes on screen. One scanner (`_scan`) does both, so what's shown, what's
run and what's kept in history can't disagree.

Rendering the prose safely (HTML, links, terminal escapes) is the CLI's job:
it's the one that knows what its terminal does with them.

A model (or provider) that *rejects* the `tools` parameter is switched to
"text mode" (`tools_unsupported()` recognises the error): the tools are
described in the system prompt (`format_section()`), the model writes
`<tool_call>` blocks and `parse()` reads them back. The history always stays
in the native shape (assistant `tool_calls` + `tool` messages) so compaction
and model switches keep working; `to_text_messages()` renders it as text for a
text-mode request.

What counts as a call: anything in explicit call markup, whatever tool it
names (an unknown name gets the usual error back, so the model learns). JSON
with no markup around it — a bare object on its own line, or a ```json fence —
only when it's nothing but calls to tools this session actually has, so an
example in an answer is never run.
"""

from __future__ import annotations

import ast
import json
import re
import uuid
from typing import Any, Iterable

# --- the scanner ---------------------------------------------------------------

# Call markup opener → closer. A block runs to its closer, or to the end of
# the text when the model never closes it.
_CALL_TAGS: tuple[tuple[str, str], ...] = (
    ("<tool_call", "</tool_call>"),
    ("<function_calls", "</function_calls>"),
    ("<function=", "</function>"),
    ("<invoke", "</invoke>"),
    ("<tool_code", "</tool_code>"),
    ("<｜tool▁calls▁begin｜>", "<｜tool▁calls▁end｜>"),
)
# Fence languages that only ever hold a call, and ones that might.
_CALL_LANGS = frozenset({"tool_call", "tool_calls", "tool_code", "tool", "function_call",
                         "function_calls", "functions"})
_MAYBE_LANGS = frozenset({"", "json", "xml"})

_EVENT = re.compile(
    r"(?P<fence>^[ \t]*```(?P<lang>[\w-]*)[ \t]*\n)"
    r"|(?P<code>`+)"
    r"|(?P<tag><(?:tool_call\b|function_calls\b|function=|invoke\b|tool_code\b)|<｜tool▁calls▁begin｜>)"
    r"|(?P<think><(?P<tname>think|thinking|reasoning)>)"
    r"|(?P<stray></(?:think|thinking|reasoning)>)"
    r"|(?P<toend>\[TOOL_CALLS\]|<\|python_tag\|>)"
    r"|(?P<hstart><\|start\|>[^<\n]*)"
    r"|(?P<hchan><\|channel\|>)"
    r"|(?P<special><\|im_start\|>(?:system|user|assistant|tool)?\n?|<start_of_turn>(?:model|user)?\n?"
    r"|<\|[A-Za-z0-9_.-]{1,30}\|>|<｜[^｜\n]{1,40}｜>|</s>|<eos>|<end_of_turn>)"
    r"|(?P<json>^[ \t]*(?=\{|\[\s*\{))",
    re.I | re.M,
)
_FENCE_END = re.compile(r"^[ \t]*```[ \t]*$", re.M)
_HARMONY_END = re.compile(r"<\|(?:end|call|return|start)\|>")
_RECIPIENT = re.compile(r"to=functions\.([\w.-]+)")

# Text that may be the start of one of the above: held back while streaming
# until the next piece settles it.
_PARTIALS = ("<tool_call", "<function_calls", "<function=", "<invoke", "<tool_code", "<think>",
             "<thinking>", "<reasoning>", "</think>", "</thinking>", "</reasoning>",
             "[TOOL_CALLS]", "</s>", "<eos>", "<end_of_turn>", "<start_of_turn>")
_PARTIAL_TOKEN = re.compile(r"(?:<\|[\w.-]*\|?|<｜[^｜\n]*｜?)$")


class _Hold(Exception):
    """The rest of the text can't be settled until more of it arrives."""


def _closer(opener: str) -> str:
    low = opener.lower()
    return next(c for o, c in _CALL_TAGS if low.startswith(o.lower()))


def _find(text: str, needle: str, start: int) -> int:
    return text.lower().find(needle.lower(), start)


def _scan(text: str, names: frozenset[str], final: bool) -> tuple[str, list[tuple[str, Any]]]:
    """(the prose, the calls found) — while streaming (`final=False`), the
    prose stops where something is still unsettled."""
    out: list[str] = []
    calls: list[tuple[str, Any]] = []
    recipient: str | None = None           # gpt-oss: set by a <|start|> header
    i, n = 0, len(text)

    def drop() -> None:                     # no gap where something was removed
        if out:
            out[-1] = out[-1].rstrip()

    def need_more() -> None:
        if not final:
            raise _Hold

    try:
        while i < n:
            m = _EVENT.search(text, i)
            if m is None:
                out.append(text[i:])
                i = n
                break
            out.append(text[i:m.start()])
            kind = next(k for k in ("fence", "code", "tag", "think", "stray", "toend", "hstart",
                                    "hchan", "special", "json") if m.group(k) is not None)

            if kind == "fence":
                lang = m.group("lang").lower()
                close = _FENCE_END.search(text, m.end())
                end = close.end() if close else n
                body = text[m.end():close.start() if close else n]
                if lang in _CALL_LANGS or (lang in _MAYBE_LANGS and names):
                    if close is None:
                        need_more()
                    found = _fenced_calls(body, names, sure=lang in _CALL_LANGS)
                    if found is not None:
                        drop()
                        calls += found
                        i = end
                        continue
                out.append(text[m.start():end])        # ordinary code: shown as written
                i = end

            elif kind == "code":                       # inline code is never scanned
                run = m.group("code")
                blank = text.find("\n\n", m.end())
                close = re.compile(rf"(?<!`){run}(?!`)").search(text, m.end())
                if close is not None and (blank < 0 or close.start() < blank):
                    out.append(text[m.start():close.end()])
                    i = close.end()
                else:
                    if blank < 0:
                        need_more()                    # may still close
                    out.append(run)
                    i = m.end()

            elif kind == "tag":
                close_at = _find(text, _closer(m.group("tag")), m.end())
                if close_at < 0:
                    need_more()
                end = n if close_at < 0 else close_at + len(_closer(m.group("tag")))
                drop()
                calls += _block_calls(text[m.start():end])
                i = end

            elif kind == "think":
                closer = f"</{m.group('tname')}>"
                close_at = _find(text, closer, m.end())
                if close_at < 0:
                    need_more()
                drop()
                i = n if close_at < 0 else close_at + len(closer)

            elif kind in ("stray", "special"):
                drop()
                i = m.end()

            elif kind == "toend":
                need_more()
                drop()
                calls += _block_calls(text[m.end():], marker=m.group("toend"))
                i = n

            elif kind == "hstart":
                found = _RECIPIENT.search(m.group("hstart"))
                recipient = found.group(1) if found else None
                drop()
                i = m.end()

            elif kind == "hchan":
                msg_at = _find(text, "<|message|>", m.end())
                if msg_at < 0:
                    need_more()
                    drop()
                    i = n
                    continue
                header = text[m.end():msg_at]
                channel = (header.split() or [""])[0].lower()
                found = _RECIPIENT.search(header)
                target = found.group(1) if found else recipient
                recipient = None
                body_at = msg_at + len("<|message|>")
                drop()
                if channel != "analysis" and not target:
                    i = body_at                        # the answer itself: keep scanning it
                    continue
                stop = _HARMONY_END.search(text, body_at)
                if stop is None:
                    need_more()
                body = text[body_at:stop.start() if stop else n]
                if target:
                    calls.append((target, _value(body)))
                if stop is None:
                    i = n
                elif stop.group() == "<|start|>":
                    i = stop.start()                   # the next message's header
                else:
                    i = stop.end()

            else:  # "json": a line that starts like a call
                found = None
                if names:
                    need_more()                        # a call or not: known at the end
                    found = _whole_json_calls(text[m.end():], names)
                if found:
                    drop()
                    calls += found
                    i = n
                else:
                    out.append(text[m.start():m.end() + 1])
                    i = m.end() + 1
    except _Hold:
        return "".join(out).rstrip(), calls

    prose = "".join(out)
    if not final:
        prose = prose[:len(prose) - _partial_tail(prose)].rstrip()
    return prose, calls


def _partial_tail(text: str) -> int:
    """How much of the end could still turn into markup."""
    low = text.lower()
    best = 0
    for opener in _PARTIALS:
        for k in range(min(len(opener), len(low)), 0, -1):
            if low.endswith(opener[:k].lower()):
                best = max(best, k)
                break
    token = _PARTIAL_TOKEN.search(text)
    if token:
        best = max(best, len(token.group()))
    return best


def _tidy(prose: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", prose).strip()


# --- reading calls -------------------------------------------------------------

_QWEN_FN = re.compile(r"<function=\s*([^>\s]+)\s*>(.*?)(?:</function>|(?=<function=)|\Z)", re.S | re.I)
_QWEN_PARAM = re.compile(r"<parameter=\s*([^>\s]+)\s*>(.*?)(?:</parameter>|(?=<parameter=)|\Z)",
                         re.S | re.I)
_INVOKE = re.compile(r"<invoke\s+name\s*=\s*[\"']([^\"']+)[\"']\s*>(.*?)(?:</invoke>|(?=<invoke)|\Z)",
                     re.S | re.I)
_INVOKE_PARAM = re.compile(r"<parameter\s+name\s*=\s*[\"']([^\"']+)[\"']\s*>(.*?)</parameter>",
                           re.S | re.I)
_DEEPSEEK = re.compile(r"<｜tool▁call▁begin｜>(.*?)<｜tool▁sep｜>(.*?)(?:<｜tool▁call▁end｜>|\Z)", re.S)
_MISTRAL_V11 = re.compile(r"([\w.-]+)(?:\[CALL_ID\][\w-]*)?\[ARGS\]")
_TAGS = re.compile(r"</?(?:tool_call|function_calls|tool_code)\b[^>]*>", re.I)
_FENCE = re.compile(r"^\s*```[\w-]*\s*|\s*```\s*$")


def _value(raw: str) -> Any:
    """A parameter value: JSON when it parses (lists, numbers…), else the text."""
    text = _FENCE.sub("", raw.strip())
    try:
        return json.loads(text)
    except ValueError:
        return text


def _call_of(obj: Any) -> tuple[str, Any] | None:
    """One `{"name", "arguments"|"parameters"}` object (or OpenAI's
    `{"function": {…}}` wrapper) → (name, arguments)."""
    if isinstance(obj, dict) and isinstance(obj.get("function"), dict):
        obj = obj["function"]
    if not isinstance(obj, dict) or not isinstance(obj.get("name"), str):
        return None
    args = obj.get("arguments", obj.get("parameters", {}))
    return obj["name"], _value(args) if isinstance(args, str) else args


def _json_objects(body: str) -> tuple[list[Any], str]:
    """Every JSON value in `body`, and what's left between/around them."""
    decoder = json.JSONDecoder()
    found: list[Any] = []
    rest: list[str] = []
    i = 0
    while i < len(body):
        starts = [p for p in (body.find("{", i), body.find("[", i)) if p >= 0]
        if not starts:
            rest.append(body[i:])
            break
        at = min(starts)
        try:
            obj, end = decoder.raw_decode(body, at)
        except ValueError:
            rest.append(body[i:at + 1])
            i = at + 1
            continue
        rest.append(body[i:at])
        found.extend(obj if isinstance(obj, list) else [obj])
        i = end
    return found, "".join(rest)


def _json_calls(body: str) -> list[tuple[str, Any]]:
    found, _ = _json_objects(_FENCE.sub("", _TAGS.sub("", body).strip()))
    return [c for c in map(_call_of, found) if c]


def _whole_json_calls(body: str, names: frozenset[str]) -> list[tuple[str, Any]] | None:
    """Calls, when `body` is nothing but calls to tools in `names`."""
    found, rest = _json_objects(body)
    if not found or rest.strip(" \t\r\n,;"):
        return None
    calls = [_call_of(obj) for obj in found]
    if all(c is not None and c[0] in names for c in calls):
        return calls                                          # type: ignore[return-value]
    return None


def _python_calls(body: str) -> list[tuple[str, Any]]:
    """Gemma's `tool_code`: `name(key=value, …)` (literals only, never evaluated)."""
    try:
        tree = ast.parse(_FENCE.sub("", body.strip()))
    except (SyntaxError, ValueError):
        return []
    calls = []
    for stmt in tree.body:
        node = stmt.value if isinstance(stmt, ast.Expr) else None
        if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "print" and node.args:
            node = node.args[0]                               # print(default_api.x(...))
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
        try:
            args = {kw.arg: ast.literal_eval(kw.value) for kw in node.keywords if kw.arg}
        except (ValueError, SyntaxError, TypeError):
            continue
        if name:
            calls.append((name, args))
    return calls


def _block_calls(block: str, marker: str = "") -> list[tuple[str, Any]]:
    if marker.upper() == "[TOOL_CALLS]":
        calls = _json_calls(block)
        if not calls:                                         # newer: name[ARGS]{json}
            decoder = json.JSONDecoder()
            for m in _MISTRAL_V11.finditer(block):
                try:
                    calls.append((m.group(1), decoder.raw_decode(block, m.end())[0]))
                except ValueError:
                    pass
        return calls
    if marker:                                                # <|python_tag|>
        return _json_calls(block)
    if "<｜tool▁sep｜>" in block:
        calls = []
        for m in _DEEPSEEK.finditer(block):
            head, tail = m.group(1).strip(), m.group(2).strip()
            if tail.startswith(("{", "```")):                 # name<sep>{json}
                calls.append((head, _value(tail)))
            else:                                             # function<sep>name\n```json…```
                name, _, args = tail.partition("\n")
                calls.append((name.strip(), _value(args)))
        return calls
    calls = [(m.group(1), {p.group(1): _value(p.group(2)) for p in _QWEN_PARAM.finditer(m.group(2))})
             for m in _QWEN_FN.finditer(block)]
    if not calls:
        calls = [(m.group(1), {p.group(1): _value(p.group(2)) for p in _INVOKE_PARAM.finditer(m.group(2))})
                 for m in _INVOKE.finditer(block)]
    if not calls and block.lower().startswith("<tool_code"):
        calls = _python_calls(_TAGS.sub("", block))
    return calls or _json_calls(block)


def _fenced_calls(body: str, names: frozenset[str], *, sure: bool) -> list[tuple[str, Any]] | None:
    """The calls in a fenced block, or None when it's ordinary code. A fence
    labelled as a call is always one (dropped even if unreadable)."""
    stripped = body.strip()
    if sure:
        return _block_calls(stripped) or _python_calls(stripped)
    opener = _EVENT.match(stripped)
    if opener is not None and opener.group("tag"):
        return _block_calls(stripped) or None
    return _whole_json_calls(stripped, names)


def _native(calls: Iterable[tuple[str, Any]]) -> list[dict[str, Any]]:
    return [{
        "id": f"call_{uuid.uuid4().hex[:24]}", "type": "function",
        "function": {"name": str(name).strip(),
                     "arguments": json.dumps(args if isinstance(args, dict) else {}, ensure_ascii=False)},
    } for name, args in calls]


def parse(text: str, names: Iterable[str] = ()) -> tuple[str, list[dict[str, Any]]]:
    """(the prose, tool calls written in it) in the native tool_call shape.

    `names` are the tools this session has; bare JSON only counts as a call
    when it names one of them.
    """
    prose, calls = _scan(text, frozenset(names), final=True)
    return _tidy(prose), _native(calls)


def strip_tool_markup(text: str, names: Iterable[str] = ()) -> str:
    """The reply as prose: no calls, reasoning or template tokens."""
    return _tidy(_scan(text, frozenset(names), final=True)[0])


# --- streaming -----------------------------------------------------------------

class StreamFilter:
    """Pass a reply's text through as it streams, minus everything `parse()`
    removes. Text that might still turn into markup (an unclosed block, "<too"
    at the end of a piece) is held until the next piece settles it; nothing
    shown is ever taken back.
    """

    def __init__(self, names: Iterable[str] = ()) -> None:
        self._names = frozenset(names)
        self._text = ""
        self._shown = ""

    def feed(self, piece: str) -> str:
        self._text += piece
        return self._advance(_scan(self._text, self._names, final=False)[0])

    def finish(self) -> str:
        """What's left to show once the reply ends."""
        return self._advance(_scan(self._text, self._names, final=True)[0].rstrip())

    def _advance(self, prose: str) -> str:
        prose = prose.lstrip()
        if not prose.startswith(self._shown):
            return ""                       # never retract what's on screen
        new, self._shown = prose[len(self._shown):], prose
        return new


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
