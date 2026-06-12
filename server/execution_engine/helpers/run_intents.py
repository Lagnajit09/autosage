"""Ephemeral store for prepared-but-not-enqueued workflow runs (X17).

AD-B9 Layer-4b — the secure password side-channel. An autobot execution-mode
turn that wants to run a workflow with run-time parameters does NOT enqueue
directly. Instead it asks Django to mint a **run intent** here, and the user's
browser later POSTs the confirmed params (secrets included) straight to the
``fulfill`` view, which converges on ``enqueue_workflow_run`` on the *manual*
trigger path. Autobot only ever holds the ``run_intent_id`` — never the value.

Why Redis instead of a Django model:
  • The intent is short-lived (5 min) and single-use — Redis ``SET … EX`` gives
    self-evicting expiry with no cleanup cron, and ``GETDEL`` consumes the
    intent atomically (read-and-delete in one round trip), so a double-submit
    or a fulfill/expire race collapses to exactly one run with no DB-level
    ``fulfilled_at`` guard.
  • It avoids a migration and a queryable row for what is a transient token.

We use the raw redis client (mirroring ``redis_pubsub``), NOT Django's cache
framework — the default ``CACHES`` backend is ``LocMemCache`` (per-process),
which would not be shared across Gunicorn/Celery workers.

A dropped key (Redis restart / LRU eviction) simply surfaces as "expired" on
fulfill — the user re-asks Autobot to run it. Acceptable for a 5-min token.
"""

from __future__ import annotations

import json
import logging
import ssl
import uuid
from typing import Any

import redis

from execution_engine.helpers.redis_pubsub import (
    _REDIS_URL,
    _is_ssl_url,
    _strip_ssl_cert_reqs_from_url,
)

logger = logging.getLogger(__name__)

_KEY_PREFIX = "workflow_run_intent:"
_TTL_SECONDS = 300  # 5-minute single-use window

# Lazy singleton so we don't open a connection at import time.
_redis: redis.Redis | None = None


def _get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        clean_url = _strip_ssl_cert_reqs_from_url(_REDIS_URL)
        kwargs: dict = {"decode_responses": True}
        if _is_ssl_url(_REDIS_URL):
            kwargs["ssl_cert_reqs"] = ssl.CERT_NONE
        _redis = redis.Redis.from_url(clean_url, **kwargs)
    return _redis


def create_intent(
    *,
    user_id: Any,
    workflow_id: Any,
    inputs: dict[str, Any] | None,
    send_email: bool,
    notification_email: str,
) -> str:
    """Mint a single-use run intent and return its id.

    ``inputs`` are the model-proposed **non-secret** inputs only — the browser
    overlays the authoritative (secret-carrying) params at fulfill time.
    """
    intent_id = str(uuid.uuid4())
    payload = json.dumps(
        {
            "user_id": str(user_id),
            "workflow_id": str(workflow_id),
            "inputs": inputs or {},
            "send_email": bool(send_email),
            "notification_email": notification_email or "",
        }
    )
    _get_redis().set(_KEY_PREFIX + intent_id, payload, ex=_TTL_SECONDS)
    return intent_id


def consume_intent(intent_id: str) -> dict[str, Any] | None:
    """Atomically fetch-and-delete an intent (single-use).

    Returns the stored payload dict, or ``None`` if the intent is missing,
    expired, or was already consumed. ``GETDEL`` makes the read-and-delete a
    single atomic operation, so concurrent fulfills can never both succeed.
    """
    raw = _get_redis().getdel(_KEY_PREFIX + intent_id)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Discarding malformed run intent payload for %s", intent_id)
        return None
