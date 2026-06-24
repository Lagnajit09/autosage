"""Autobot — FastAPI service."""

import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from auth import AuthContext, get_verifier, install_log_redaction, require_auth
from conversation.cache import close_cache
from conversation.persistence import close_django_client
from llm.tools import list_tool_names
from routers import analytics as analytics_router
from routers import chat as chat_router
from routers import docs_chat as docs_chat_router
from routers import proxy as proxy_router
from settings import get_settings
from throttling import limiter
# Side-effect import: each tool module registers into the global registry.
import tools as _tools  # noqa: F401

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
install_log_redaction()
# httpx logs every request at INFO and may echo Authorization headers on errors.
logging.getLogger("httpx").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

SERVICE_STARTED_AT_MONOTONIC = time.monotonic()
SERVICE_STARTED_AT_WALL = datetime.now(timezone.utc)


@asynccontextmanager
async def lifespan(app: FastAPI):
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

_cors_origins = settings.cors_origins_list
if not _cors_origins:
    logger.warning(
        "CORS_ALLOWED_ORIGINS is empty — every cross-origin browser "
        "request to /api/ai/* will be blocked. Set the env var in "
        "autobot.env (see autobot.env.example for dev values).",
    )
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    # Explicit methods/headers: allow_credentials=True forbids wildcards.
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# Limiter must be attached before router include — slowapi reads it on decoration.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(proxy_router.router)
app.include_router(chat_router.router)
app.include_router(analytics_router.router)

# Public, no-Clerk docs assistant for the Docusaurus widget (Pillar A).
app.include_router(docs_chat_router.router)


@app.get("/health/")
async def health():
    """Public liveness probe — no auth."""
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
    """Authenticated canary — returns only the user_sub."""
    return {"user_sub": auth.user_sub}
