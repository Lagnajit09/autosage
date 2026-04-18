"""
Redis Pub/Sub helpers for real-time workflow execution logs.

The Celery task publishes log chunks to a per-run channel as they arrive
from the exec-worker.  The Django SSE view subscribes to the same channel
and relays them to the frontend as Server-Sent Events.

Channel naming:  ``workflow_run:<run_id>:logs``
"""

import json
import logging
import asyncio
import ssl
from typing import AsyncGenerator
from urllib.parse import urlparse, urlencode, urlunparse, parse_qs

import redis
import redis.asyncio as aioredis
from django.conf import settings

logger = logging.getLogger(__name__)

# ── Redis URL (reuse from Celery config) ──────────────────────────────────────
_REDIS_URL: str = getattr(settings, "CELERY_BROKER_URL", "redis://localhost:6379/0")


def _strip_ssl_cert_reqs_from_url(url: str) -> str:
    """
    Strip the ssl_cert_reqs query parameter from the URL so redis-py does not
    see it as an unknown parameter. The ssl_cert_reqs value is passed directly
    as a kwarg instead.
    """
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    qs.pop("ssl_cert_reqs", None)
    new_query = urlencode({k: v[0] for k, v in qs.items()})
    return urlunparse(parsed._replace(query=new_query))


def _is_ssl_url(url: str) -> bool:
    return url.startswith("rediss://")


def _channel_name(run_id: str) -> str:
    """Return the Redis Pub/Sub channel name for a given workflow run."""
    return f"workflow_run:{run_id}:logs"


# ─────────────────────────────────────────────────────────────────────────────
# Synchronous publisher — called from the Celery worker
# ─────────────────────────────────────────────────────────────────────────────

# Lazy singleton so we don't open a connection at import time.
_sync_redis: redis.Redis | None = None


def _get_sync_redis() -> redis.Redis:
    global _sync_redis
    if _sync_redis is None:
        clean_url = _strip_ssl_cert_reqs_from_url(_REDIS_URL)
        kwargs: dict = {"decode_responses": True}
        if _is_ssl_url(_REDIS_URL):
            kwargs["ssl_cert_reqs"] = ssl.CERT_NONE
        _sync_redis = redis.Redis.from_url(clean_url, **kwargs)
    return _sync_redis


def publish_workflow_log(run_id: str, event: str, data: dict) -> None:
    """
    Publish a single log event to the workflow run channel.

    Args:
        run_id:  UUID of the WorkflowRun.
        event:   SSE event name (stdout, stderr, status, node_start, done …).
        data:    Arbitrary JSON-serialisable dict.
    """
    channel = _channel_name(run_id)
    message = json.dumps({"event": event, "data": data})
    try:
        _get_sync_redis().publish(channel, message)
    except Exception:
        logger.exception("Failed to publish log to Redis channel %s", channel)


# ─────────────────────────────────────────────────────────────────────────────
# Async subscriber — called from the Django SSE view
# ─────────────────────────────────────────────────────────────────────────────

async def subscribe_workflow_logs(
    run_id: str,
    timeout_seconds: int = 1800,
) -> AsyncGenerator[dict, None]:
    """
    Async generator that yields log messages from the Redis channel until
    a ``done`` event is received or the timeout expires.

    Each yielded dict has the shape ``{"event": str, "data": dict}``.

    Args:
        run_id:           UUID of the WorkflowRun.
        timeout_seconds:  Maximum duration to keep the subscription open.
    """
    channel = _channel_name(run_id)
    clean_url = _strip_ssl_cert_reqs_from_url(_REDIS_URL)
    async_kwargs: dict = {"decode_responses": True}
    if _is_ssl_url(_REDIS_URL):
        async_kwargs["ssl_cert_reqs"] = ssl.CERT_NONE
    r = aioredis.from_url(clean_url, **async_kwargs)
    pubsub = r.pubsub()

    try:
        await pubsub.subscribe(channel)
        logger.info("Subscribed to Redis channel %s", channel)

        deadline = asyncio.get_event_loop().time() + timeout_seconds

        while True:
            # Check timeout
            if asyncio.get_event_loop().time() > deadline:
                logger.warning("SSE subscription for run %s timed out", run_id)
                break

            # get_message returns None when no message is ready
            raw = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=1.0
            )
            if raw is None:
                # yield control so the event loop can handle other work
                await asyncio.sleep(0.1)
                continue

            if raw["type"] != "message":
                continue

            try:
                payload = json.loads(raw["data"])
            except (json.JSONDecodeError, TypeError):
                continue

            yield payload

            # Stop when the Celery task signals completion
            if payload.get("event") == "done":
                break

    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
        await r.aclose()
        logger.info("Unsubscribed from Redis channel %s", channel)
