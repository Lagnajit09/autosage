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
    # Cerebras has the most generous quota of the providers we tested
    # for the admin tier (65k context, 32k output, high TPM/RPD). Used
    # as the second link in the default fallback chain below.
    CEREBRAS_API_KEY: str = ""

    # ── Default admin LLM selection ─────────────────────────────────────
    # Quota-fit ranking (best → worst) at v1, given our typical turn
    # cost (~5k prompt tokens + 2-3 tool calls + workflow JSON output):
    #
    #   1. groq/meta-llama/llama-4-scout-17b-16e-instruct
    #         30 RPM, 1000 RPD, 30k TPM, 500k TPD, 8k completion cap.
    #         Best free Groq tier — only model whose TPM doesn't get
    #         saturated by a single multi-tool turn. 8k completion cap
    #         can truncate very large workflow JSON, acceptable risk.
    #   2. cerebras/gpt-oss-120b
    #         65k context, 32k output. Generous all-around. No completion
    #         truncation risk on workflows.
    #   3. openrouter/openai/gpt-oss-120b:free
    #         20 RPM, 50 RPD. Free tier — survives short bursts.
    #   4. openrouter/nvidia/llama-3.1-nemotron-70b-instruct:free
    #         Same OpenRouter free-tier limits.
    #   5. gemini/gemini-2.5-flash
    #         5 RPM, 250 RPD — last resort, tiny RPM.
    #   6. gemini/gemini-2.5-flash-lite
    #         Even tighter than flash — absolute last resort.
    #
    # Used when the user has no `default_llm_config` set in UserSettings.
    DEFAULT_PROVIDER: str = "groq"
    DEFAULT_MODEL: str = "groq/meta-llama/llama-4-scout-17b-16e-instruct"

    # ── Behavior tuning (T13+) ──────────────────────────────────────────
    # Hard cap on tool-call rounds per user turn. Bounds runaway loops
    # without choking realistic multi-step workflow scenarios — e.g.
    # "create a workflow with 3 scripts" can take 5–6 rounds even when
    # the LLM batches independent calls, and 8–10 if it goes serial.
    # 10 gives generous slack while still bailing on genuine misbehavior.
    AUTOBOT_MAX_TOOL_ROUNDS: int = 10

    # ── Admin pool resilience (T18a) ─────────────────────────────────────
    # Comma-separated `provider/model` entries to try in order if the
    # primary admin LLM (DEFAULT_PROVIDER + DEFAULT_MODEL) returns a
    # retryable error (rate limit, 503, connection drop, timeout).
    # Only attempted on round 1 of a tool-call loop and only when no
    # tokens have been emitted yet — we never swap providers mid-reply.
    # BYO (user's `LLMConfig`) is final; no fallback for that path.
    #
    # Default chain mirrors the quota-fit ranking documented above on
    # DEFAULT_MODEL. Providers with no API key configured are skipped
    # silently by `resolve_admin_chain()`, so leaving e.g.
    # `CEREBRAS_API_KEY` blank degrades gracefully to the next link.
    AUTOBOT_ADMIN_FALLBACKS: str = (
        "cerebras/gpt-oss-120b,"
        "openrouter/openai/gpt-oss-120b:free,"
        "openrouter/nvidia/llama-3.1-nemotron-70b-instruct:free,"
        "gemini/gemini-2.5-flash,"
        "gemini/gemini-2.5-flash-lite"
    )

    # Per-user daily quota on ADMIN-keyed chat turns. Tracked in Redis
    # at `autobot:admin_quota:<sub>:<yyyymmdd>`. Counter ticks once
    # per chat turn (NOT once per tool-call round inside a turn). At
    # the cap, the user gets a friendly error and is told to add a
    # personal LLM key in Customize. BYO turns don't count. Set to 0
    # to disable the cap entirely.
    #
    # 10/day matches what the cheapest links in the fallback chain
    # (Gemini 2.5 flash = 250 RPD shared across ALL users; OpenRouter
    # free = 50 RPD per model) can realistically sustain once the
    # primary provider is rate-limited. Raise only if the Groq quota
    # holds in practice.
    AUTOBOT_ADMIN_DAILY_LIMIT: int = 10
    # Redis TTL for hot conversation context (seconds). Refreshed on access.
    AUTOBOT_CTX_TTL_SECONDS: int = 7200
    # Summarization trigger as a fraction of the model's context window.
    AUTOBOT_CONTEXT_TARGET_RATIO: float = 0.6
    # Verbatim messages retained when older history is summarized.
    AUTOBOT_KEEP_LAST_N: int = 8

    # ── CORS ────────────────────────────────────────────────────────────
    # Comma-separated origins permitted to call autobot from the browser.
    # Read from the env (pydantic-settings auto-binds each field to its
    # uppercase env var). Default is empty — no implicit cross-origin
    # access. Set in `.env.autobot` per environment:
    #   dev:  CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080
    #   prod: CORS_ALLOWED_ORIGINS=https://<your-prod-host>
    # See `autobot.env.example` for the canonical dev value.
    #
    # Why empty default (not localhost): hardcoding dev URLs as a fallback
    # means a misconfigured prod deploy ships with `localhost:5173` in the
    # allowed list — not exploitable, but a footgun and a hidden surprise.
    # An empty default makes "I forgot to configure this" loud and obvious.
    #
    # Why this exists at all: without it the browser blocks `/api/ai/*`
    # cross-origin requests because FastAPI doesn't emit
    # `Access-Control-Allow-Origin` by default. Django got it for free
    # via django-cors-headers — autobot needs its own.
    CORS_ALLOWED_ORIGINS: str = ""

    # ── Logging ─────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"

    @property
    def cors_origins_list(self) -> list[str]:
        """Split the comma-separated env string into a clean list.

        Drops blanks (so `"a, ,b"` → `["a", "b"]`) and trims whitespace
        around each entry. FastAPI's `CORSMiddleware` wants a list.
        """
        return [
            o.strip()
            for o in self.CORS_ALLOWED_ORIGINS.split(",")
            if o.strip()
        ]


@lru_cache
def get_settings() -> AutobotSettings:
    """Cached singleton — don't re-parse env on every request."""
    return AutobotSettings()
