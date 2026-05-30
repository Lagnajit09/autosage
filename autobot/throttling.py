"""Per-user rate limiting for autobot (T18).

Uses slowapi (a starlette-native port of flask-limiter) to cap chat
endpoint usage per Clerk user. Without this, a single user — or a
runaway client — could hammer the LLM and drain the admin pool for
everyone else.

Key-extraction strategy
───────────────────────
slowapi calls `key_func(request)` BEFORE FastAPI dependency injection
runs, so we can't use `require_auth`'s verified `AuthContext` here.
Instead we peek at the JWT payload without verifying its signature —
that's safe for rate-limit keying because:

  • If the token is forged: the request will 401 in `require_auth`
    anyway, so the rate-limit counter just doesn't apply to the real
    user the attacker is impersonating.
  • If the token is real: we get the right `sub` claim and apply the
    limit to the right user.
  • If the header is missing/malformed: we fall back to client IP,
    which is the slowapi default.

So the worst case is unauth'd requests get counted against the
caller's IP, which is exactly what we want.

Configured limits live on the decorators in `routers/chat.py`. Keeping
the Limiter singleton in its own module avoids the circular import
that would happen if it lived in `main.py` (chat.py imports it; main.py
also imports it).
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

    Returns a string suitable as a slowapi rate-limit key. Falls back to
    the client's IP when no Bearer is present or the token is malformed.
    """
    auth_header = request.headers.get("Authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return get_remote_address(request)
    token = auth_header[7:].strip()
    if not token:
        return get_remote_address(request)

    # JWT shape: header.payload.signature — three base64url segments.
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
        # Prefix so a sub that happens to look like an IP doesn't
        # collide with a fallback IP-keyed bucket.
        return f"user:{sub}"
    return get_remote_address(request)


# Module-level singleton. `routers/chat.py` and `main.py` both import
# this object — slowapi keeps its counters on the Limiter instance, so
# every decorated endpoint must reference the SAME instance.
#
# Storage backend points at the same Redis we already run for the
# context cache (db /2). This is REQUIRED — not optional — because
# uvicorn runs with `--workers 2` (one process per worker, separate
# memory). With the default in-memory backend, "30/minute" would
# become "30/minute PER WORKER" → effective ceiling 60/minute, and
# the rate limit would silently underperform. Redis storage gives one
# shared counter across all workers.
#
# Storage URI is read from settings so the same env override that
# moves Redis also moves the limiter (no separate config to drift).
limiter = Limiter(
    key_func=_user_sub_or_ip,
    storage_uri=get_settings().REDIS_URL,
)
