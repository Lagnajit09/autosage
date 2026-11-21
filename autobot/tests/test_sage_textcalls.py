"""Tool calls written as text (sage/textcalls.py): reading them, hiding them
while streaming, and rendering history for models that reject native tools."""

import json

import pytest

from sage import textcalls as tc


def _calls(text):
    prose, calls = tc.parse(text)
    return prose, [(c["function"]["name"], json.loads(c["function"]["arguments"])) for c in calls]


# --- the formats models actually write ------------------------------------------

def test_hermes_json():
    assert _calls('Looking. <tool_call>\n{"name": "sagex_read", "arguments": {"args": '
                  '["list", "run"]}}\n</tool_call>') == (
        "Looking.", [("sagex_read", {"args": ["list", "run"]})])


def test_qwen_coder_parameters():
    # What the user's session showed at the step limit.
    text = ('The server still has the template. Let me push it. <tool_call> '
            '<function=sagex_change> <parameter=args> ["push", "script", "scripts/r.sh"] '
            '</parameter> <parameter=summary> Push the real r.sh </parameter> </function> </tool_call>')
    assert _calls(text) == ("The server still has the template. Let me push it.", [
        ("sagex_change", {"args": ["push", "script", "scripts/r.sh"], "summary": "Push the real r.sh"})])


def test_claude_style_invoke():
    text = ('<function_calls><invoke name="read_file"><parameter name="path">scripts/a.sh'
            '</parameter><parameter name="offset">40</parameter></invoke></function_calls>')
    assert _calls(text) == ("", [("read_file", {"path": "scripts/a.sh", "offset": 40})])


def test_several_calls_and_string_arguments():
    text = ('<tool_call>{"name": "sagex_read", "arguments": "{\\"args\\": [\\"list\\", \\"server\\"]}"}'
            '</tool_call>\n<tool_call>{"name": "sagex_help", "parameters": {"command": ["run"]}}</tool_call>')
    assert _calls(text)[1] == [("sagex_read", {"args": ["list", "server"]}),
                               ("sagex_help", {"command": ["run"]})]


def test_unclosed_markup_still_counts():
    assert _calls('Ok <tool_call>{"name": "sagex_read", "arguments": {"args": ["list"]}}')[1] == [
        ("sagex_read", {"args": ["list"]})]


def test_bare_function_block():
    assert _calls("<function=sagex_help><parameter=command>[\"run\"]</parameter></function>")[1] == [
        ("sagex_help", {"command": ["run"]})]


@pytest.mark.parametrize("text", [
    "Use `<b>` tags in HTML.",
    'Here is JSON: {"name": "x", "arguments": {}}',          # no tags: an example, not a call
    "if a < b and c > d",
])
def test_ordinary_text_is_not_a_call(text):
    assert tc.parse(text) == (text, [])


def test_garbage_inside_tags_is_dropped_not_run():
    prose, calls = tc.parse("Sure. <tool_call>oops, not json</tool_call>")
    assert prose == "Sure." and calls == []


NAMES = {"sagex_read", "sagex_help", "read_file"}


def _named(text):
    prose, calls = tc.parse(text, NAMES)
    return prose, [(c["function"]["name"], json.loads(c["function"]["arguments"])) for c in calls]


def test_mistral_tool_calls():
    assert _named('[TOOL_CALLS][{"name": "sagex_read", "arguments": {"args": ["list"]}}]') == (
        "", [("sagex_read", {"args": ["list"]})])
    assert _named('Checking.[TOOL_CALLS]sagex_help[ARGS]{"command": ["run"]}') == (
        "Checking.", [("sagex_help", {"command": ["run"]})])


def test_llama_python_tag_and_bare_json():
    assert _named('<|python_tag|>{"name": "sagex_read", "parameters": {"args": ["list"]}}<|eom_id|>')[1] == [
        ("sagex_read", {"args": ["list"]})]
    assert _named('{"name": "sagex_read", "parameters": {"args": ["list", "run"]}}') == (
        "", [("sagex_read", {"args": ["list", "run"]})])
    assert _named('I will look.\n{"type": "function", "function": {"name": "read_file", '
                  '"arguments": {"path": "a.sh"}}}') == ("I will look.", [("read_file", {"path": "a.sh"})])


def test_gemma_tool_code():
    assert _named("```tool_code\nprint(default_api.sagex_read(args=['list', 'run']))\n```")[1] == [
        ("sagex_read", {"args": ["list", "run"]})]
    assert _named("<tool_code>read_file(path='a.sh', offset=3)</tool_code>")[1] == [
        ("read_file", {"path": "a.sh", "offset": 3})]
    # Never evaluated: a non-literal argument just isn't a call.
    assert _named("```tool_code\nread_file(path=__import__('os').getcwd())\n```") == ("", [])


def test_deepseek_tokens():
    old = ('<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>function<｜tool▁sep｜>sagex_read\n```json\n'
           '{"args": ["list"]}\n```<｜tool▁call▁end｜><｜tool▁calls▁end｜>')
    new = ('<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>sagex_help<｜tool▁sep｜>{"command": ["run"]}'
           '<｜tool▁call▁end｜><｜tool▁calls▁end｜><｜end▁of▁sentence｜>')
    assert _named(old) == ("", [("sagex_read", {"args": ["list"]})])
    assert _named(new) == ("", [("sagex_help", {"command": ["run"]})])


def test_gpt_oss_channels():
    text = ('<|channel|>analysis<|message|>The user wants runs.<|end|>'
            '<|start|>assistant<|channel|>commentary to=functions.sagex_read <|constrain|>json'
            '<|message|>{"args": ["list", "run"]}<|call|>')
    assert _named(text) == ("", [("sagex_read", {"args": ["list", "run"]})])
    answer = ('<|channel|>analysis<|message|>think think<|end|><|start|>assistant'
              '<|channel|>final<|message|>Two runs failed.<|return|>')
    assert _named(answer) == ("Two runs failed.", [])


def test_json_that_is_not_a_call_stays():
    # An example in an answer: unknown name, or prose around it, or no tools at all.
    example = '```json\n{"name": "deploy", "nodes": []}\n```'
    assert tc.parse(example, NAMES) == (example, [])
    assert tc.parse('{"name": "sagex_read", "arguments": {}}') == (
        '{"name": "sagex_read", "arguments": {}}', [])            # session without tools
    mixed = '```json\n{"name": "sagex_read", "arguments": {}}\nplus a note\n```'
    assert tc.parse(mixed, NAMES) == (mixed, [])
    assert _named('```json\n{"name": "sagex_read", "arguments": {"args": ["list"]}}\n```')[1] == [
        ("sagex_read", {"args": ["list"]})]


def test_reasoning_and_template_tokens_are_removed():
    assert tc.strip_tool_markup("<think>\nThe user wants X.\n</think>\n\nHere it is.<|im_end|>") == "Here it is."
    assert tc.strip_tool_markup("<thinking>a</thinking>Done.</s>") == "Done."
    assert tc.strip_tool_markup("Answer.<|eot_id|>") == "Answer."
    assert tc.strip_tool_markup("<|im_start|>assistant\nHi") == "Hi"
    assert tc.strip_tool_markup("stray</think> close") == "stray close"
    assert tc.strip_tool_markup("<think>never closed") == ""


def test_markup_inside_code_is_left_alone():
    for text in ("Wrap reasoning in `<think>` tags.",
                 "```bash\necho '<tool_call>' # <|im_end|>\n```",
                 "```python\nprint('[TOOL_CALLS]')\n```"):
        assert tc.parse(text, NAMES) == (text, [])


# --- streaming ------------------------------------------------------------------

def _stream(pieces):
    f = tc.StreamFilter()
    return "".join(f.feed(p) for p in pieces) + f.finish()


def test_stream_hides_markup_split_across_chunks():
    pieces = ["Let me ", "check. <to", "ol_call>{\"name\": ", "\"sagex_read\"}</tool_call>"]
    assert _stream(pieces) == "Let me check."


def test_stream_releases_a_lone_angle_bracket():
    assert _stream(["a <", " b"]) == "a < b"
    assert _stream(["ends with <"]) == "ends with <"


def test_stream_keeps_prose_after_a_closed_call():
    assert _stream(["A <tool_call>{}</tool_call>", " then B"]) == "A then B"


_SAMPLES = [
    "Let me check. <tool_call>{\"name\": \"sagex_read\", \"arguments\": {}}</tool_call>",
    "<think>plan it</think>\n\nThe run **failed** at `step 2` (exit 1).<|im_end|>",
    "Use `<think>` tags.\n\n```bash\necho \"<tool_call>\"\n```\nDone [TOOL_CALLS][{\"name\": \"x\"}]",
    "Looking.\n{\"name\": \"sagex_read\", \"parameters\": {\"args\": [\"list\"]}}",
    "Example:\n```json\n{\"name\": \"deploy\"}\n```\nand a < b > c.",
    "<|channel|>analysis<|message|>hm<|end|><|start|>assistant<|channel|>final<|message|>All good.<|return|>",
    "Answer with a [link](https://x.example) and a table:\n\n| a | b |\n|---|---|\n| 1 | 2 |",
]


@pytest.mark.parametrize("text", _SAMPLES)
def test_streaming_matches_the_final_text_at_every_split(text):
    final = tc.strip_tool_markup(text, NAMES)
    for cut in range(1, len(text)):
        f = tc.StreamFilter(NAMES)
        shown = f.feed(text[:cut]) + f.feed(text[cut:]) + f.finish()
        assert shown == final, cut
    # One character at a time, too.
    f = tc.StreamFilter(NAMES)
    assert "".join(f.feed(ch) for ch in text) + f.finish() == final


def test_stream_holds_an_unsettled_json_fence():
    f = tc.StreamFilter(NAMES)
    assert f.feed("Here:\n```json\n{\"name\": \"sagex_read\"") == "Here:"
    assert f.feed(", \"arguments\": {}}\n```") == ""          # a call: never shown
    assert f.finish() == ""


# --- models that reject tools -----------------------------------------------------

@pytest.mark.parametrize("message", [
    "registry.ollama.ai/library/gemma:2b does not support tools",
    "litellm.BadRequestError: OpenrouterException - No endpoints found that support tool use.",
    "This model doesn't support function calling",
    "groq does not support parameters: {'tools': [...]}",
    "Tool use is not supported for this model",
    "tool_choice is not supported",
    "Function calling is not enabled for models/gemma-3-27b-it",
    "deepseek-reasoner does not support Function Calling",
    "tool calling is not supported with this model",
])
def test_tool_rejections_are_recognised(message):
    assert tc.tools_unsupported(message)


@pytest.mark.parametrize("message", [
    "Rate limit reached for model",
    "Invalid value for parameter: tools[0].function.name",
    "This model does not support images",
    "context length exceeded",
])
def test_other_errors_are_not(message):
    assert not tc.tools_unsupported(message)


def test_history_renders_as_text():
    call = {"id": "c1", "type": "function",
            "function": {"name": "sagex_read", "arguments": '{"args": ["list", "run"]}'}}
    messages = [
        {"role": "system", "content": "SYS"},
        {"role": "user", "content": "runs?"},
        {"role": "assistant", "content": "Checking.", "tool_calls": [call]},
        {"role": "tool", "tool_call_id": "c1", "content": "run-1 ok"},
        {"role": "user", "content": "[note]"},
    ]
    out = tc.to_text_messages(messages, "\nFORMAT")
    assert [m["role"] for m in out] == ["system", "user", "assistant", "user"]
    assert out[0]["content"] == "SYS\nFORMAT"
    assert out[2]["content"].startswith("Checking.\n<tool_call>\n")
    assert json.loads(out[2]["content"].split("\n")[2]) == {"name": "sagex_read",
                                                            "arguments": {"args": ["list", "run"]}}
    # The result and the following user message merge (alternating roles).
    assert out[3]["content"] == '<tool_response name="sagex_read">\nrun-1 ok\n</tool_response>\n\n[note]'
    assert all(set(m) == {"role", "content"} for m in out)


def test_format_section_lists_every_tool():
    schemas = [{"type": "function", "function": {"name": "sagex_read", "description": "Read.",
                                                 "parameters": {"type": "object"}}}]
    section = tc.format_section(schemas)
    assert "<tool_call>" in section and '- sagex_read: Read.\n  arguments: {"type":"object"}' in section
