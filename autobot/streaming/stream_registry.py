"""In-flight stream registry for mid-stream token refresh (T18).

The problem
───────────
Clerk JWTs expire (default ~60s). A user's chat turn can run for
30–120s when the LLM is doing multi-round tool calls. If the original
JWT expires partway through:

  1. The next Django call (`_proxy(GET /threads/...)`, persisting a
     tool message, etc.) 401s.
  2. Our chat loop surfaces that as an `event: error` and bails out.
  3. The user sees the stream die mid-reply.

The protocol
────────────
  1. When a stream starts, we mint a `stream_id` (UUID4), wrap the
     caller's `AuthContext` in a mutable `AuthHandle`, and register it.
     The first SSE event is `event: stream_start` carrying that
     `stream_id`.
  2. The client watches its Clerk session. Just before its current
     token expires, it POSTs `/threads/<id>/token-refresh/` with
     `{"stream_id": "...", "run_token": "<new JWT>"}`.
  3. The endpoint verifies the new JWT (same `require_auth` path as
     everything else), confirms the `sub` matches the original stream
     owner, and swaps the handle's inner `AuthContext`.
  4. The chat loop reads `auth_handle.raw_jwt` on every Django /
     tool-dispatch call. Subsequent calls use the fresh token —
     transparently.

Security
────────
  • A refresh from a DIFFERENT user (different `sub`) is rejected with
    a `PermissionError` → 403. We never let attacker-B swap into
    user-A's stream.
  • A refresh for an unknown `stream_id` 404s. No leak of whether a
    stream existed.
  • The handle is process-local — refresh works only within the same
    autobot container that owns the stream. Behind a load-balancer
    this would need session affinity or a Redis-backed registry. For
    a single-replica deployment, in-memory is correct.
  • Handles are unregistered in a `finally` block when the stream
    ends, so memory stays bounded by active streams.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

from auth import AuthContext

logger = logging.getLogger(__name__)


class AuthHandle:
    """Mutable wrapper around an AuthContext.

    The chat loop calls `auth_handle.raw_jwt` on every Django request
    and tool dispatch. `refresh()` atomically swaps in a new
    `AuthContext` so subsequent reads see the new token.

    Implements the same accessors as `AuthContext` (`raw_jwt`,
    `user_sub`, `claims`) so call sites that previously dotted into
    `auth.raw_jwt` keep working.
    """

    def __init__(self, initial: AuthContext):
        self._auth = initial

    @property
    def raw_jwt(self) -> str:
        return self._auth.raw_jwt

    @property
    def user_sub(self) -> str:
        return self._auth.user_sub

    @property
    def claims(self) -> dict[str, Any]:
        return self._auth.claims

    def refresh(self, new_auth: AuthContext) -> None:
        """Swap in a freshly-verified AuthContext.

        Caller MUST have run the new token through `require_auth`
        first — this method only sanity-checks the `sub` matches.

        Raises:
          PermissionError — when the new token's `sub` differs from
          the original. Protects against an attacker who somehow
          guessed a stream_id from trying to hijack the stream with
          their own valid JWT.
        """
        if new_auth.user_sub != self._auth.user_sub:
            raise PermissionError(
                "Refresh token user mismatch — cannot swap streams "
                "between users.",
            )
        # Token rotation in-place. Logged at INFO without the JWT itself.
        logger.info(
            "Stream auth refreshed for user_sub=%s", self._auth.user_sub,
        )
        self._auth = new_auth


class StreamRegistry:
    """`stream_id → AuthHandle` for active streams.

    Backed by a plain dict under an `asyncio.Lock`. Reads (`get`) take
    the lock too because the dict can be mutated by concurrent
    register/unregister calls from other request handlers.
    """

    def __init__(self) -> None:
        self._handles: dict[str, AuthHandle] = {}
        self._lock = asyncio.Lock()

    async def register(self, auth: AuthContext) -> tuple[str, AuthHandle]:
        """Mint a new stream_id and register a fresh AuthHandle for it.

        Returns the `(stream_id, handle)` pair. The caller should put
        `stream_id` into the first SSE frame and pass `handle` into
        the stream generator in place of the raw AuthContext.
        """
        stream_id = str(uuid.uuid4())
        handle = AuthHandle(auth)
        async with self._lock:
            self._handles[stream_id] = handle
        return stream_id, handle

    async def get(self, stream_id: str) -> AuthHandle | None:
        async with self._lock:
            return self._handles.get(stream_id)

    async def unregister(self, stream_id: str) -> None:
        async with self._lock:
            self._handles.pop(stream_id, None)

    def active_count(self) -> int:
        """Non-locking dirty read — for ops/health probes only."""
        return len(self._handles)


# Process-wide singleton. All chat endpoints + the token-refresh
# endpoint must use the same instance, or the lookup will miss.
_REGISTRY = StreamRegistry()


def get_stream_registry() -> StreamRegistry:
    return _REGISTRY
