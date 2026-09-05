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

    # Shared secret presented as `X-Internal-Secret` on the public docs path's
    # Django call (`/api/autobot/docs/search/`). MUST match Django's
    # `AUTOBOT_INTERNAL_SECRET`. Empty default → the docs tool fails closed
    # (Django rejects an empty/absent secret), so a misconfigured deploy can
    # never expose the endpoint. No user JWT is involved on this path.
    AUTOBOT_INTERNAL_SECRET: str = ""

    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    CEREBRAS_API_KEY: str = ""

    NVIDIA_NIM_API_KEY: str = ""

    # Verified reachable + tool-calling on our NVIDIA key (probed 2026-09-05
    # with tools+tool_choice attached). NVIDIA's public /v1/models list is
    # NOT account-scoped, so re-probe before adding an entry: gated models
    # return 404 "Function <uuid>: Not found for account <id>".
    DEFAULT_PROVIDER: str = "nvidia_nim"
    DEFAULT_MODEL: str = "nvidia/nemotron-3-super-120b-a12b"

    # Hard cap on tool-call rounds per user turn. Bounds runaway loops;
    # multi-step workflow scenarios can take 5–10 rounds when serial.
    AUTOBOT_MAX_TOOL_ROUNDS: int = 10

    # Comma-separated `provider/model` entries to try in order on retryable
    # errors. Only attempted on round 1, and only before any token is emitted —
    # we never swap providers mid-reply. BYO is final; no fallback for that path.
    # Providers with no API key configured are silently skipped.
    # NVIDIA entries carry the model's own org prefix, so they read
    # `nvidia_nim/<org>/<model>` — the two slashes are intentional and parse
    # correctly (split on the FIRST slash only).
    # NVIDIA endpoints scale to zero, so a cold model's first token can take
    # minutes (probed: lightning 2s, ultra 36s, deepseek 188s, kimi-k3 298s).
    # Lightning sits second precisely because it answered warm — it's the
    # latency escape hatch when the primary is cold.
    # Excluded deliberately: kimi-k2.6 + nemotron-nano-3 (404, gated for this
    # key), deepseek-v4-* (open NVIDIA bug — streaming tool calls don't
    # propagate), kimi-k3 (no tool_choice; always-on thinking at max effort).
    AUTOBOT_ADMIN_FALLBACKS: str = (
        "nvidia_nim/nvidia/nemotron-3.5-lightning-30b-a3b,"
        "nvidia_nim/openai/gpt-oss-20b,"
        "nvidia_nim/nvidia/nemotron-3-ultra-550b-a55b,"
        "cerebras/gpt-oss-120b,"
        "groq/meta-llama/llama-4-scout-17b-16e-instruct,"
        "openrouter/openai/gpt-oss-120b:free,"
        "gemini/gemini-2.5-flash,"
        "gemini/gemini-2.5-flash-lite"
    )

    # Per-user daily quota on admin-keyed chat turns. Tracked in Redis at
    # `autobot:admin_quota:<sub>:<yyyymmdd>`. Ticks once per chat turn (not
    # per tool-call round). BYO turns don't count. Set to 0 to disable.
    # Kept as the fallback default (used when the billing lookup is unavailable).
    AUTOBOT_ADMIN_DAILY_LIMIT: int = 10

    # Per-plan daily limits for admin-keyed turns. These override
    # AUTOBOT_ADMIN_DAILY_LIMIT when billing info is available.
    AUTOBOT_FREE_ADMIN_DAILY_LIMIT: int = 10
    AUTOBOT_PRO_ADMIN_DAILY_LIMIT: int = 100

    # Per-user daily quota on chat-initiated executions (run_workflow /
    # run_script / rerun_workflow). Tracked in Redis at
    # `autobot:exec_quota:<sub>:<yyyymmdd>`. Distinct from the admin-LLM
    # quota so BYO users (uncapped LLM) are still bounded on real compute.
    # Set to 0 to disable. Django Execution throttles are the backstop.
    AUTOBOT_EXEC_DAILY_LIMIT: int = 25

    # ── Public docs chat (Pillar A) ──────────────────────────────────────
    # Per-IP daily cap on the no-Clerk docs widget, tracked in Redis at
    # `autobot:docs_quota:<ip>:<yyyymmdd>` (26h TTL, fail-open). Bounds
    # free-LLM-key abuse on the public endpoint independently of the slowapi
    # burst throttle. Set to 0 to disable.
    AUTOBOT_DOCS_DAILY_LIMIT: int = 50
    # TTL (seconds) on an anonymous docs chat session in Redis
    # (`autobot:docs_session:<session_id>`). ~2h keeps a visitor's thread
    # warm across page navigation without persisting anything in Django.
    AUTOBOT_DOCS_SESSION_TTL: int = 7200
    # Burst rate limit (slowapi) on the public docs-chat endpoint, IP-keyed.
    AUTOBOT_DOCS_RATE_LIMIT: str = "10/minute"
    # Bounds on a single docs-chat request, defending the public path.
    AUTOBOT_DOCS_MAX_MESSAGE_CHARS: int = 2000
    # How many prior turns of anon history to replay into the model context.
    AUTOBOT_DOCS_MAX_HISTORY_TURNS: int = 12
    # Cap on tool-call rounds for the docs loop — search is the only tool,
    # so a couple of rounds is plenty; bounds runaway loops on free keys.
    AUTOBOT_DOCS_MAX_TOOL_ROUNDS: int = 3

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
