"""Per-user rate limiting for autobot.

slowapi calls `key_func(request)` BEFORE FastAPI dependency injection runs,
so we can't use the verified `AuthContext` here. Instead we peek at the JWT
payload without verifying its signature — safe for keying because forged
tokens get rejected later in `require_auth`, and the worst case is unauth'd
requests get counted against the caller's IP.
"""

from __future__ import annotations

import base64
import json
import logging

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from settings import get_settings

logger = logging.getLogger(__name__)


def _user_sub_or_ip(request: Request) -> str:
    """Extract `sub` from the Bearer JWT without verifying its signature.

    Falls back to the client's IP when no Bearer is present or the token
    is malformed.
    """
    auth_header = request.headers.get("Authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return get_remote_address(request)
    token = auth_header[7:].strip()
    if not token:
        return get_remote_address(request)

    parts = token.split(".")
    if len(parts) != 3:
        return get_remote_address(request)
    try:
        # Pad to a multiple of 4 chars; urlsafe_b64decode requires it.
        b = parts[1]
        b += "=" * (-len(b) % 4)
        payload = json.loads(base64.urlsafe_b64decode(b).decode("utf-8"))
    except Exception:
        return get_remote_address(request)

    sub = payload.get("sub")
    if isinstance(sub, str) and sub:
        # Prefix so a sub that looks like an IP doesn't collide with a fallback bucket.
        return f"user:{sub}"
    return get_remote_address(request)


# Redis storage is REQUIRED (not optional): uvicorn runs with `--workers 2`,
# and the default in-memory backend would give one counter per worker —
# "30/minute" would silently become 60/minute total.
limiter = Limiter(
    key_func=_user_sub_or_ip,
    storage_uri=get_settings().REDIS_URL,
)
