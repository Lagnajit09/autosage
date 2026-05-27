"""Autobot auth: Clerk JWKS verification + log redaction.

Architecture
────────────
• Autobot does NOT create User rows. It verifies the Clerk JWT, extracts
  `sub`, and forwards the *original* JWT to Django when calling
  internal APIs. Django's existing ClerkAuthMiddleware re-verifies and
  is the one place that runs `User.objects.update_or_create(username=sub)`.
  This keeps user-row provisioning in exactly one service.

• JWKS is fetched once and cached in-process for 1 hour. On a `kid` miss
  (key rotation) we force a single refresh; if the kid still isn't found,
  the token is rejected. JWKS endpoint fetches use the same
  CLERK_SECRET_KEY-bearing pattern as `server/server/middleware.py`.

• `require_auth` is a FastAPI dependency. Protected routes accept it via
  `auth: AuthContext = Depends(require_auth)`. The raw JWT is also
  stashed on `request.state.auth` so tool dispatchers can forward it
  without threading it through every signature.

• `install_log_redaction()` attaches `AuthorizationRedactor` to the root
  logger and every handler — any log line containing
  `Authorization: Bearer <token>` (or common dict-repr variants) has the
  token replaced with `[REDACTED]` before format / emit. Defense-in-depth
  against accidental token leakage via httpx DEBUG logs etc.

Security choices that match Django's middleware (intentional parity)
────────────────────────────────────────────────────────────────────
• Algorithm allow-list: RS256 only. No "none", no HS256-via-spoofed-kid.
• `verify_aud=False`: Clerk's `aud` isn't reliably set; Django middleware
  skips it too.
• 60s clock-skew leeway: identical to Django's setting.
• Generic 401 on every verification failure: don't leak whether the
  token was malformed / expired / signed by an unknown key.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass
from functools import lru_cache

import httpx
import jwt
from fastapi import HTTPException, Request, status
from jwt.algorithms import RSAAlgorithm

from settings import get_settings

logger = logging.getLogger(__name__)

CLERK_JWKS_URL = "https://api.clerk.com/v1/jwks"


# ── AuthContext (request-scoped result of a successful verify) ───────────────


@dataclass(frozen=True)
class AuthContext:
    """Per-request authentication state, returned by `require_auth`.

    Frozen so accidental mutation by a handler doesn't propagate to other
    code paths in the same request.
    """

    user_sub: str       # Clerk user id — `sub` claim
    raw_jwt: str        # Original bearer token, for forwarding to Django (T11+)
    claims: dict        # Full decoded payload (for callers that need iat/exp)


# ── Exceptions ───────────────────────────────────────────────────────────────


class InvalidToken(Exception):
    """JWT failed verification for any reason (mapped to 401 by require_auth)."""


class JWKSUnavailable(Exception):
    """JWKS endpoint unreachable AND no cached keys available (→ 503)."""


# ── Verifier ─────────────────────────────────────────────────────────────────


class ClerkJWTVerifier:
    """Verifies Clerk-issued JWTs against the JWKS at api.clerk.com/v1/jwks.

    JWKS cache lives for `jwks_ttl_seconds` (default 1h, matches Django).
    A `kid` miss triggers a single forced refresh before rejecting the
    token — handles Clerk's key rotation without bouncing every user.
    """

    def __init__(self, secret_key: str, jwks_ttl_seconds: int = 3600):
        self._secret_key = secret_key
        self._jwks_ttl = jwks_ttl_seconds
        self._jwks_cache: dict | None = None
        self._jwks_fetched_at: float = 0.0
        # Serializes concurrent JWKS refreshes: the first request fetches,
        # other waiters see the fresh cache when the lock releases.
        self._refresh_lock = asyncio.Lock()
        self._client = httpx.AsyncClient(timeout=10.0)

    async def aclose(self) -> None:
        """Close the httpx client. Called from the FastAPI lifespan."""
        await self._client.aclose()

    def _is_cache_fresh(self) -> bool:
        if self._jwks_cache is None:
            return False
        return time.monotonic() - self._jwks_fetched_at < self._jwks_ttl

    async def _fetch_jwks(self) -> dict:
        """One-shot JWKS fetch. Falls back to stale cache on network error."""
        try:
            resp = await self._client.get(
                CLERK_JWKS_URL,
                headers={"Authorization": f"Bearer {self._secret_key}"},
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as e:
            if self._jwks_cache is not None:
                # Stale-while-revalidate: keep using the last known JWKS
                # rather than failing every request during a Clerk hiccup.
                logger.warning("JWKS fetch failed (%s); reusing stale cache", e)
                return self._jwks_cache
            raise JWKSUnavailable(f"Could not fetch Clerk JWKS: {e}") from e

    async def _get_jwks(self, force_refresh: bool = False) -> dict:
        if not force_refresh and self._is_cache_fresh():
            return self._jwks_cache  # type: ignore[return-value]
        async with self._refresh_lock:
            # Double-checked: another waiter may have refreshed already.
            if not force_refresh and self._is_cache_fresh():
                return self._jwks_cache  # type: ignore[return-value]
            jwks = await self._fetch_jwks()
            self._jwks_cache = jwks
            self._jwks_fetched_at = time.monotonic()
            logger.info("JWKS refreshed (%d keys)", len(jwks.get("keys", [])))
            return jwks

    @staticmethod
    def _find_key(jwks: dict, kid: str):
        """Return the public key for `kid` from the JWKS, or None."""
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                try:
                    return RSAAlgorithm.from_jwk(json.dumps(key))
                except Exception as e:
                    logger.warning("Failed to load JWK kid=%s: %s", kid, e)
                    return None
        return None

    async def verify(self, token: str) -> dict:
        """Verify `token` and return the decoded claims.

        Raises:
          InvalidToken — header malformed, kid unknown (even after refresh),
                          signature invalid, token expired, sub missing.
          JWKSUnavailable — JWKS endpoint unreachable AND no cached keys.
        """
        try:
            header = jwt.get_unverified_header(token)
        except jwt.InvalidTokenError as e:
            raise InvalidToken(f"Malformed JWT header: {e}") from e

        kid = header.get("kid")
        if not kid:
            raise InvalidToken("JWT missing 'kid' header")

        # Try the cached JWKS first; on miss, force ONE refresh (handles
        # Clerk's key rotation) before giving up.
        jwks = await self._get_jwks(force_refresh=False)
        public_key = self._find_key(jwks, kid)
        if public_key is None:
            logger.info("No key for kid=%s in cache; forcing JWKS refresh", kid)
            jwks = await self._get_jwks(force_refresh=True)
            public_key = self._find_key(jwks, kid)
        if public_key is None:
            raise InvalidToken("No matching public key for token's 'kid'")

        try:
            claims = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                # Matches server/server/middleware.py — Clerk's aud isn't
                # reliably set, iat is verified to be in the past.
                options={"verify_aud": False, "verify_iat": True},
                leeway=60,
            )
        except jwt.ExpiredSignatureError as e:
            raise InvalidToken("Token expired") from e
        except jwt.InvalidTokenError as e:
            raise InvalidToken(f"Token verification failed: {e}") from e

        sub = claims.get("sub")
        if not sub:
            raise InvalidToken("Token missing 'sub' claim")
        return claims


@lru_cache
def get_verifier() -> ClerkJWTVerifier:
    """Cached singleton verifier. JWKS cache + httpx client live with it."""
    settings = get_settings()
    return ClerkJWTVerifier(secret_key=settings.CLERK_SECRET_KEY)


# ── FastAPI dependency ───────────────────────────────────────────────────────


async def require_auth(request: Request) -> AuthContext:
    """FastAPI dependency: validates Bearer JWT, returns AuthContext.

    Usage:
        @app.get("/protected/")
        async def handler(auth: AuthContext = Depends(require_auth)):
            ...
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header[len("Bearer "):].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    verifier = get_verifier()
    try:
        claims = await verifier.verify(token)
    except InvalidToken as e:
        # Log internal reason but return generic 401 — don't tell an
        # attacker whether the token is malformed / expired / unknown-kid.
        logger.warning("JWT verification failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    except JWKSUnavailable as e:
        logger.error("JWKS unavailable: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth service temporarily unavailable.",
        ) from e

    auth = AuthContext(
        user_sub=claims["sub"],
        raw_jwt=token,
        claims=claims,
    )
    # Stash on request state so handlers / tool dispatchers can forward
    # the JWT to Django without taking it as an explicit dependency.
    request.state.auth = auth
    return auth


# ── Log redaction filter ─────────────────────────────────────────────────────


class AuthorizationRedactor(logging.Filter):
    """Scrubs `Authorization: Bearer <token>` substrings from log records.

    Catches both raw header logs and common dict-repr forms like
    `{'Authorization': 'Bearer abc'}` that httpx / requests use when
    they dump request headers at DEBUG.

    Runs at the filter stage (before format) so the formatted line that
    actually reaches stdout has the token replaced with `[REDACTED]`.
    """

    _PATTERN = re.compile(
        # Group 1: prefix — the literal `Authorization`, an optional quote,
        # the separator (`:` or `=`), optional whitespace, optional opening
        # quote. Group 2: the literal `Bearer` and the token chars up to
        # the next delimiter (space, quote, comma, semicolon, paren).
        r"(authorization['\"]?\s*[:=]\s*['\"]?)(bearer\s+[^\s'\";,)]+)",
        flags=re.IGNORECASE,
    )
    _REDACTED = "Bearer [REDACTED]"

    def _redact(self, text: str) -> str:
        return self._PATTERN.sub(
            lambda m: m.group(1) + self._REDACTED, text
        )

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            # Resolve printf-style args first, then redact, then collapse
            # back into record.msg with empty args so downstream
            # formatters don't reintroduce the token.
            msg = record.getMessage()
            redacted = self._redact(msg)
            if redacted != msg:
                record.msg = redacted
                record.args = ()
        except Exception:
            # Never break logging because of redaction.
            pass
        return True


def install_log_redaction() -> None:
    """Install AuthorizationRedactor on the root logger + every handler.

    Idempotent — safe to call from both module-import time AND the
    FastAPI lifespan startup hook.

    Belt-and-suspenders: the filter is attached to the root logger
    (catches records emitted directly to root) AND to each handler
    (catches records that propagated up from child loggers — Python's
    Logger filters do NOT re-run on propagation, but Handler filters do).
    """
    redactor = AuthorizationRedactor()
    root = logging.getLogger()

    if not any(isinstance(f, AuthorizationRedactor) for f in root.filters):
        root.addFilter(redactor)

    for handler in root.handlers:
        if not any(
            isinstance(f, AuthorizationRedactor) for f in handler.filters
        ):
            handler.addFilter(redactor)
