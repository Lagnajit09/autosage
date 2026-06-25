"""Focused tests for the public docs-chat tool loop (Pillar A / plan item 7).

These exercise `routers/docs_chat.py` end-to-end through a FastAPI TestClient,
WITHOUT touching Redis, Django, or a real LLM. Everything the router imports —
the admin chain, the LLM stream, the tool dispatcher, and the conversation
cache — is patched at the router module's namespace, so we assert the router's
own orchestration (frame sequence, tool floor, quota gate, validation) in
isolation.

Run from the autobot/ dir:  python -m pytest tests/test_docs_chat.py -q
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import routers.docs_chat as docs_chat
from llm.client import LLMError, LLMResolution
from throttling import limiter


# ── Test doubles ─────────────────────────────────────────────────────────────

_ADMIN = LLMResolution(
    model="gemini/gemini-1.5-flash",
    api_key="test-key",
    provider="gemini",
    model_name="gemini-1.5-flash",
)


class FakeCache:
    """In-memory stand-in for ConversationCache's docs methods (no Redis)."""

    def __init__(self, *, quota_allowed: bool = True):
        self.quota_allowed = quota_allowed
        self.sessions: dict[str, list[dict[str, Any]]] = {}
        self.saved: list[tuple[str, list[dict[str, Any]]]] = []

    async def incr_docs_quota_for_today(self, ip: str, limit: int):
        return (self.quota_allowed, 1 if self.quota_allowed else limit + 1)

    async def get_docs_session(self, session_id: str) -> list[dict[str, Any]]:
        return list(self.sessions.get(session_id, []))

    async def set_docs_session(self, session_id, history, ttl):  # noqa: ANN001
        self.sessions[session_id] = list(history)
        self.saved.append((session_id, list(history)))


def _make_astream(script: list[list[tuple[str, Any]]]):
    """Build a fake `astream_complete` that yields successive scripted rounds.

    Each element of `script` is the (kind, payload) sequence for one call. Calls
    are consumed in order, matching the router's round loop.
    """
    calls = {"n": 0}

    async def _fake_astream(messages, resolution, *, tools=None, **kw):  # noqa: ANN001
        idx = min(calls["n"], len(script) - 1)
        calls["n"] += 1
        for kind, payload in script[idx]:
            yield kind, payload

    _fake_astream.calls = calls
    return _fake_astream


def _parse_sse(text: str) -> list[tuple[str, dict]]:
    """Parse a full SSE response body into [(event, data_dict), ...]."""
    out: list[tuple[str, dict]] = []
    for frame in text.replace("\r\n", "\n").split("\n\n"):
        event = None
        data = ""
        for line in frame.split("\n"):
            if line.startswith("event:"):
                event = line[len("event:"):].strip()
            elif line.startswith("data:"):
                data += line[len("data:"):].strip()
        if event and data:
            out.append((event, json.loads(data)))
    return out


@pytest.fixture
def client():
    """A TestClient mounting ONLY the docs_chat router (no main.py lifespan)."""
    app = FastAPI(root_path="/api/ai")
    # slowapi reads app.state.limiter on decoration; the router is already
    # decorated, so just attach + disable (the limiter would hit real Redis).
    app.state.limiter = limiter
    limiter.enabled = False
    app.include_router(docs_chat.router)
    return TestClient(app)


@pytest.fixture
def patch_admin(monkeypatch):
    monkeypatch.setattr(docs_chat, "resolve_admin_chain", lambda: [_ADMIN])


# ── Tests ────────────────────────────────────────────────────────────────────

def test_happy_path_tool_then_answer(client, patch_admin, monkeypatch):
    """Round 1 calls search_docs; round 2 answers. Assert frame order + done."""
    fake_cache = FakeCache()
    monkeypatch.setattr(docs_chat, "get_cache", lambda: fake_cache)

    tool_call = {
        "id": "call_1",
        "type": "function",
        "function": {"name": "search_docs", "arguments": '{"query": "run a script"}'},
    }
    astream = _make_astream([
        # Round 1: model asks for the tool (no text).
        [("done", {"content": "", "tool_calls": [tool_call]})],
        # Round 2: model writes the final answer.
        [("token", "You can "), ("token", "run a script "), ("token", "from the editor."),
         ("done", {"content": "You can run a script from the editor.", "tool_calls": []})],
    ])
    monkeypatch.setattr(docs_chat, "astream_complete", astream)

    async def fake_dispatch(name, args, *, jwt, allowed_names, context):  # noqa: ANN001
        assert name == "search_docs"
        assert jwt == ""  # public path — NO user JWT
        assert "search_docs" in allowed_names
        return {"results": [
            {"title": "Scripts", "url": "/docs/scripts", "heading_path": "Scripts",
             "snippet": "Use the Run button."},
        ]}

    monkeypatch.setattr(docs_chat, "dispatch_tool", fake_dispatch)

    resp = client.post(
        "/docs/chat/stream/",
        json={"session_id": "abcdefgh", "message": "How do I run a script?"},
    )
    assert resp.status_code == 200
    frames = _parse_sse(resp.text)
    events = [e for e, _ in frames]

    # The tool round is surfaced, then tokens, then exactly one done.
    assert "tool_call_start" in events
    assert "tool_result" in events
    assert events.index("tool_call_start") < events.index("tool_result")
    assert events[-1] == "done"
    assert events.count("done") == 1

    # tool_result carries the search_docs payload with the source url.
    tr = next(d for e, d in frames if e == "tool_result")
    assert tr["name"] == "search_docs"
    assert tr["result"]["results"][0]["url"] == "/docs/scripts"

    # done payload is {"content": ...} (no Django Message on this path).
    done = frames[-1][1]
    assert done == {"content": "You can run a script from the editor."}

    # The turn was persisted to the anon session (user + assistant).
    assert fake_cache.saved
    _, hist = fake_cache.saved[-1]
    assert hist[-2] == {"role": "user", "content": "How do I run a script?"}
    assert hist[-1]["role"] == "assistant"


def test_answer_without_tool(client, patch_admin, monkeypatch):
    """Model answers directly (no tool call) → tokens + done, no tool frames."""
    monkeypatch.setattr(docs_chat, "get_cache", lambda: FakeCache())
    astream = _make_astream([
        [("token", "Autosage automates workflows."),
         ("done", {"content": "Autosage automates workflows.", "tool_calls": []})],
    ])
    monkeypatch.setattr(docs_chat, "astream_complete", astream)

    resp = client.post(
        "/docs/chat/stream/",
        json={"session_id": "session-1234", "message": "What is Autosage?"},
    )
    frames = _parse_sse(resp.text)
    events = [e for e, _ in frames]
    assert "tool_call_start" not in events
    assert events[-1] == "done"
    assert frames[-1][1]["content"] == "Autosage automates workflows."


def test_quota_exhausted_short_circuits(client, patch_admin, monkeypatch):
    """When the per-IP daily cap is hit, emit one error frame and stop."""
    monkeypatch.setattr(
        docs_chat, "get_cache", lambda: FakeCache(quota_allowed=False),
    )
    # astream must NOT be called once quota is exhausted.
    called = {"hit": False}

    async def _should_not_run(*a, **k):
        called["hit"] = True
        yield ("done", {"content": "", "tool_calls": []})

    monkeypatch.setattr(docs_chat, "astream_complete", _should_not_run)

    resp = client.post(
        "/docs/chat/stream/",
        json={"session_id": "abcdefgh", "message": "hi"},
    )
    frames = _parse_sse(resp.text)
    assert len(frames) == 1
    event, data = frames[0]
    assert event == "error"
    assert data["code"] == "docs_quota_exhausted"
    assert called["hit"] is False


def test_no_admin_chain_returns_503(client, monkeypatch):
    """Unconfigured admin LLM → HTTP 503 before the stream opens."""
    monkeypatch.setattr(docs_chat, "resolve_admin_chain", lambda: [])
    resp = client.post(
        "/docs/chat/stream/",
        json={"session_id": "abcdefgh", "message": "hi"},
    )
    assert resp.status_code == 503


@pytest.mark.parametrize("body", [
    {"message": "hi"},                              # missing session_id
    {"session_id": "short", "message": "hi"},       # session_id too short (<8)
    {"session_id": "bad id!!", "message": "hi"},    # illegal charset
    {"session_id": "abcdefgh"},                     # missing message
    {"session_id": "abcdefgh", "message": "   "},   # blank message
])
def test_validation_rejects_bad_body(client, patch_admin, monkeypatch, body):
    monkeypatch.setattr(docs_chat, "get_cache", lambda: FakeCache())
    resp = client.post("/docs/chat/stream/", json=body)
    assert resp.status_code == 400


def test_llm_error_surfaces_error_frame(client, patch_admin, monkeypatch):
    """A non-retryable LLM failure on round 1 yields an error frame, not a crash."""
    monkeypatch.setattr(docs_chat, "get_cache", lambda: FakeCache())

    async def _boom(messages, resolution, *, tools=None, **kw):  # noqa: ANN001
        raise LLMError("provider exploded", kind="server_error", retryable=False)
        yield  # make it an async generator

    monkeypatch.setattr(docs_chat, "astream_complete", _boom)

    resp = client.post(
        "/docs/chat/stream/",
        json={"session_id": "abcdefgh", "message": "hi"},
    )
    frames = _parse_sse(resp.text)
    assert frames[-1][0] == "error"
    assert frames[-1][1]["code"].startswith("llm_")
