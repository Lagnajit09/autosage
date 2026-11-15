"""Sage auth: SageCode API keys (`sgx_…`), validated by Django.

Sage is terminal-only, so its one credential is the user's SageCode session
key — never a Clerk JWT. Autobot doesn't own sessions; Django does (expiry,
revocation, activity — `users.ApiKey`). So rather than re-implement those rules
here, a presented key is checked against Django's own
`GET /api/users/cli/sessions/current/`, and then forwarded on every Django call
Sage makes (`SageAuth.call_django`), exactly like the web chat forwards the JWT.
Autobot never elevates: Django decides access and scopes data on each request.

A confirmed key is remembered in-process for `SAGE_SESSION_CACHE_SECONDS`,
keyed by its SHA-256 (the plaintext is never stored). That only bounds how
long a just-revoked key can still *open* a Sage request — every forwarded call
is re-checked by Django, so a revoked session can't read or change anything.

The CLI's activity headers (User-Agent, X-Sagex-*) and the nginx-set
X-Real-IP are forwarded too, so the session's activity on the Profile page
shows the user's machine and command, not autobot's container.
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
from collections import OrderedDict
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException, Request, status

from conversation.persistence import DjangoUnavailable, get_django_client
from settings import get_settings

logger = logging.getLogger(__name__)

API_KEY_HEADER = "X-API-Key"
SESSION_PATH = "/api/users/cli/sessions/current/"

# Shape check before any network call: `sgx_` + token_urlsafe(32) today; the
# bounds leave room for a future longer key without accepting junk.
_KEY_RE = re.compile(r"^sgx_[A-Za-z0-9_-]{20,128}$")

# Display-only headers Django folds into the session's activity summary.
# X-Real-IP is safe to pass on: nginx overwrites it on /api/ai/ with the real
# connecting address before the request reaches autobot.
_FORWARDED_HEADERS = ("user-agent", "x-sagex-invocation", "x-sagex-command", "x-real-ip")
_MAX_FORWARDED_LEN = 256

NOT_AUTHENTICATED = (
    "Not authenticated — this session is invalid or was revoked. Run: sagex auth login"
)
SAGECODE_ONLY = "Sage is available from SageCode only. Sign in with: sagex auth login"
UNAVAILABLE = "Autosage is temporarily unavailable. Please try again shortly."


class SageAuthError(Exception):
    """A key that can't be used, with the status + message to send back."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True, eq=False)
class SageAuth:
    """An authenticated SageCode session for one Sage request/connection."""

    api_key: str = field(repr=False)          # forwarded to Django; never logged
    session_id: str
    # The user's Clerk id — keys the per-user admin-LLM quota shared with the
    # web chat. Identification only; Django authorizes every call by the key.
    user_sub: str
    forward_headers: dict[str, str] = field(default_factory=dict)

    async def call_django(
        self,
        method: str,
        path: str,
        *,
        json_body: Any | None = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, Any]:
        """Call Django as this user's session. The one way Sage reaches Django,
        so the key and the activity headers can't be forgotten on a call."""
        return await get_django_client().request(
            method=method,
            path=path,
            api_key=self.api_key,
            json_body=json_body,
            params=params,
            headers={**self.forward_headers, **(headers or {})},
        )


class _SessionCache:
    """Small in-process TTL cache: sha256(key) -> (session id, user sub). Per worker."""

    def __init__(self, max_entries: int = 2048) -> None:
        self._entries: OrderedDict[str, tuple[tuple[str, str], float]] = OrderedDict()
        self._max = max_entries

    def get(self, digest: str) -> tuple[str, str] | None:
        hit = self._entries.get(digest)
        if hit is None:
            return None
        identity, expires_at = hit
        if time.monotonic() >= expires_at:
            self._entries.pop(digest, None)
            return None
        return identity

    def put(self, digest: str, identity: tuple[str, str], ttl: float) -> None:
        if ttl <= 0:
            return
        self._entries[digest] = (identity, time.monotonic() + ttl)
        self._entries.move_to_end(digest)
        while len(self._entries) > self._max:
            self._entries.popitem(last=False)

    def clear(self) -> None:
        self._entries.clear()


_cache = _SessionCache()


def activity_headers(headers: Mapping[str, str]) -> dict[str, str]:
    """The CLI's display-only headers worth passing to Django, length-capped."""
    lowered = {k.lower(): v for k, v in headers.items()}
    out: dict[str, str] = {}
    for name in _FORWARDED_HEADERS:
        value = (lowered.get(name) or "").strip()
        if value and len(value) <= _MAX_FORWARDED_LEN and value.isprintable():
            out[name] = value
    return out


def _digest(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def _identity(body: Any) -> tuple[str, str] | None:
    """(session id, user sub) from Django's sessions/current payload, or None."""
    data = body.get("data") if isinstance(body, dict) else None
    session = data.get("session") if isinstance(data, dict) else None
    user = data.get("user") if isinstance(data, dict) else None
    session_id = session.get("id") if isinstance(session, dict) else None
    user_sub = user.get("sub") if isinstance(user, dict) else None
    if isinstance(session_id, str) and session_id and isinstance(user_sub, str) and user_sub:
        return session_id, user_sub
    return None


def _unauthenticated_detail(body: Any) -> str:
    """Django says why a known session stopped working (expired, signed out,
    revoked) and those messages already end with what to run — pass them on."""
    errors = body.get("errors") if isinstance(body, dict) else None
    detail = errors.get("detail") if isinstance(errors, dict) else None
    if isinstance(detail, str) and "sagex auth login" in detail:
        return detail
    return NOT_AUTHENTICATED


async def authenticate_api_key(api_key: str | None, headers: Mapping[str, str]) -> SageAuth:
    """Resolve a SageCode key to a session, or raise SageAuthError.

    Transport-agnostic (takes plain headers) so the HTTP dependency below and
    the WebSocket handshake share one implementation.
    """
    api_key = (api_key or "").strip()
    if not _KEY_RE.match(api_key):
        raise SageAuthError(status.HTTP_401_UNAUTHORIZED, NOT_AUTHENTICATED)

    forward = activity_headers(headers)
    digest = _digest(api_key)
    identity = _cache.get(digest)
    if identity is None:
        try:
            status_code, body = await get_django_client().request(
                method="GET", path=SESSION_PATH, api_key=api_key, headers=forward,
            )
        except DjangoUnavailable as exc:
            logger.error("Sage session check failed: %s", exc)
            raise SageAuthError(status.HTTP_503_SERVICE_UNAVAILABLE, UNAVAILABLE) from exc

        if status_code in (401, 403):
            raise SageAuthError(status.HTTP_401_UNAUTHORIZED, _unauthenticated_detail(body))
        if status_code == 429:
            raise SageAuthError(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many requests — wait a moment and try again.",
            )
        identity = _identity(body) if status_code == 200 else None
        if identity is None:
            # Includes a Django that predates `user.sub` — deploy Django first.
            logger.error("Sage session check: unexpected upstream status=%s", status_code)
            raise SageAuthError(status.HTTP_503_SERVICE_UNAVAILABLE, UNAVAILABLE)
        _cache.put(digest, identity, get_settings().SAGE_SESSION_CACHE_SECONDS)

    session_id, user_sub = identity
    return SageAuth(api_key=api_key, session_id=session_id, user_sub=user_sub,
                    forward_headers=forward)


async def recheck(auth: SageAuth) -> SageAuth:
    """Re-validate a long-lived connection's key (cheap within the cache TTL),
    so a session revoked or expired mid-conversation stops getting answers."""
    return await authenticate_api_key(auth.api_key, auth.forward_headers)


async def require_sage_auth(request: Request) -> SageAuth:
    """FastAPI dependency for every Sage HTTP route: SageCode key required.

    A Clerk Bearer alone is refused — Sage is terminal-only for now.
    """
    api_key = request.headers.get(API_KEY_HEADER)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=SAGECODE_ONLY,
            headers={"WWW-Authenticate": API_KEY_HEADER},
        )
    try:
        auth = await authenticate_api_key(api_key, request.headers)
    except SageAuthError as exc:
        extra = {"WWW-Authenticate": API_KEY_HEADER} if exc.status_code == 401 else None
        raise HTTPException(status_code=exc.status_code, detail=exc.detail, headers=extra) from exc
    request.state.sage_auth = auth
    return auth
