"""Autobot — FastAPI service."""

import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI

from settings import get_settings

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

# Service start time, used by /health/ for uptime reporting.
SERVICE_STARTED_AT_MONOTONIC = time.monotonic()
SERVICE_STARTED_AT_WALL = datetime.now(timezone.utc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "Autobot %s starting (default_provider=%s, default_model=%s, "
        "django=%s, redis=%s)",
        settings.version,
        settings.DEFAULT_PROVIDER,
        settings.DEFAULT_MODEL,
        settings.DJANGO_INTERNAL_URL,
        settings.REDIS_URL,
    )
    yield
    logger.info("Autobot shutting down")


app = FastAPI(
    title="Autobot",
    version=settings.version,
    description="Autosage's LLM assistant — chat, script + workflow generation.",
    root_path="/api/ai",
    lifespan=lifespan,
)


@app.get("/health/")
async def health():
    """Public liveness probe.

    Reachable directly on the docker bridge at `http://autobot:8030/health/`
    and externally via nginx at `http://localhost:8080/api/ai/health/`
    (dev) or `https://<duckdns>/api/ai/health/` (prod).
    """
    return {
        "status": "healthy",
        "service": settings.service_name,
        "version": settings.version,
        "uptime_seconds": round(
            time.monotonic() - SERVICE_STARTED_AT_MONOTONIC, 3,
        ),
        "started_at": SERVICE_STARTED_AT_WALL.isoformat(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
