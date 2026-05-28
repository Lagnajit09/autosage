"""Autobot service configuration (T09).

Settings are loaded from environment variables — docker compose injects
them via `env_file: .env.autobot`. See `autobot.env.example` for the
full key inventory. Field names match the env-var keys verbatim (Pydantic
respects `case_sensitive=True`).
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class AutobotSettings(BaseSettings):
    """All environment-driven config in one place.

    Fields are grouped by which task will start consuming them:
      • CLERK_*           — T10 JWT verification
      • DJANGO_INTERNAL_URL, REDIS_URL — T11 persistence + cache
      • *_API_KEY, DEFAULT_* — T12 LLM provider resolution
      • AUTOBOT_*         — T13+ chat-loop behavior tuning
    """

    model_config = SettingsConfigDict(
        # Compose injects env directly; we don't read .env files from disk.
        env_file=None,
        case_sensitive=True,
        # Tolerate extra env vars from the container environment without
        # erroring at startup. Helps when sharing env files across tasks.
        extra="ignore",
    )

    # ── Service identity ────────────────────────────────────────────────
    service_name: str = "autobot"
    version: str = "0.1.0"

    # ── Auth (T10) ──────────────────────────────────────────────────────
    # Same Clerk app as Django. CLERK_SECRET_KEY authenticates the JWKS
    # fetch; the PUBLISHABLE_KEY is here for parity but unused server-side.
    CLERK_PUBLISHABLE_KEY: str = ""
    CLERK_SECRET_KEY: str = ""

    # ── Internal endpoints (T11) ────────────────────────────────────────
    # Compose DNS resolves these against the autosage-net bridge.
    DJANGO_INTERNAL_URL: str = "http://server:8000"
    # Redis DB index /2 is reserved for autobot; /0 is Celery, /1 unused.
    REDIS_URL: str = "redis://redis:6379/2"

    # ── LLM providers (T12, admin defaults; users may BYO via LLMConfig) ─
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""

    # Used when the user has no `default_llm_config` set in UserSettings.
    DEFAULT_PROVIDER: str = "gemini"
    DEFAULT_MODEL: str = "gemini/gemini-1.5-flash"

    # ── Behavior tuning (T13+) ──────────────────────────────────────────
    # Hard cap on tool-call rounds per user turn. Bounds runaway loops
    # without choking realistic multi-step workflow scenarios — e.g.
    # "create a workflow with 3 scripts" can take 5–6 rounds even when
    # the LLM batches independent calls, and 8–10 if it goes serial.
    # 10 gives generous slack while still bailing on genuine misbehavior.
    AUTOBOT_MAX_TOOL_ROUNDS: int = 10
    # Redis TTL for hot conversation context (seconds). Refreshed on access.
    AUTOBOT_CTX_TTL_SECONDS: int = 7200
    # Summarization trigger as a fraction of the model's context window.
    AUTOBOT_CONTEXT_TARGET_RATIO: float = 0.6
    # Verbatim messages retained when older history is summarized.
    AUTOBOT_KEEP_LAST_N: int = 8

    # ── Logging ─────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"


@lru_cache
def get_settings() -> AutobotSettings:
    """Cached singleton — don't re-parse env on every request."""
    return AutobotSettings()
