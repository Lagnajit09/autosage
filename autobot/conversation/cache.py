"""Redis hot-context cache for autobot conversations (T11).

Lives on Redis DB index `/2` (Celery owns `/0`; `/1` is unused). Keys
carry an explicit TTL, refreshed on read, so:

  • Active threads stay in cache as long as users keep chatting.
  • Idle threads age out on their own — no manual cleanup needed.
  • Under memory pressure, Redis's `volatile-lru` policy can only
    evict TTL-bearing keys (us). Celery's broker queue items have
    no TTL and are protected. See docker-compose.{dev,oci}.yml.

This module is infrastructure for T13+ (the chat loop uses it to avoid
re-fetching message history from Django on every turn). T11 just lands
the helpers; nothing actively reads/writes yet.

Key namespace
─────────────
  autobot:thread:<id>:ctx       — JSON-encoded recent-messages window
  autobot:thread:<id>:summary   — plain text rolling summary
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any

import redis.asyncio as aioredis
from redis.asyncio.client import Redis

from settings import get_settings

logger = logging.getLogger(__name__)


def _thread_ctx_key(thread_id: str) -> str:
    return f"autobot:thread:{thread_id}:ctx"


def _thread_summary_key(thread_id: str) -> str:
    return f"autobot:thread:{thread_id}:summary"


class ConversationCache:
    """Async Redis-backed cache for hot conversation state.

    All entries TTL-out after ``default_ttl`` seconds (default 7200,
    configurable via AUTOBOT_CTX_TTL_SECONDS). Reads refresh the TTL,
    so an active conversation stays warm indefinitely.
    """

    def __init__(self, redis_url: str, default_ttl: int = 7200):
        self._redis_url = redis_url
        self._default_ttl = default_ttl
        # decode_responses=True so .get() returns str instead of bytes —
        # cleaner JSON parsing and matches how the rest of the autobot
        # code expects to handle text.
        self._client: Redis = aioredis.from_url(
            redis_url, decode_responses=True,
        )

    async def aclose(self) -> None:
        """Close the connection pool. Called from FastAPI lifespan."""
        await self._client.aclose()

    async def ping(self) -> bool:
        """Lightweight liveness probe — used by future /readyz/ endpoint."""
        try:
            return bool(await self._client.ping())
        except Exception as e:
            logger.warning("Redis ping failed: %s", e)
            return False

    # ── Thread context ────────────────────────────────────────────────

    async def get_thread_ctx(self, thread_id: str) -> Any | None:
        """Return cached thread context (parsed JSON) or None on miss."""
        key = _thread_ctx_key(thread_id)
        raw = await self._client.get(key)
        if raw is None:
            return None
        # Refresh TTL on read so active threads stay warm.
        await self._client.expire(key, self._default_ttl)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            # Corrupt entry — log and drop. The next chat turn will
            # re-hydrate from Django.
            logger.warning("Corrupt cache entry at %s; deleting", key)
            await self._client.delete(key)
            return None

    async def set_thread_ctx(
        self,
        thread_id: str,
        data: Any,
        ttl: int | None = None,
    ) -> None:
        """Write/overwrite the cached context with an explicit TTL."""
        await self._client.set(
            _thread_ctx_key(thread_id),
            json.dumps(data, default=str),
            ex=ttl if ttl is not None else self._default_ttl,
        )

    async def invalidate_thread_ctx(self, thread_id: str) -> None:
        """Delete the cached context — used after write-tool calls (T18)."""
        await self._client.delete(_thread_ctx_key(thread_id))

    # ── Thread summary ────────────────────────────────────────────────

    async def get_thread_summary(self, thread_id: str) -> str | None:
        """Return the cached rolling summary (plain text) or None."""
        key = _thread_summary_key(thread_id)
        raw = await self._client.get(key)
        if raw is not None:
            await self._client.expire(key, self._default_ttl)
        return raw

    async def set_thread_summary(
        self,
        thread_id: str,
        text: str,
        ttl: int | None = None,
    ) -> None:
        await self._client.set(
            _thread_summary_key(thread_id),
            text,
            ex=ttl if ttl is not None else self._default_ttl,
        )

    async def invalidate_thread_summary(self, thread_id: str) -> None:
        await self._client.delete(_thread_summary_key(thread_id))


@lru_cache
def get_cache() -> ConversationCache:
    """Cached singleton — one Redis connection pool per process."""
    settings = get_settings()
    return ConversationCache(
        redis_url=settings.REDIS_URL,
        default_ttl=settings.AUTOBOT_CTX_TTL_SECONDS,
    )


async def close_cache() -> None:
    """Close the cached client, if any. Idempotent."""
    if get_cache.cache_info().currsize == 0:
        return
    await get_cache().aclose()
    get_cache.cache_clear()
