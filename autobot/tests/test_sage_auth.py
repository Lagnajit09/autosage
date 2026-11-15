"""Sage auth bridge: SageCode API keys validated by Django, then forwarded.

No Redis, Django or LLM: Django is faked at `get_django_client`, and the
DjangoClient tests use an httpx MockTransport.
"""

from __future__ import annotations

import asyncio
import logging

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import sage.auth as sage_auth
from auth import AuthorizationRedactor
from conversation.persistence import DjangoClient, DjangoUnavailable
from sage.router import router as sage_router
from throttling import _user_sub_or_ip, limiter

KEY = "sgx_" + "A1b2_C3d4-" * 4 + "xyz"
OTHER_KEY = "sgx_" + "Z" * 43
SESSION_ID = "6f1c2a9e-0000-4000-8000-000000000001"
CLI_HEADERS = {
    "User-Agent": "sagex/2.0.0 (Windows 11)",
    "X-Sagex-Invocation": "0" * 32,
    "X-Sagex-Command": "chat",
}
_OK = (200, {"success": True, "data": {"session": {"id": SESSION_ID}, "user": {}}})


class FakeDjango:
    """Stands in for DjangoClient: records calls, replays queued responses."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls: list[dict] = []

    async def request(self, **kwargs):
        self.calls.append(kwargs)
        result = self.responses.pop(0) if self.responses else _OK
        if isinstance(result, Exception):
            raise result
        return result


@pytest.fixture(autouse=True)
def _fresh_cache():
    sage_auth._cache.clear()
    yield
    sage_auth._cache.clear()


@pytest.fixture
def django(monkeypatch):
    def install(*responses):
        fake = FakeDjango(*responses)
        monkeypatch.setattr(sage_auth, "get_django_client", lambda: fake)
        return fake
    return install


@pytest.fixture
def client():
    app = FastAPI(root_path="/api/ai")
    app.state.limiter = limiter
    limiter.enabled = False         # the real limiter would hit Redis
    app.include_router(sage_router)
    return TestClient(app)


def _get(client, key=KEY, **extra):
    headers = {**CLI_HEADERS, **extra}
    if key is not None:
        headers["X-API-Key"] = key
    return client.get("/sage/whoami/", headers=headers)


# --- the HTTP dependency -----------------------------------------------------

def test_valid_key_reaches_sage_and_is_checked_by_django(client, django):
    fake = django(_OK)
    resp = _get(client)
    assert resp.status_code == 200
    assert resp.json() == {"service": "sage", "session_id": SESSION_ID}

    (call,) = fake.calls
    assert call["path"] == sage_auth.SESSION_PATH
    assert call["api_key"] == KEY
    assert "jwt" not in call and "internal_secret" not in call
    # The CLI's activity headers travel on, so the session shows the real client.
    assert call["headers"]["user-agent"] == CLI_HEADERS["User-Agent"]
    assert call["headers"]["x-sagex-command"] == "chat"


def test_confirmed_key_is_cached(client, django):
    fake = django(_OK)
    assert _get(client).status_code == 200
    assert _get(client).status_code == 200
    assert len(fake.calls) == 1


def test_zero_ttl_rechecks_every_time(client, django, monkeypatch):
    fake = django(_OK, _OK)
    monkeypatch.setattr(sage_auth.get_settings(), "SAGE_SESSION_CACHE_SECONDS", 0)
    _get(client)
    _get(client)
    assert len(fake.calls) == 2


def test_clerk_bearer_alone_is_refused(client, django):
    fake = django()
    resp = _get(client, key=None, Authorization="Bearer a.b.c")
    assert resp.status_code == 401
    assert resp.json()["detail"] == sage_auth.SAGECODE_ONLY
    assert fake.calls == []


@pytest.mark.parametrize("bad", ["not-a-key", "sgx_short", "sgx_" + "a" * 20 + "!"])
def test_malformed_key_never_reaches_django(client, django, bad):
    fake = django()
    assert _get(client, key=bad).status_code == 401
    assert fake.calls == []


def test_revoked_session_reason_is_passed_on(client, django):
    reason = "This session was revoked from your profile. Run: sagex auth login"
    django((401, {"success": False, "errors": {"detail": reason}}))
    resp = _get(client)
    assert resp.status_code == 401
    assert resp.json()["detail"] == reason


def test_unknown_key_gets_generic_message(client, django):
    django((401, {"success": False, "errors": {"detail": "Invalid API key."}}))
    resp = _get(client)
    assert resp.status_code == 401
    assert resp.json()["detail"] == sage_auth.NOT_AUTHENTICATED


def test_rejections_are_not_cached(client, django):
    fake = django((401, {}), _OK)
    assert _get(client).status_code == 401
    assert _get(client).status_code == 200
    assert len(fake.calls) == 2


@pytest.mark.parametrize("upstream", [DjangoUnavailable("down"), (500, {}), (200, {"data": {}})])
def test_django_trouble_is_503(client, django, upstream):
    django(upstream)
    resp = _get(client)
    assert resp.status_code == 503
    assert resp.json()["detail"] == sage_auth.UNAVAILABLE


def test_django_throttle_is_429(client, django):
    django((429, {}))
    assert _get(client).status_code == 429


def test_untrusted_activity_headers_are_dropped():
    out = sage_auth.activity_headers({
        "User-Agent": "x" * 300,                 # too long
        "X-Sagex-Command": "run\nworkflow",      # not printable
        "X-Real-IP": "203.0.113.7",
        "Authorization": "Bearer a.b.c",         # never forwarded
    })
    assert out == {"x-real-ip": "203.0.113.7"}


def test_call_django_always_carries_the_key(django):
    fake = django((200, {}))
    auth = sage_auth.SageAuth(api_key=KEY, session_id=SESSION_ID,
                              forward_headers={"user-agent": "sagex/2.0.0"})
    asyncio.run(auth.call_django("GET", "/api/workflows/", headers={"Idempotency-Key": "k1"}))
    (call,) = fake.calls
    assert call["api_key"] == KEY
    assert call["headers"] == {"user-agent": "sagex/2.0.0", "Idempotency-Key": "k1"}
    assert KEY not in repr(auth)


# --- DjangoClient: the third, exclusive credential mode ----------------------

def _client_with(handler) -> DjangoClient:
    client = DjangoClient(base_url="http://django:8000")
    client._client = httpx.AsyncClient(
        base_url="http://django:8000", transport=httpx.MockTransport(handler),
    )
    return client


def test_api_key_mode_sends_only_the_key():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(request.headers)
        return httpx.Response(200, json={"ok": True})

    client = _client_with(handler)
    status, _ = asyncio.run(client.request(
        method="GET", path="/x/", api_key=KEY,
        # Extra headers can't add or swap a credential.
        headers={"Authorization": "Bearer a.b.c", "X-API-Key": OTHER_KEY,
                 "X-Internal-Secret": "s", "X-Sagex-Command": "chat"},
    ))
    assert status == 200
    assert seen["x-api-key"] == KEY
    assert "authorization" not in seen and "x-internal-secret" not in seen
    assert seen["x-sagex-command"] == "chat"


def test_jwt_mode_cannot_smuggle_an_api_key():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(request.headers)
        return httpx.Response(200, json={})

    asyncio.run(_client_with(handler).request(
        method="GET", path="/x/", jwt="a.b.c", headers={"X-API-Key": KEY},
    ))
    assert "x-api-key" not in seen
    assert seen["authorization"] == "Bearer a.b.c"


@pytest.mark.parametrize("extra", [{"jwt": "a.b.c"}, {"internal_secret": "s"}])
def test_api_key_cannot_be_combined(extra):
    client = _client_with(lambda r: httpx.Response(200, json={}))
    with pytest.raises(ValueError):
        asyncio.run(client.request(method="GET", path="/x/", api_key=KEY, **extra))


# --- keys never leak into logs or rate-limit keys ----------------------------

@pytest.mark.parametrize("message", [
    f"headers={{'X-API-Key': '{KEY}'}}",
    f"x-api-key: {KEY}",
    f"request failed for key {KEY} at /x/",
])
def test_keys_are_redacted_from_logs(message):
    record = logging.LogRecord("t", logging.INFO, __file__, 1, message, (), None)
    AuthorizationRedactor().filter(record)
    assert KEY not in record.getMessage()


def test_throttle_key_is_a_hash_not_the_key():
    from starlette.requests import Request

    scope = {"type": "http", "headers": [(b"x-api-key", KEY.encode())],
             "client": ("203.0.113.7", 1234)}
    bucket = _user_sub_or_ip(Request(scope))
    assert bucket.startswith("key:") and KEY not in bucket
