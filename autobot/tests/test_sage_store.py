"""Saved Sage conversations: turns saved trimmed, resume, summaries, failures.

Same harness as test_sage_socket.py (real socket loop, faked Django/LLM), with
saving switched on and the sage_api routes answered by the fake Django.
"""

from __future__ import annotations

import pytest

import sage.summary as sage_summary
from sage.compaction import TRIMMED
from settings import get_settings
from tests.test_sage_socket import (  # noqa: F401  (fixtures)
    HEADERS,
    _call,
    _fresh_cache,
    _hello,
    _text,
    _turn_frames,
    client,
    env,
)

CID = "0b6f7d1e-1111-4222-8333-444455556666"
BASE = "/api/sage/conversations/"
CONTEXT = {"env": {"os": "Windows 11", "shell": "pwsh", "workspace": "D:\\me\\infra"}}


@pytest.fixture
def stored(env, monkeypatch):
    """Saving on; a fake sage_api that numbers turns like Django does."""
    monkeypatch.setattr(get_settings(), "SAGE_STORE_ENABLED", True)
    counter = {"seq": 0}

    def save_turn(_body):
        counter["seq"] += 1
        return 201, {"data": {"seq": counter["seq"]}}

    env.django.routes[("POST", BASE)] = (201, {"data": {"id": CID}})
    env.django.routes[("POST", f"{BASE}{CID}/turns/")] = save_turn
    env.django.routes[("POST", f"{BASE}{CID}/summaries/")] = (201, {"data": {"up_to_seq": 1}})
    env.counter = counter
    return env


def _bodies(env, method, path):
    return [body for m, p, body in env.django.bodies if m == method and p == path]


def test_turns_are_saved_trimmed_and_the_id_comes_back(client, stored):
    long_output = "exit code 0\n" + "\n".join(f"line {n}" for n in range(400))
    stored.script = [{"tool_calls": [_call("read_file", path="scripts/a.sh")]}, {"text": "It prints CPU."}]
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        assert "sessions" in ws.receive_json()["features"]
        ws.send_json({"type": "hello", "index": "x" * 50, "tools": ["read_file"]})
        ws.receive_json()
        ws.send_json({"type": "turn", "text": "what does a.sh do?", "context": CONTEXT})
        call = ws.receive_json()
        ws.send_json({"type": "tool_result", "id": call["id"], "exit_code": 0, "output": long_output})
        frames = _turn_frames(ws)
    assert frames[-1]["conversation_id"] == CID
    assert _bodies(stored, "POST", BASE) == [{"title": "what does a.sh do?", "workspace": "infra"}]
    [turn] = _bodies(stored, "POST", f"{BASE}{CID}/turns/")
    assert (turn["prompt"], turn["reply"], turn["tool_calls"], turn["cancelled"]) == (
        "what does a.sh do?", "It prints CPU.", 1, False)
    assert turn["total_tokens"] == 10 and turn["model"] == "groq/m1" and turn["is_byo"] is False
    tool_msg = next(m for m in turn["messages"] if m["role"] == "tool")
    assert TRIMMED in tool_msg["content"] and len(tool_msg["content"]) < 2500     # never the full file


def test_file_contents_never_reach_the_store(client, stored):
    content = "#!/bin/bash\n" + "echo secret-ish line\n" * 50
    stored.script = [{"tool_calls": [_call("write_file", path="scripts/a.sh", content=content,
                                           summary="Create a.sh")]}, {"text": "Written."}]
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        ws.receive_json()
        ws.send_json({"type": "hello", "index": "x" * 50, "tools": ["write_file"]})
        ws.receive_json()
        ws.send_json({"type": "turn", "text": "write it"})
        call = ws.receive_json()
        ws.send_json({"type": "tool_result", "id": call["id"], "exit_code": 0, "output": "written"})
        _turn_frames(ws)
    [turn] = _bodies(stored, "POST", f"{BASE}{CID}/turns/")
    assert "secret-ish" not in str(turn["messages"])


def test_a_failed_save_stops_saving_and_says_so_once(client, stored):
    stored.django.routes[("POST", f"{BASE}{CID}/turns/")] = (500, {})
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        _hello(ws)
        notices = []
        for text in ("one", "two"):
            ws.send_json({"type": "turn", "text": text})
            notices += [f for f in _turn_frames(ws) if f["type"] == "notice"]
    assert len(notices) == 1 and "couldn't save" in notices[0]["message"]
    assert len(_bodies(stored, "POST", f"{BASE}{CID}/turns/")) == 1


def test_a_cancelled_turn_is_saved_as_cancelled(client, stored):
    async def slow():
        yield "token", "Partial"
        import asyncio
        await asyncio.sleep(5)
        yield "done", {}
    stored.replies["m1"] = slow
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        _hello(ws)
        ws.send_json({"type": "turn", "text": "long one"})
        assert ws.receive_json()["type"] == "token"
        ws.send_json({"type": "cancel"})
        frames = _turn_frames(ws)
    assert frames[-1] == {"type": "done", "cancelled": True, "conversation_id": CID}
    [turn] = _bodies(stored, "POST", f"{BASE}{CID}/turns/")
    assert turn["cancelled"] is True and turn["reply"] == "Partial"


# --- resume -------------------------------------------------------------------------

def _saved(**extra):
    return (200, {"data": {
        "id": CID, "title": "cpu script", "turn_count": 5,
        "summary": {"text": "NOTES: wrote scripts/cpu.sh, pushed v2.", "up_to_seq": 3},
        "turns": [
            {"seq": 4, "messages": [{"role": "user", "content": "run it"},
                                    {"role": "assistant", "content": "It ran fine."}]},
            {"seq": 5, "messages": [{"role": "user", "content": "thanks"},
                                    {"role": "assistant", "content": "Any time."}]},
        ],
        "transcript": [{"seq": 4, "prompt": "run it", "reply": "It ran fine.", "cancelled": False},
                       {"seq": 5, "prompt": "thanks", "reply": "Any time.", "cancelled": False}],
        **extra}})


def test_resume_loads_the_summary_and_the_turns_after_it(client, stored):
    stored.django.routes[("GET", f"{BASE}{CID}/")] = _saved()
    stored.counter["seq"] = 5
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        ws.receive_json()
        ws.send_json({"type": "hello", "index": "x" * 50, "tools": ["sagex_read"], "conversation": CID})
        hello = ws.receive_json()
        ws.send_json({"type": "turn", "text": "and now?"})
        frames = _turn_frames(ws)
    assert hello["conversation"]["id"] == CID and hello["conversation"]["title"] == "cpu script"
    assert [t["prompt"] for t in hello["conversation"]["transcript"]] == ["run it", "thanks"]
    prompt = stored.prompts[-1]
    assert "NOTES: wrote scripts/cpu.sh" in prompt[0]["content"]          # in the system prompt
    assert [m["content"] for m in prompt[1:5]] == ["run it", "It ran fine.", "thanks", "Any time."]
    assert frames[-1]["conversation_id"] == CID
    assert not _bodies(stored, "POST", BASE)                             # no new conversation
    assert len(_bodies(stored, "POST", f"{BASE}{CID}/turns/")) == 1


def test_resuming_a_missing_conversation_starts_a_new_one(client, stored):
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        ws.receive_json()
        ws.send_json({"type": "hello", "index": "x" * 50, "tools": [], "conversation": CID})
        hello = ws.receive_json()
        ws.send_json({"type": "turn", "text": "hi"})
        frames = _turn_frames(ws)
    assert "no longer saved" in hello["message"] and "conversation" not in hello
    assert frames[-1]["conversation_id"] == CID                       # the new one (fake id)
    assert len(_bodies(stored, "POST", BASE)) == 1


def test_a_saved_turn_that_cant_be_resent_is_skipped(client, stored):
    broken = {"seq": 4, "messages": [{"role": "user", "content": "x"},
                                     {"role": "tool", "tool_call_id": "nope", "content": "orphan"}]}
    ok = {"seq": 5, "messages": [{"role": "user", "content": "thanks"},
                                 {"role": "assistant", "content": "Any time."}]}
    stored.django.routes[("GET", f"{BASE}{CID}/")] = _saved(turns=[broken, ok])
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        ws.receive_json()
        ws.send_json({"type": "hello", "index": "x" * 50, "tools": [], "conversation": CID})
        ws.receive_json()
        ws.send_json({"type": "turn", "text": "next"})
        _turn_frames(ws)
    contents = [m["content"] for m in stored.prompts[-1][1:]]
    assert "orphan" not in contents and contents[:2] == ["thanks", "Any time."]


# --- usage ----------------------------------------------------------------------------

@pytest.fixture
def usage_env(env, monkeypatch):
    import sage.usage as sage_usage

    class Cache:
        async def get_admin_quota_for_today(self, user_sub):
            return 7

    async def limit(user_sub):
        return 30

    monkeypatch.setattr(sage_usage, "get_cache", lambda: Cache())
    monkeypatch.setattr(sage_usage, "get_admin_daily_limit", limit)
    return env


def test_usage_adds_the_shared_allowance_and_key_kind(client, usage_env):
    usage_env.django.routes["/api/sage/usage/"] = (200, {"data": {"today": {"requests": 3}}})
    response = client.get("/sage/usage/", headers=HEADERS)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["today"] == {"requests": 3}
    assert data["admin_quota"] == {"used": 7, "limit": 30, "remaining": 23}
    assert data["own_key"] is False
    assert ("GET", "/api/sage/usage/") in usage_env.django.calls


def test_usage_survives_a_broken_allowance_store(client, usage_env, monkeypatch):
    import sage.usage as sage_usage

    async def broken(user_sub):
        raise ValueError("Redis URL must specify one of the following schemes")

    monkeypatch.setattr(sage_usage, "get_admin_daily_limit", broken)
    monkeypatch.setattr(get_settings(), "AUTOBOT_ADMIN_DAILY_LIMIT", 30)
    usage_env.django.routes["/api/sage/usage/"] = (200, {"data": {}})
    response = client.get("/sage/usage/", headers=HEADERS)
    assert response.status_code == 200 and response.json()["data"]["admin_quota"]["limit"] == 30


def test_usage_from_an_older_server_says_so(client, usage_env):
    response = client.get("/sage/usage/", headers=HEADERS)          # fake Django: 404
    assert response.status_code == 404 and "newer Autosage server" in response.json()["message"]


def test_usage_needs_a_key(client, usage_env):
    assert client.get("/sage/usage/", headers={"User-Agent": "sagex/2.0.0"}).status_code == 401


# --- summaries ----------------------------------------------------------------------

def test_a_long_history_is_summarized_and_the_summary_saved(client, stored, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "SAGE_SUMMARY_TRIGGER_MESSAGES", 3)
    monkeypatch.setattr(settings, "SAGE_SUMMARY_KEEP_TURNS", 1)
    asked = []

    async def fake_complete(messages, resolution, **_kwargs):
        asked.append(messages[-1]["content"])
        return {"content": "<think>hm</think>- Goal: say hi", "provider": "groq", "model_name": "m1",
                "total_tokens": 7}

    monkeypatch.setattr(sage_summary, "acomplete", fake_complete)
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        _hello(ws)
        frames = []
        for text in ("first question", "second question", "third question"):
            ws.send_json({"type": "turn", "text": text})
            frames += _turn_frames(ws)
    # Before turn 3: turns 1-2 (4 messages) were over the trigger; turn 1 folded in.
    assert len(asked) == 1 and "first question" in asked[0] and "second question" not in asked[0]
    assert _bodies(stored, "POST", f"{BASE}{CID}/summaries/") == [
        {"text": "- Goal: say hi", "up_to_seq": 1, "model": "groq/m1", "is_byo": False, "total_tokens": 7}]
    third = stored.prompts[-1]
    assert "- Goal: say hi" in third[0]["content"]
    assert "first question" not in str(third[1:]) and "second question" in str(third[1:])
    assert any(f["type"] == "notice" and "summarized" in f["message"] for f in frames)


def test_a_failed_summary_keeps_the_history(client, stored, monkeypatch):
    from llm.client import LLMError
    settings = get_settings()
    monkeypatch.setattr(settings, "SAGE_SUMMARY_TRIGGER_MESSAGES", 3)
    monkeypatch.setattr(settings, "SAGE_SUMMARY_KEEP_TURNS", 1)

    async def failing(*_a, **_k):
        raise LLMError("down", retryable=True, kind="rate_limit")

    monkeypatch.setattr(sage_summary, "acomplete", failing)
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        _hello(ws)
        for text in ("first question", "second question", "third question"):
            ws.send_json({"type": "turn", "text": text})
            _turn_frames(ws)
    assert "first question" in str(stored.prompts[-1])
    assert not _bodies(stored, "POST", f"{BASE}{CID}/summaries/")
