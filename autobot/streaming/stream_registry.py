"""In-flight stream registry for mid-stream token refresh.

Clerk JWTs expire (~60s) but a chat turn can run for 30–120s when the
LLM does multi-round tool calls. The registry holds a mutable
`AuthHandle` per stream_id; `/token-refresh/` swaps in a fresh
AuthContext so subsequent Django calls use the new token.

Process-local registry — sufficient for single-replica deployment.
Behind a load balancer this would need session affinity or Redis backing.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

from auth import AuthContext

logger = logging.getLogger(__name__)


class AuthHandle:
    """Mutable AuthContext wrapper.

    `refresh()` swaps in a new AuthContext atomically. Exposes the same
    accessors as AuthContext so existing dotted access keeps working.
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
        """Swap in a verified AuthContext.

        Caller MUST have run the new token through `require_auth` first.

        Raises PermissionError if the new token's `sub` differs — blocks
        an attacker who guessed a stream_id from hijacking with their
        own valid JWT.
        """
        if new_auth.user_sub != self._auth.user_sub:
            raise PermissionError(
                "Refresh token user mismatch — cannot swap streams "
                "between users.",
            )
        logger.info(
            "Stream auth refreshed for user_sub=%s", self._auth.user_sub,
        )
        self._auth = new_auth


class StreamRegistry:
    """`stream_id → AuthHandle` for active streams.

    Reads take the lock because concurrent register/unregister can
    mutate the dict.
    """

    def __init__(self) -> None:
        self._handles: dict[str, AuthHandle] = {}
        self._lock = asyncio.Lock()

    async def register(self, auth: AuthContext) -> tuple[str, AuthHandle]:
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
        """Non-locking dirty read — ops/health probes only."""
        return len(self._handles)


_REGISTRY = StreamRegistry()


def get_stream_registry() -> StreamRegistry:
    return _REGISTRY
