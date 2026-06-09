"""Redis hot-context cache for autobot conversations.

Lives on Redis DB index `/2` (Celery owns `/0`). Keys carry an explicit
TTL refreshed on read, so active threads stay warm and idle threads age
out naturally. Under memory pressure, `volatile-lru` can only evict
TTL-bearing keys — Celery's broker items (no TTL) are protected.

Key namespace:
  autobot:thread:<id>:ctx       — JSON-encoded recent-messages window
  autobot:thread:<id>:summary   — plain text rolling summary
  autobot:admin_quota:<sub>:<yyyymmdd> — per-user admin-key counter
  autobot:exec_quota:<sub>:<yyyymmdd>  — per-user chat-execution counter
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

    Entries TTL out after `default_ttl` seconds (default 7200, see
    AUTOBOT_CTX_TTL_SECONDS). Reads refresh the TTL.
    """

    def __init__(self, redis_url: str, default_ttl: int = 7200):
        self._redis_url = redis_url
        self._default_ttl = default_ttl
        self._client: Redis = aioredis.from_url(
            redis_url, decode_responses=True,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def ping(self) -> bool:
        try:
            return bool(await self._client.ping())
        except Exception as e:
            logger.warning("Redis ping failed: %s", e)
            return False

    async def get_thread_ctx(self, thread_id: str) -> Any | None:
        key = _thread_ctx_key(thread_id)
        raw = await self._client.get(key)
        if raw is None:
            return None
        await self._client.expire(key, self._default_ttl)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Corrupt cache entry at %s; deleting", key)
            await self._client.delete(key)
            return None

    async def set_thread_ctx(
        self,
        thread_id: str,
        data: Any,
        ttl: int | None = None,
    ) -> None:
        await self._client.set(
            _thread_ctx_key(thread_id),
            json.dumps(data, default=str),
            ex=ttl if ttl is not None else self._default_ttl,
        )

    async def invalidate_thread_ctx(self, thread_id: str) -> None:
        await self._client.delete(_thread_ctx_key(thread_id))

    async def get_thread_summary(self, thread_id: str) -> str | None:
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

    async def incr_admin_quota_for_today(
        self,
        user_sub: str,
        daily_limit: int,
    ) -> tuple[bool, int]:
        """Increment the user's daily admin-key counter and check the cap.

        Returns ``(allowed, count)``. Ticks once per chat turn (not per
        tool-call round). Keyed by UTC date; 26h TTL covers DST + clock
        skew. ``daily_limit=0`` disables the cap.

        Redis errors fail-OPEN — better to let chat through than block
        every user when Redis is down. slowapi still protects against
        runaway request volume.
        """
        if daily_limit <= 0:
            return True, 0

        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        key = f"autobot:admin_quota:{user_sub}:{today}"

        try:
            count = await self._client.incr(key)
            if count == 1:
                await self._client.expire(key, 60 * 60 * 26)
        except Exception as e:
            logger.warning(
                "Admin-quota counter unavailable for user_sub=%s (%s); "
                "fail-open",
                user_sub, e,
            )
            return True, 0

        allowed = count <= daily_limit
        if not allowed:
            logger.info(
                "Admin-quota exceeded: user_sub=%s count=%d limit=%d",
                user_sub, count, daily_limit,
            )
        return allowed, int(count)

    async def get_admin_quota_for_today(self, user_sub: str) -> int:
        """Read-only sibling of :meth:`incr_admin_quota_for_today`.

        Returns 0 on cache miss or any Redis error — the dashboard
        treats missing data as "no usage yet today" rather than 5xx'ing.
        """
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        key = f"autobot:admin_quota:{user_sub}:{today}"
        try:
            raw = await self._client.get(key)
        except Exception as e:
            logger.warning(
                "Admin-quota read failed for user_sub=%s (%s); fail-open",
                user_sub, e,
            )
            return 0
        if raw is None:
            return 0
        try:
            return int(raw)
        except (TypeError, ValueError):
            return 0

    async def incr_exec_quota_for_today(
        self,
        user_sub: str,
        daily_limit: int,
    ) -> tuple[bool, int]:
        """Increment the user's daily chat-initiated-execution counter.

        Distinct from the admin-LLM quota (:meth:`incr_admin_quota_for_today`)
        so BYO users — uncapped on LLM turns — are still bounded on real
        compute. Ticks once per run tool-call (``run_workflow``/``run_script``/
        ``rerun_workflow``), keyed by UTC date at
        ``autobot:exec_quota:<sub>:<yyyymmdd>`` with a 26h TTL covering DST +
        clock skew. ``daily_limit=0`` disables the cap.

        Returns ``(allowed, count)``. Redis errors fail-OPEN — Django's
        ExecutionBurst/SustainedThrottle is the real backstop, so a Redis
        outage shouldn't block runs entirely.
        """
        if daily_limit <= 0:
            return True, 0

        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        key = f"autobot:exec_quota:{user_sub}:{today}"

        try:
            count = await self._client.incr(key)
            if count == 1:
                await self._client.expire(key, 60 * 60 * 26)
        except Exception as e:
            logger.warning(
                "Exec-quota counter unavailable for user_sub=%s (%s); "
                "fail-open",
                user_sub, e,
            )
            return True, 0

        allowed = count <= daily_limit
        if not allowed:
            logger.info(
                "Exec-quota exceeded: user_sub=%s count=%d limit=%d",
                user_sub, count, daily_limit,
            )
        return allowed, int(count)

    async def get_exec_quota_for_today(self, user_sub: str) -> int:
        """Read-only sibling of :meth:`incr_exec_quota_for_today`.

        Returns 0 on cache miss or any Redis error — callers treat missing
        data as "no executions yet today" rather than surfacing a 5xx.
        """
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        key = f"autobot:exec_quota:{user_sub}:{today}"
        try:
            raw = await self._client.get(key)
        except Exception as e:
            logger.warning(
                "Exec-quota read failed for user_sub=%s (%s); fail-open",
                user_sub, e,
            )
            return 0
        if raw is None:
            return 0
        try:
            return int(raw)
        except (TypeError, ValueError):
            return 0


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
