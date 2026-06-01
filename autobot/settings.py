"""Autobot service configuration.

Settings are loaded from environment variables — docker compose injects
them via `env_file: .env.autobot`. See `autobot.env.example` for the
full key inventory.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class AutobotSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=None,
        case_sensitive=True,
        extra="ignore",
    )

    service_name: str = "autobot"
    version: str = "0.1.0"

    CLERK_PUBLISHABLE_KEY: str = ""
    CLERK_SECRET_KEY: str = ""

    DJANGO_INTERNAL_URL: str = "http://server:8000"
    # Redis DB index /2 is reserved for autobot; /0 is Celery.
    REDIS_URL: str = "redis://redis:6379/2"

    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    CEREBRAS_API_KEY: str = ""

    # Default admin LLM. Quota-fit ranking (best → worst):
    #   1. groq/llama-4-scout-17b — 30 RPM, 30k TPM, 8k completion cap
    #   2. cerebras/gpt-oss-120b — 65k context, 32k output
    #   3. openrouter/openai/gpt-oss-120b:free — 20 RPM, 50 RPD
    #   4. openrouter/nvidia/llama-3.1-nemotron-70b-instruct:free
    #   5. gemini/gemini-2.5-flash — 5 RPM, 250 RPD
    #   6. gemini/gemini-2.5-flash-lite
    DEFAULT_PROVIDER: str = "groq"
    DEFAULT_MODEL: str = "groq/meta-llama/llama-4-scout-17b-16e-instruct"

    # Hard cap on tool-call rounds per user turn. Bounds runaway loops;
    # multi-step workflow scenarios can take 5–10 rounds when serial.
    AUTOBOT_MAX_TOOL_ROUNDS: int = 10

    # Comma-separated `provider/model` entries to try in order on retryable
    # errors. Only attempted on round 1, and only before any token is emitted —
    # we never swap providers mid-reply. BYO is final; no fallback for that path.
    # Providers with no API key configured are silently skipped.
    AUTOBOT_ADMIN_FALLBACKS: str = (
        "cerebras/gpt-oss-120b,"
        "openrouter/openai/gpt-oss-120b:free,"
        "openrouter/nvidia/llama-3.1-nemotron-70b-instruct:free,"
        "gemini/gemini-2.5-flash,"
        "gemini/gemini-2.5-flash-lite"
    )

    # Per-user daily quota on admin-keyed chat turns. Tracked in Redis at
    # `autobot:admin_quota:<sub>:<yyyymmdd>`. Ticks once per chat turn (not
    # per tool-call round). BYO turns don't count. Set to 0 to disable.
    AUTOBOT_ADMIN_DAILY_LIMIT: int = 10
    AUTOBOT_CTX_TTL_SECONDS: int = 7200
    AUTOBOT_CONTEXT_TARGET_RATIO: float = 0.6
    AUTOBOT_KEEP_LAST_N: int = 8

    # Comma-separated origins permitted to call autobot from the browser.
    # Empty default forces explicit per-environment configuration:
    #   dev:  CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080
    #   prod: CORS_ALLOWED_ORIGINS=https://<your-prod-host>
    CORS_ALLOWED_ORIGINS: str = ""

    LOG_LEVEL: str = "INFO"

    @property
    def cors_origins_list(self) -> list[str]:
        return [
            o.strip()
            for o in self.CORS_ALLOWED_ORIGINS.split(",")
            if o.strip()
        ]


@lru_cache
def get_settings() -> AutobotSettings:
    return AutobotSettings()
