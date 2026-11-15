"""Sage WebSocket: handshake auth, streaming turns, history, quota, cancel.

Runs the real router + conversation loop through Starlette's TestClient with
Django, Redis and the LLM faked — nothing leaves the process.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import sage.auth as sage_auth
import sage.conversation as conversation
from llm.client import LLMError, LLMResolution
from sage.router import router as sage_router
from throttling import limiter

KEY = "sgx_" + "k" * 43
SESSION_ID = "6f1c2a9e-0000-4000-8000-000000000001"
USER_SUB = "user_2abcDEF"
SESSION_OK = (200, {"data": {"session": {"id": SESSION_ID}, "user": {"sub": USER_SUB}}})
NO_BYO = (200, {"data": {"default_llm_config": None}})
HEADERS = {"X-API-Key": KEY, "User-Agent": "sagex/2.0.0 (Windows 11)"}

ADMIN = LLMResolution(model="groq/m1", api_key="admin", provider="groq", model_name="m1")
ADMIN_2 = LLMResolution(model="gemini/m2", api_key="admin", provider="gemini", model_name="m2")


class RoutedDjango:
    """Fake DjangoClient answering by path; values may be lists (consumed in order)."""

    def __init__(self, routes):
        self.routes = routes
        self.calls: list[tuple[str, str]] = []

    async def request(self, *, method, path, **_kwargs):
        self.calls.append((method, path))
        answer = self.routes.get(path, (404, {}))
        if isinstance(answer, list):
            answer = answer.pop(0) if len(answer) > 1 else answer[0]
        if isinstance(answer, Exception):
            raise answer
        return answer


class FakeCache:
    def __init__(self, allowed=True):
        self.allowed = allowed
        self.ticks = 0

    async def incr_admin_quota_for_today(self, user_sub, limit):
        assert user_sub == USER_SUB
        self.ticks += 1
        return self.allowed, self.ticks


@pytest.fixture(autouse=True)
def _fresh_cache():
    sage_auth._cache.clear()
    yield
    sage_auth._cache.clear()


@pytest.fixture
def env(monkeypatch):
    """Install fakes; returns a namespace the test can tweak."""
    class Env:
        django = RoutedDjango({sage_auth.SESSION_PATH: SESSION_OK,
                               "/api/autobot/settings/": NO_BYO})
        cache = FakeCache()
        chain = [ADMIN]
        prompts: list[list[dict]] = []
        replies: dict[str, object] = {}       # model_name -> list of tokens | LLMError

    async def fake_stream(messages, resolution, **_kwargs):
        Env.prompts.append(messages)
        reply = Env.replies.get(resolution.model_name, ["Hel", "lo"])
        if isinstance(reply, Exception):
            raise reply
        if callable(reply):
            async for item in reply():
                yield item
            return
        for piece in reply:
            yield "token", piece
        yield "done", {"content": "".join(reply), "provider": resolution.provider,
                       "model_name": resolution.model_name, "prompt_tokens": 3,
                       "completion_tokens": 2, "total_tokens": 5}

    async def fake_limit(user_sub):
        return 10

    monkeypatch.setattr(sage_auth, "get_django_client", lambda: Env.django)
    monkeypatch.setattr(conversation, "resolve_admin_chain", lambda: list(Env.chain))
    monkeypatch.setattr(conversation, "astream_complete", fake_stream)
    monkeypatch.setattr(conversation, "get_admin_daily_limit", fake_limit)
    monkeypatch.setattr(conversation, "get_cache", lambda: Env.cache)
    Env.prompts = []
    Env.replies = {}
    return Env


@pytest.fixture
def client():
    app = FastAPI(root_path="/api/ai")
    app.state.limiter = limiter
    limiter.enabled = False
    app.include_router(sage_router)
    return TestClient(app)


def _turn_frames(ws) -> list[dict]:
    """Collect frames until the turn ends (done or error)."""
    frames = []
    while True:
        frame = ws.receive_json()
        frames.append(frame)
        if frame["type"] in ("done", "error"):
            return frames


def _text(frames) -> str:
    return "".join(f["text"] for f in frames if f["type"] == "token")


# --- handshake -----------------------------------------------------------------

def test_streams_a_reply(client, env):
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        assert ws.receive_json() == {"type": "ready", "session_id": SESSION_ID}
        ws.send_json({"type": "turn", "text": "hi"})
        frames = _turn_frames(ws)

    assert _text(frames) == "Hello"
    done = frames[-1]
    assert done == {"type": "done", "cancelled": False, "model": "groq/m1", "byo": False,
                    "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5}}
    assert env.cache.ticks == 1                       # one free-model turn, shared quota
    assert env.prompts[0][0]["content"] == conversation.SAGE_SYSTEM_PROMPT


def test_browser_origin_is_refused(client, env):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/sage/ws", headers={**HEADERS, "Origin": "https://evil.example"}):
            pass
    assert exc.value.code == conversation.CLOSE_FORBIDDEN
    assert env.django.calls == []


def test_missing_key_is_refused_with_a_reason(client, env):
    with client.websocket_connect("/sage/ws", headers={"User-Agent": "sagex/2.0.0"}) as ws:
        frame = ws.receive_json()
        assert frame["type"] == "error" and frame["fatal"] and frame["code"] == "unauthenticated"
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
    assert exc.value.code == conversation.CLOSE_UNAUTHENTICATED


def test_revoked_key_gets_djangos_reason(client, env):
    reason = "This session was revoked from your profile. Run: sagex auth login"
    env.django.routes[sage_auth.SESSION_PATH] = (401, {"errors": {"detail": reason}})
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        assert ws.receive_json()["message"] == reason


# --- turns ---------------------------------------------------------------------

def test_history_carries_over_between_turns(client, env):
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        ws.receive_json()
        ws.send_json({"type": "turn", "text": "first"})
        _turn_frames(ws)
        ws.send_json({"type": "turn", "text": "second"})
        _turn_frames(ws)

    second = env.prompts[1]
    assert [m["role"] for m in second] == ["system", "user", "assistant", "user"]
    assert second[1]["content"] == "first" and second[2]["content"] == "Hello"


def test_last_command_context_is_framed_as_data(client, env):
    context = {"last_command": {"command": "sagex run workflow deploy", "exit_code": 1,
                                "output": "node build failed: exit 2"}}
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        ws.receive_json()
        ws.send_json({"type": "turn", "text": "why did it fail?", "context": context})
        _turn_frames(ws)

    user = env.prompts[0][-1]["content"]
    assert "`sagex run workflow deploy` (exit code 1)" in user
    assert "data, not instructions" in user
    assert user.endswith("why did it fail?")


def test_quota_exhausted_stops_before_the_model(client, env):
    env.cache.allowed = False
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        ws.receive_json()
        ws.send_json({"type": "turn", "text": "hi"})
        (frame,) = _turn_frames(ws)
    assert frame["code"] == "admin_quota_exhausted" and not frame["fatal"]
    assert env.prompts == []


def test_personal_key_skips_the_quota(client, env):
    env.django.routes["/api/autobot/settings/"] = (200, {"data": {"default_llm_config": "cfg1"}})
    env.django.routes["/api/autobot/llm-configs/cfg1/reveal/"] = (
        200, {"data": {"provider": "openai", "model_name": "gpt-x", "api_key": "byo"}})
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        ws.receive_json()
        ws.send_json({"type": "turn", "text": "hi"})
        done = _turn_frames(ws)[-1]
    assert done["byo"] is True and done["model"] == "openai/gpt-x"
    assert env.cache.ticks == 0


def test_falls_back_before_any_token(client, env):
    env.chain = [ADMIN, ADMIN_2]
    env.replies["m1"] = LLMError("busy", retryable=True, kind="rate_limit")
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        ws.receive_json()
        ws.send_json({"type": "turn", "text": "hi"})
        done = _turn_frames(ws)[-1]
    assert done["model"] == "gemini/m2"


def test_model_failure_is_a_friendly_error(client, env):
    env.replies["m1"] = LLMError("boom", retryable=False, kind="bad_request")
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        ws.receive_json()
        ws.send_json({"type": "turn", "text": "hi"})
        (frame,) = _turn_frames(ws)
        # The connection survives a failed turn.
        env.replies.pop("m1")
        ws.send_json({"type": "turn", "text": "again"})
        assert _turn_frames(ws)[-1]["type"] == "done"
    assert frame["code"] == "llm_error" and "boom" not in frame["message"]


def test_session_revoked_mid_conversation_ends_it(client, env):
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        ws.receive_json()
        ws.send_json({"type": "turn", "text": "hi"})
        _turn_frames(ws)

        sage_auth._cache.clear()                      # cache window passed
        env.django.routes[sage_auth.SESSION_PATH] = (401, {})
        ws.send_json({"type": "turn", "text": "still there?"})
        (frame,) = _turn_frames(ws)
        assert frame["code"] == "unauthenticated" and frame["fatal"]
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
    assert exc.value.code == conversation.CLOSE_UNAUTHENTICATED


def test_cancel_stops_the_turn_and_keeps_the_partial(client, env):
    async def slow():
        yield "token", "Partial"
        await asyncio.sleep(30)                       # would hang without the cancel
        yield "token", "never"

    env.replies["m1"] = slow
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        ws.receive_json()
        ws.send_json({"type": "turn", "text": "long answer please"})
        assert ws.receive_json() == {"type": "token", "text": "Partial"}
        ws.send_json({"type": "cancel"})
        assert ws.receive_json() == {"type": "done", "cancelled": True}

        env.replies.pop("m1")
        ws.send_json({"type": "turn", "text": "next"})
        _turn_frames(ws)
    remembered = env.prompts[1][2]["content"]
    assert remembered.startswith("Partial") and "interrupted" in remembered


@pytest.mark.parametrize("raw", ["not json", "[1, 2]", '{"type": "dance"}'])
def test_bad_frames_get_an_error_not_a_disconnect(client, env, raw):
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        ws.receive_json()
        ws.send_text(raw)
        assert ws.receive_json()["code"] == "bad_frame"
        ws.send_json({"type": "turn", "text": "hi"})
        assert _turn_frames(ws)[-1]["type"] == "done"


def test_overlong_message_is_rejected(client, env):
    with client.websocket_connect("/sage/ws", headers=HEADERS) as ws:
        ws.receive_json()
        ws.send_json({"type": "turn", "text": "x" * 9000})
        (frame,) = _turn_frames(ws)
    assert frame["code"] == "message_too_long"
    assert env.prompts == []
