"""Analytics router: surfaces per-user Autobot usage telemetry.

The single endpoint here (`GET /dashboard/`) merges two sources:

  • Django's aggregator at `/api/autobot/dashboard/` (T25) — request +
    token totals bucketed by Today / Last 7 days / All-time, per
    (provider, model) breakdown, BYO vs admin token split.
  • Autobot's own Redis quota counter at `autobot:admin_quota:<sub>:<yyyymmdd>`
    — needed for the "default requests remaining" KPI. Django doesn't see
    this counter; it lives in autobot's Redis namespace (DB /2).

Why a single merged endpoint instead of two client-side calls?
  The frontend needs both halves to render the Today card, and racing
  two requests would let the page flicker through a half-rendered state.
  One round-trip, one consistent payload.
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
    """Return the caller's dashboard payload.

    Shape:
      {
        "today":    { ... bucket stats ... },
        "last_7d":  { ... bucket stats ... },
        "all_time": { ... bucket stats ... },
        "admin_quota": {
          "used": int,
          "limit": int,
          "remaining": int,
        }
      }

    The Django payload is returned verbatim plus the `admin_quota` field
    injected from Redis. If Django is unreachable we 503; if Redis is
    unreachable we fail-OPEN on the quota (used=0, remaining=limit) so
    the dashboard still renders.
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

    # If Django returned non-2xx, relay verbatim — no quota merge needed.
    if upstream_status >= 400:
        return JSONResponse(content=body, status_code=upstream_status)

    settings = get_settings()
    limit = int(getattr(settings, "AUTOBOT_ADMIN_DAILY_LIMIT", 0) or 0)
    used = 0
    try:
        cache = get_cache()
        used = await cache.get_admin_quota_for_today(auth.user_sub)
    except Exception as e:
        # cache.get_admin_quota_for_today already fails-open on Redis errors,
        # but a misconfiguration could still raise (e.g. unreachable host
        # before the first call). Treat the same: render with used=0.
        logger.warning("Quota merge failed; fail-open. err=%s", e)
        used = 0

    remaining = max(0, limit - used) if limit > 0 else 0

    # Body comes back from Django shaped as {success, message, data, ...}.
    # Inject admin_quota into the `data` object, leaving the envelope alone.
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
