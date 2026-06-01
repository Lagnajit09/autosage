"""Autobot auth: Clerk JWKS verification + log redaction.

Autobot verifies the Clerk JWT for its own routes but never creates User
rows — it forwards the original JWT to Django, which is the sole source
of user-row provisioning. JWKS is cached in-process for 1h; a `kid` miss
triggers one forced refresh before rejecting. RS256 only, 60s leeway,
generic 401 on every verification failure (no oracle).
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


@dataclass(frozen=True)
class AuthContext:
    user_sub: str
    raw_jwt: str
    claims: dict


class InvalidToken(Exception):
    """JWT failed verification (mapped to 401 by require_auth)."""


class JWKSUnavailable(Exception):
    """JWKS endpoint unreachable AND no cached keys available (→ 503)."""


class ClerkJWTVerifier:
    def __init__(self, secret_key: str, jwks_ttl_seconds: int = 3600):
        self._secret_key = secret_key
        self._jwks_ttl = jwks_ttl_seconds
        self._jwks_cache: dict | None = None
        self._jwks_fetched_at: float = 0.0
        self._refresh_lock = asyncio.Lock()
        self._client = httpx.AsyncClient(timeout=10.0)

    async def aclose(self) -> None:
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
            if not force_refresh and self._is_cache_fresh():
                return self._jwks_cache  # type: ignore[return-value]
            jwks = await self._fetch_jwks()
            self._jwks_cache = jwks
            self._jwks_fetched_at = time.monotonic()
            logger.info("JWKS refreshed (%d keys)", len(jwks.get("keys", [])))
            return jwks

    @staticmethod
    def _find_key(jwks: dict, kid: str):
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                try:
                    return RSAAlgorithm.from_jwk(json.dumps(key))
                except Exception as e:
                    logger.warning("Failed to load JWK kid=%s: %s", kid, e)
                    return None
        return None

    async def verify(self, token: str) -> dict:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.InvalidTokenError as e:
            raise InvalidToken(f"Malformed JWT header: {e}") from e

        kid = header.get("kid")
        if not kid:
            raise InvalidToken("JWT missing 'kid' header")

        # On a kid miss, force one refresh to handle Clerk's key rotation.
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
    settings = get_settings()
    return ClerkJWTVerifier(secret_key=settings.CLERK_SECRET_KEY)


async def require_auth(request: Request) -> AuthContext:
    """FastAPI dependency: validates Bearer JWT, returns AuthContext."""
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
        # Generic 401 — don't leak whether the token was malformed/expired/unknown-kid.
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
    # Stash on request state so tool dispatchers can forward the JWT
    # without taking it as an explicit dependency.
    request.state.auth = auth
    return auth


class AuthorizationRedactor(logging.Filter):
    """Scrubs `Authorization: Bearer <token>` substrings from log records.

    Catches raw header logs and dict-repr forms like
    `{'Authorization': 'Bearer abc'}` that httpx dumps at DEBUG.
    """

    _PATTERN = re.compile(
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
            # Resolve printf-style args, redact, then collapse back so
            # downstream formatters don't reintroduce the token.
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
    """Install AuthorizationRedactor on the root logger and every handler.

    Idempotent. Attaches to BOTH the root logger and each handler because
    Python's Logger filters do not re-run on propagation, but Handler
    filters do.
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
