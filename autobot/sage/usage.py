"""SageCode usage for the CLI (`sagex /usage` and its sidebar line).

Django totals the saved turns (`GET /api/sage/usage/`, forwarded with the
user's own key); the shared daily free allowance lives in autobot's Redis, so
it's added here — the same merge the web dashboard does for the web chat
(routers/analytics.py). Redis trouble fails open (used 0), like everywhere else
the allowance is read.
"""

from __future__ import annotations

import logging
from typing import Any

from conversation.cache import get_cache
from conversation.persistence import DjangoUnavailable
from conversation.quota import get_admin_daily_limit
from sage.auth import SageAuth
from settings import get_settings

logger = logging.getLogger(__name__)


class UsageUnavailable(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


async def allowance(user_sub: str) -> dict[str, int]:
    try:
        limit = await get_admin_daily_limit(user_sub)
    except Exception as e:                                   # Redis/billing trouble: the default cap
        logger.warning("Sage usage: plan limit read failed: %s", e)
        limit = int(get_settings().AUTOBOT_ADMIN_DAILY_LIMIT or 0)
    used = 0
    try:
        used = await get_cache().get_admin_quota_for_today(user_sub)
    except Exception as e:                                   # fail open
        logger.warning("Sage usage: allowance read failed: %s", e)
    used = min(int(used or 0), limit) if limit > 0 else int(used or 0)
    return {"used": used, "limit": limit, "remaining": max(0, limit - used) if limit > 0 else 0}


async def own_key(auth: SageAuth) -> bool:
    """Whether Sage answers this user with their own LLM key (so the free
    allowance doesn't apply)."""
    try:
        status_code, body = await auth.call_django("GET", "/api/autobot/settings/")
    except DjangoUnavailable:
        return False
    data = body.get("data") if status_code == 200 and isinstance(body, dict) else None
    return bool(isinstance(data, dict) and data.get("default_llm_config"))


async def usage(auth: SageAuth) -> dict[str, Any]:
    try:
        status_code, body = await auth.call_django("GET", "/api/sage/usage/")
    except DjangoUnavailable as e:
        raise UsageUnavailable(503, "Usage is temporarily unavailable.") from e
    if status_code == 404:
        raise UsageUnavailable(404, "SageCode usage needs a newer Autosage server.")
    data = body.get("data") if status_code == 200 and isinstance(body, dict) else None
    if not isinstance(data, dict):
        raise UsageUnavailable(502 if status_code < 400 else status_code, "Usage is temporarily unavailable.")
    data["admin_quota"] = await allowance(auth.user_sub)
    data["own_key"] = await own_key(auth)
    return data
