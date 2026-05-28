"""Autobot — FastAPI service."""

import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI

from auth import AuthContext, get_verifier, install_log_redaction, require_auth
from conversation.cache import close_cache
from conversation.persistence import close_django_client
from llm.tools import list_tool_names
from routers import chat as chat_router
from routers import proxy as proxy_router
from settings import get_settings
# Import for side effect — each tool module registers its tools into the
# global registry on import. Without this line the LLM gets an empty
# `tools=` payload and never calls anything. Must run before lifespan
# logs the available tools.
import tools as _tools  # noqa: F401

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
# Install the Bearer-token redactor immediately so even import-time logs
# from httpx / urllib3 / pyjwt are scrubbed if they hit DEBUG.
install_log_redaction()
# httpx logs every request at INFO by default — noisy and could echo
# the Authorization header on errors. Cap at WARNING.
logging.getLogger("httpx").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

# Service start time, used by /health/ for uptime reporting.
SERVICE_STARTED_AT_MONOTONIC = time.monotonic()
SERVICE_STARTED_AT_WALL = datetime.now(timezone.utc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Idempotent — module-level call already installed it, but if
    # uvicorn's reload re-imports we re-attach to any new handlers.
    install_log_redaction()
    logger.info(
        "Autobot %s starting (default_provider=%s, default_model=%s, "
        "django=%s, redis=%s, tools=%s)",
        settings.version,
        settings.DEFAULT_PROVIDER,
        settings.DEFAULT_MODEL,
        settings.DJANGO_INTERNAL_URL,
        settings.REDIS_URL,
        list_tool_names() or "(none registered)",
    )
    yield
    # Close all long-lived resources cleanly on shutdown. Each helper is
    # idempotent — safe to call even if the resource was never created
    # during this process's lifetime (no requests received).
    await get_verifier().aclose()
    await close_django_client()
    await close_cache()
    logger.info("Autobot shutting down")


app = FastAPI(
    title="Autobot",
    version=settings.version,
    description="Autosage's LLM assistant — chat, script + workflow generation.",
    root_path="/api/ai",
    lifespan=lifespan,
)

# ── Proxy routes (T11) ────────────────────────────────────────────────
# /threads/, /threads/<id>/, /settings/ — thin forwards to Django's
# /api/autobot/* internal API. No prefix — paths are mounted as-written.
app.include_router(proxy_router.router)

# ── Chat route (T12) ──────────────────────────────────────────────────
# POST /threads/<id>/messages/ — non-streaming LLM turn. T13 will add
# the SSE streaming variant; this endpoint stays as the internal /
# fallback path.
app.include_router(chat_router.router)


@app.get("/health/")
async def health():
    """Public liveness probe — NO auth, intentionally.

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


@app.get("/whoami/")
async def whoami(auth: AuthContext = Depends(require_auth)):
    """Authenticated canary — confirms the Clerk JWT flow end-to-end.

    Returns ONLY the user_sub (the Clerk sub claim). Doesn't echo back
    the token, claims, or any header — minimizing accidental disclosure.
    Every subsequent protected route attaches the same
    `Depends(require_auth)` to inherit this behavior.
    """
    return {"user_sub": auth.user_sub}
