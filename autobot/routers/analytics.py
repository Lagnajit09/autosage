"""Analytics router: per-user Autobot usage telemetry.

`GET /dashboard/` merges Django's aggregator at `/api/autobot/dashboard/`
with autobot's Redis quota counter (Django doesn't see the counter;
it lives in autobot's Redis namespace at DB /2).
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse

from auth import AuthContext, require_auth
from conversation.cache import get_cache
from conversation.persistence import DjangoUnavailable, get_django_client
from settings import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/dashboard/")
async def get_dashboard(
    auth: AuthContext = Depends(require_auth),
) -> JSONResponse:
    """Return Django's dashboard payload plus `admin_quota` from Redis.

    Django unreachable → 503. Redis unreachable → fail-open on the
    quota (used=0) so the dashboard still renders.
    """
    client = get_django_client()
    try:
        upstream_status, body = await client.request(
            method="GET",
            path="/api/autobot/dashboard/",
            jwt=auth.raw_jwt,
        )
    except DjangoUnavailable as e:
        logger.error("Dashboard upstream failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service temporarily unavailable.",
        ) from e

    if upstream_status >= 400:
        return JSONResponse(content=body, status_code=upstream_status)

    settings = get_settings()
    fallback_limit = int(getattr(settings, "AUTOBOT_ADMIN_DAILY_LIMIT", 0) or 0)
    used = 0
    limit = fallback_limit
    try:
        cache = get_cache()
        # Try to resolve the per-plan limit from billing cache
        import json as _j
        cached_plan = await cache._client.get(f"autobot:billing_plan:{auth.user_sub}")
        if cached_plan:
            plan_data = _j.loads(cached_plan)
            limit = int(plan_data.get('admin_daily_limit', fallback_limit))
        used = await cache.get_admin_quota_for_today(auth.user_sub)
    except Exception as e:
        # `get_admin_quota_for_today` itself fails-open, but a config
        # error (unreachable host before first call) could still raise.
        logger.warning("Quota merge failed; fail-open. err=%s", e)
        used = 0

    remaining = max(0, limit - used) if limit > 0 else 0

    # Inject admin_quota into `data` without disturbing the envelope.
    if isinstance(body, dict):
        data_obj = body.get("data")
        if not isinstance(data_obj, dict):
            data_obj = {}
            body["data"] = data_obj
        data_obj["admin_quota"] = {
            "used": int(used),
            "limit": limit,
            "remaining": int(remaining),
        }
    return JSONResponse(content=body, status_code=upstream_status)
