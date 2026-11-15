"""Per-user admin-LLM quota: the plan's daily limit, shared by every surface.

The web chat and Sage draw from the same daily allowance of admin-keyed
(free) LLM turns, keyed by the user's Clerk id. This module holds the plan
lookup so both surfaces agree on the limit; the counter itself lives in
`conversation.cache` (`incr_admin_quota_for_today`).
"""

from __future__ import annotations

import json
import logging

from conversation.cache import get_cache
from conversation.persistence import get_django_client
from settings import get_settings

logger = logging.getLogger(__name__)


async def get_admin_daily_limit(user_sub: str) -> int:
    """Return the per-plan admin daily limit for a user.

    Hits Django's /api/billing/internal/plan/ endpoint and caches the result
    in Redis for 1 hour. Falls back to AUTOBOT_ADMIN_DAILY_LIMIT on any error.
    """
    settings = get_settings()
    cache_key = f"autobot:billing_plan:{user_sub}"
    cache = get_cache()

    try:
        cached = await cache._client.get(cache_key)
        if cached:
            data = json.loads(cached)
            return int(data.get('admin_daily_limit', settings.AUTOBOT_ADMIN_DAILY_LIMIT))
    except Exception:
        pass

    try:
        client = get_django_client()
        status_code, body = await client.request(
            method='GET',
            path='/api/billing/internal/plan/',
            internal_secret=settings.AUTOBOT_INTERNAL_SECRET,
            params={'user_sub': user_sub},
        )
        if status_code == 200 and isinstance(body, dict):
            limit = int(body.get('admin_daily_limit', settings.AUTOBOT_ADMIN_DAILY_LIMIT))
            try:
                await cache._client.set(cache_key, json.dumps(body), ex=3600)
            except Exception:
                pass
            return limit
    except Exception as e:
        logger.warning('billing plan lookup failed for %s: %s; using default', user_sub, e)

    return settings.AUTOBOT_ADMIN_DAILY_LIMIT
