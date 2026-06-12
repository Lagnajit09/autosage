"""Ephemeral store for prepared-but-not-enqueued workflow runs.

The secure password side-channel: an autobot turn that wants to run a workflow
with run-time parameters does NOT enqueue directly. It asks Django to mint a
run intent here; the user's browser later POSTs the confirmed params (secrets
included) straight to the fulfill view, which enqueues on the manual trigger
path. Autobot only ever holds the run_intent_id, never the value.

Intents live in Redis rather than a model: they are short-lived (5 min) and
single-use, so ``SET … EX`` gives self-evicting expiry and ``GETDEL`` consumes
one atomically (a double-submit or expire/fulfill race collapses to a single
run). This avoids a migration, a cleanup cron, and a queryable row for what is
a transient token.

Uses the raw redis client (mirroring ``redis_pubsub``), not Django's cache
framework, whose default ``LocMemCache`` backend is per-process and would not
be shared across workers. A dropped key (Redis restart / eviction) simply
surfaces as "expired" on fulfill — the user re-asks Autobot to run it.
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
