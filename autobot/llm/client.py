"""LiteLLM client wrapper for autobot.

Resolves provider/model/api_key from admin settings or a user's BYO
`LLMConfig`, and normalizes LiteLLM's response into a plain dict the
chat router can persist verbatim.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import litellm

from settings import get_settings


# Litellm exception subclasses that are SAFE to retry against another
# provider. BadRequest / Auth / ContextWindowExceeded are deliberately
# excluded — those reflect the request itself being broken.
_RETRYABLE_LITELLM_ERRORS: tuple[type[Exception], ...] = tuple(
    cls for cls in (
        getattr(litellm, "RateLimitError", None),
        getattr(litellm, "ServiceUnavailableError", None),
        getattr(litellm, "APIConnectionError", None),
        getattr(litellm, "Timeout", None),
    ) if cls is not None
)


# Order matters: ContextWindowExceeded is a subclass of BadRequest on
# some litellm versions, so check more-specific classes first.
def _kind_for(e: Exception) -> str:
    """Classify a litellm exception into a friendly-message bucket.

    Raw provider errors are never surfaced to the UI — they can leak
    provider names, api keys in stack traces, or internal model ids.
    """
    ctx_cls = getattr(litellm, "ContextWindowExceededError", None)
    if ctx_cls is not None and isinstance(e, ctx_cls):
        return "context_overflow"

    cp_cls = getattr(litellm, "ContentPolicyViolationError", None)
    if cp_cls is not None and isinstance(e, cp_cls):
        return "content_policy"

    rl_cls = getattr(litellm, "RateLimitError", None)
    if rl_cls is not None and isinstance(e, rl_cls):
        return "rate_limit"

    sv_cls = getattr(litellm, "ServiceUnavailableError", None)
    if sv_cls is not None and isinstance(e, sv_cls):
        return "service_unavailable"

    auth_cls = getattr(litellm, "AuthenticationError", None)
    if auth_cls is not None and isinstance(e, auth_cls):
        return "auth"

    to_cls = getattr(litellm, "Timeout", None)
    if to_cls is not None and isinstance(e, to_cls):
        return "timeout"

    conn_cls = getattr(litellm, "APIConnectionError", None)
    if conn_cls is not None and isinstance(e, conn_cls):
        return "connection"

    bad_cls = getattr(litellm, "BadRequestError", None)
    if bad_cls is not None and isinstance(e, bad_cls):
        return "bad_request"

    return "unknown"


def _wrap_litellm_error(e: Exception) -> LLMError:
    retryable = isinstance(e, _RETRYABLE_LITELLM_ERRORS)
    return LLMError(str(e), retryable=retryable, kind=_kind_for(e))


logger = logging.getLogger(__name__)

# Quiet litellm's chatty INFO logs and disable telemetry — tokens could
# end up in DEBUG dumps.
litellm.telemetry = False
litellm.suppress_debug_info = True


class LLMError(Exception):
    """Surfaces any provider-side or configuration error to the caller.

    `retryable=True` flags errors that another provider might survive
    (rate limits, connection drops, 503s).

    `kind` is the friendly-message discriminator — the chat router maps
    it to a user-facing string via `friendly_llm_message()`.
    """

    def __init__(
        self,
        message: str,
        *,
        retryable: bool = False,
        kind: str = "unknown",
    ):
        super().__init__(message)
        self.retryable = retryable
        self.kind = kind


# What the UI shows per kind. Keep short, neutral, free of provider names.
_FRIENDLY_LLM_MESSAGES: dict[str, str] = {
    "rate_limit": (
        "The AI model hit its rate limit. Please try again in a minute."
    ),
    "service_unavailable": (
        "The AI provider is temporarily unavailable. Please try again "
        "shortly."
    ),
    "connection": (
        "Network issue reaching the AI provider. Please retry."
    ),
    "timeout": (
        "The AI took too long to respond. Please try again."
    ),
    "context_overflow": (
        "This conversation is too long for the current model. Start a "
        "new chat or shorten your message."
    ),
    "content_policy": (
        "Your message was blocked by the AI provider's content policy. "
        "Please rephrase and try again."
    ),
    "auth": (
        "The AI provider rejected our credentials. The site operators "
        "have been notified — please try again later."
    ),
    "bad_request": (
        "The AI couldn't process this request. Try rephrasing your "
        "message or starting a new chat."
    ),
    "unknown": (
        "Something went wrong reaching the AI model. Please try again "
        "shortly."
    ),
}


def friendly_llm_message(kind: str, *, all_exhausted: bool = False) -> str:
    """Map an `LLMError.kind` to the user-facing string.

    `all_exhausted=True` means every provider in the admin chain failed —
    surface a framing that points at the BYO option.
    """
    base = _FRIENDLY_LLM_MESSAGES.get(kind, _FRIENDLY_LLM_MESSAGES["unknown"])
    if not all_exhausted:
        return base
    if kind == "rate_limit":
        return (
            "All available AI models are rate-limited right now. Please "
            "try again in a few minutes, or add a personal LLM key in "
            "Customize to keep working."
        )
    if kind in ("service_unavailable", "connection", "timeout", "unknown"):
        return (
            "We couldn't reach any available AI model right now. Please "
            "try again shortly, or add a personal LLM key in Customize "
            "to keep working."
        )
    return base


@dataclass(frozen=True)
class LLMResolution:
    """Resolved call parameters — what to pass to `litellm.acompletion`.

    `base_url` and `api_version` are only populated for the BYO LLMConfig
    path; admin keys always use the provider's default endpoint.
    """
    model: str          # litellm-format, e.g. "gemini/gemini-1.5-flash"
    api_key: str
    provider: str       # short tag stored on Message.provider
    model_name: str     # bare model name stored on Message.model_name
    base_url: str | None = None
    api_version: str | None = None
    # True for admin-keyed resolutions (subject to fallback chain + quota),
    # False for BYO (final, no fallback or quota).
    is_admin: bool = True


_ADMIN_PROVIDERS = {"gemini", "groq", "openrouter", "cerebras"}


def resolve_admin(
    provider: str | None = None,
    model: str | None = None,
) -> LLMResolution:
    """Pick the admin API key + format the model string for litellm.

    Args:
      provider: override `settings.DEFAULT_PROVIDER` (case-insensitive).
      model:    override `settings.DEFAULT_MODEL`. Accepts either the bare
                model name (`gemini-1.5-flash`) or the litellm-prefixed
                form (`gemini/gemini-1.5-flash`); we normalize to the
                prefixed form here.

    Raises:
      LLMError on unsupported provider, missing admin key, or empty model.
    """
    settings = get_settings()
    provider = (provider or settings.DEFAULT_PROVIDER or "").lower()
    model = model or settings.DEFAULT_MODEL

    if provider not in _ADMIN_PROVIDERS:
        raise LLMError(
            f"Unsupported provider '{provider}'. "
            f"Admin providers: {sorted(_ADMIN_PROVIDERS)}.",
        )

    api_key_map = {
        "gemini": settings.GEMINI_API_KEY,
        "groq": settings.GROQ_API_KEY,
        "openrouter": settings.OPENROUTER_API_KEY,
        "cerebras": settings.CEREBRAS_API_KEY,
    }
    api_key = api_key_map[provider]
    if not api_key:
        raise LLMError(
            f"No admin API key configured for provider '{provider}'. "
            "Set the corresponding *_API_KEY in autobot.env.",
        )

    if not model:
        raise LLMError("DEFAULT_MODEL is empty — set it in autobot.env.")

    # `model` may be bare, provider-prefixed, or HF-style `org/name` —
    # only strip when the leading segment matches `{provider}/`. An
    # HF-style id like `meta-llama/llama-4-scout-17b` still needs the
    # provider tag prepended even though it contains a `/`.
    prefix = f"{provider}/"
    if model.startswith(prefix):
        litellm_model = model
        bare_model = model[len(prefix):]
    else:
        litellm_model = f"{prefix}{model}"
        bare_model = model

    return LLMResolution(
        model=litellm_model,
        api_key=api_key,
        provider=provider,
        model_name=bare_model,
    )


def resolve_admin_chain() -> list[LLMResolution]:
    """Return the ordered admin LLMResolutions to try for a chat turn.

    [0] is the primary (DEFAULT_PROVIDER + DEFAULT_MODEL); [1:] are
    fallbacks from `AUTOBOT_ADMIN_FALLBACKS`. Providers without an API
    key are silently skipped; duplicates are deduped. Returns [] only
    when nothing is configured — caller surfaces a 500-style error.
    """
    chain: list[LLMResolution] = []
    seen: set[str] = set()

    # If primary is unconfigured we still want to try fallbacks.
    try:
        primary = resolve_admin()
        chain.append(primary)
        seen.add(f"{primary.provider}|{primary.model_name}")
    except LLMError as e:
        logger.info("Primary admin resolution skipped: %s", e)

    settings = get_settings()
    fallback_str = (getattr(settings, "AUTOBOT_ADMIN_FALLBACKS", "") or "").strip()
    if not fallback_str:
        return chain

    for raw_entry in fallback_str.split(","):
        entry = raw_entry.strip()
        if not entry:
            continue
        if "/" not in entry:
            logger.warning(
                "Bad AUTOBOT_ADMIN_FALLBACKS entry (no '/'): %r — "
                "expected `provider/model`",
                entry,
            )
            continue
        provider_part, model_part = entry.split("/", 1)
        try:
            res = resolve_admin(provider=provider_part, model=model_part)
        except LLMError as e:
            logger.info(
                "Skipping fallback %s (%s)", entry, e,
            )
            continue
        key = f"{res.provider}|{res.model_name}"
        if key in seen:
            continue
        seen.add(key)
        chain.append(res)

    return chain


def resolve_from_llm_config(config: dict[str, Any]) -> LLMResolution:
    """Build an LLMResolution from a decrypted LLMConfig dict.

    The api_key never enters logs, caches, or any persisted object —
    only this dataclass holds it for the duration of the request.
    """
    provider = (config.get("provider") or "").lower().strip()
    model = (config.get("model_name") or "").strip()
    api_key = config.get("api_key") or ""
    base_url = (config.get("base_url") or "").strip() or None
    api_version = (config.get("api_version") or "").strip() or None

    if not provider:
        raise LLMError("LLMConfig has empty `provider`.")
    if not model:
        raise LLMError("LLMConfig has empty `model_name`.")
    if not api_key:
        raise LLMError(
            "LLMConfig has empty `api_key` — the reveal endpoint may "
            "have returned a masked serializer instead of the reveal one.",
        )

    # Same `{provider}/`-prefix handling as `resolve_admin` — HF-style
    # `org/name` models still need the provider tag prepended.
    prefix = f"{provider}/"
    if model.startswith(prefix):
        litellm_model = model
        bare_model = model[len(prefix):]
    else:
        litellm_model = f"{prefix}{model}"
        bare_model = model

    return LLMResolution(
        model=litellm_model,
        api_key=api_key,
        provider=provider,
        model_name=bare_model,
        base_url=base_url,
        api_version=api_version,
        is_admin=False,
    )


async def resolve_for_thread(
    *,
    jwt: str,
    thread: dict[str, Any],
    user_settings: dict[str, Any] | None,
) -> list[LLMResolution]:
    """Pick the LLM resolution(s) to try for a chat turn.

    Priority:
      1. `thread.llm_config` (BYO, per-thread override)
      2. `user_settings.default_llm_config` (BYO, per-user default)
      3. Admin keys + AUTOBOT_ADMIN_FALLBACKS chain

    BYO returns a one-element list (no fallback for user choice). The
    plaintext api_key lives only in the returned LLMResolution and is
    GC'd when it goes out of scope — never logged or cached.

    If the BYO reveal call fails (network, 4xx, 5xx, malformed config),
    we fall back to the admin chain. A stale FK shouldn't break chat.
    """
    # Imported here to avoid a circular import:
    # llm.client → conversation.persistence → settings → llm.client.
    from conversation.persistence import DjangoUnavailable, get_django_client

    config_id = (
        thread.get("llm_config")
        or (user_settings or {}).get("default_llm_config")
    )
    if not config_id:
        return resolve_admin_chain()

    django = get_django_client()
    try:
        status_code, body = await django.request(
            method="POST",
            path=f"/api/autobot/llm-configs/{config_id}/reveal/",
            jwt=jwt,
        )
    except DjangoUnavailable as e:
        logger.warning(
            "LLMConfig reveal unreachable for id=%s (%s); using admin fallback",
            config_id, e,
        )
        return resolve_admin_chain()

    if status_code != 200:
        logger.warning(
            "LLMConfig reveal returned HTTP %d for id=%s; using admin fallback",
            status_code, config_id,
        )
        return resolve_admin_chain()

    config = (body or {}).get("data") or {}
    try:
        resolution = resolve_from_llm_config(config)
    except LLMError as e:
        logger.warning(
            "LLMConfig %s is malformed (%s); using admin fallback",
            config_id, e,
        )
        return resolve_admin_chain()

    logger.info(
        "Using user LLMConfig %s (provider=%s, model=%s)",
        config_id, resolution.provider, resolution.model_name,
    )
    return [resolution]


async def acomplete(
    messages: list[dict[str, Any]],
    resolution: LLMResolution,
    *,
    temperature: float = 0.7,
) -> dict[str, Any]:
    """Call the LLM and return a normalized dict.

    Returns:
      {
        "content": str,            # the assistant's reply
        "provider": str,           # short tag, e.g. "gemini"
        "model_name": str,         # bare model name, e.g. "gemini-1.5-flash"
        "prompt_tokens": int,
        "completion_tokens": int,
        "total_tokens": int,
      }

    Raises:
      LLMError on any provider-side or transport failure. The exception
      message is safe to surface in logs but should NOT be returned to
      the client verbatim (it may name the provider).
    """
    completion_kwargs: dict[str, Any] = {
        "model": resolution.model,
        "messages": messages,
        "api_key": resolution.api_key,
        "temperature": temperature,
        "stream": False,
    }
    if resolution.base_url:
        completion_kwargs["api_base"] = resolution.base_url
    if resolution.api_version:
        completion_kwargs["api_version"] = resolution.api_version

    try:
        response = await litellm.acompletion(**completion_kwargs)
    except Exception as e:
        # litellm raises provider-specific subclasses; catch broad and
        # let `_wrap_litellm_error` tag retryable variants.
        logger.exception(
            "LLM call failed: provider=%s model=%s err_type=%s",
            resolution.provider, resolution.model_name, type(e).__name__,
        )
        raise _wrap_litellm_error(e) from e

    try:
        content = response.choices[0].message.content or ""
    except (AttributeError, IndexError, TypeError) as e:
        logger.error(
            "Unexpected LLM response shape: provider=%s model=%s err=%s",
            resolution.provider, resolution.model_name, e,
        )
        raise LLMError("LLM returned an unexpected response shape.") from e

    usage = getattr(response, "usage", None)
    return {
        "content": content,
        "provider": resolution.provider,
        "model_name": resolution.model_name,
        "prompt_tokens": int(getattr(usage, "prompt_tokens", 0) or 0),
        "completion_tokens": int(getattr(usage, "completion_tokens", 0) or 0),
        "total_tokens": int(getattr(usage, "total_tokens", 0) or 0),
    }


async def astream_complete(
    messages: list[dict[str, Any]],
    resolution: LLMResolution,
    *,
    temperature: float = 0.7,
    tools: list[dict[str, Any]] | None = None,
) -> AsyncIterator[tuple[str, Any]]:
    """Stream the LLM's reply chunk-by-chunk, with optional tool support.

    Yields ``("token", str)`` for each text delta, then exactly one
    ``("done", dict)`` at the end with content, tool_calls, and usage.

    Tool-call arguments arrive piece-by-piece across chunks on some
    providers; we accumulate by `index` (carried on every chunk) since
    `id` may arrive on a later chunk than the args delta.
    """
    full_content: list[str] = []
    usage_obj: Any = None
    tool_calls_by_index: dict[int, dict[str, Any]] = {}

    completion_kwargs: dict[str, Any] = {
        "model": resolution.model,
        "messages": messages,
        "api_key": resolution.api_key,
        "temperature": temperature,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    if resolution.base_url:
        completion_kwargs["api_base"] = resolution.base_url
    if resolution.api_version:
        completion_kwargs["api_version"] = resolution.api_version
    if tools:
        completion_kwargs["tools"] = tools
        # Explicit "auto" because the default is provider-dependent.
        completion_kwargs["tool_choice"] = "auto"

    try:
        stream = await litellm.acompletion(**completion_kwargs)
    except Exception as e:
        # Open-time failure — no tokens yielded yet, so a fallback
        # provider can pick up cleanly.
        logger.exception(
            "LLM stream open failed: provider=%s model=%s err_type=%s",
            resolution.provider, resolution.model_name, type(e).__name__,
        )
        raise _wrap_litellm_error(e) from e

    # Defer the raise-vs-salvage decision until after full iteration so
    # we know whether ANY output was accumulated.
    salvaged_error: LLMError | None = None
    try:
        async for chunk in stream:
            # Usage-only chunks may have no `choices`; guard with try/except.
            try:
                delta = chunk.choices[0].delta
            except (AttributeError, IndexError, TypeError):
                delta = None

            if delta is not None:
                piece = getattr(delta, "content", None)
                if piece:
                    full_content.append(piece)
                    yield ("token", piece)

                delta_tool_calls = getattr(delta, "tool_calls", None) or []
                for tc in delta_tool_calls:
                    idx = getattr(tc, "index", None)
                    if idx is None:
                        idx = len(tool_calls_by_index)
                    # Seed with a synthetic id so we ALWAYS have a non-empty `id`.
                    # Groq's llama-4-scout emits tool_call deltas without an `id`;
                    # the OpenAI protocol then rejects the follow-up `role: "tool"`
                    # message with "Missing tool_call_id". Providers that DO send
                    # an `id` (Gemini, OpenAI, most OpenRouter) overwrite below.
                    entry = tool_calls_by_index.setdefault(idx, {
                        "id": f"call_{uuid.uuid4().hex[:24]}",
                        "type": "function",
                        "function": {"name": "", "arguments": ""},
                    })
                    if getattr(tc, "id", None):
                        entry["id"] = tc.id
                    fn = getattr(tc, "function", None)
                    if fn is not None:
                        name_piece = getattr(fn, "name", None) or ""
                        args_piece = getattr(fn, "arguments", None) or ""
                        if name_piece:
                            entry["function"]["name"] += name_piece
                        if args_piece:
                            entry["function"]["arguments"] += args_piece

            # Usage rides on the last chunk when include_usage=True.
            chunk_usage = getattr(chunk, "usage", None)
            if chunk_usage is not None:
                usage_obj = chunk_usage
    except Exception as e:
        # Most common real-world trigger: litellm 1.55.x's Databricks-
        # shared chunk parser crashing on the final usage-only chunk
        # that Groq emits — `choices: []` is valid OpenAI protocol but
        # the parser indexes `choices[0]` without a guard.
        salvaged_error = _wrap_litellm_error(e)
        logger.warning(
            "LLM stream interrupted mid-flight (provider=%s model=%s "
            "err_type=%s): %s",
            resolution.provider, resolution.model_name,
            type(e).__name__, salvaged_error,
        )

    tool_calls_list = [
        tool_calls_by_index[i]
        for i in sorted(tool_calls_by_index.keys())
        if tool_calls_by_index[i]["function"]["name"]  # drop empties
    ]

    # Salvage policy:
    #   • Error + accumulated output → synthesize a `done` event so the
    #     chat loop persists what we have. Token counts will be 0.
    #   • Error + no output → propagate so caller can fall back or surface.
    has_output = bool(full_content) or bool(tool_calls_list)
    if salvaged_error is not None and not has_output:
        raise salvaged_error
    if salvaged_error is not None:
        logger.warning(
            "Salvaging partial LLM output: provider=%s model=%s "
            "tokens=%d tool_calls=%d (orig err: %s)",
            resolution.provider, resolution.model_name,
            len(full_content), len(tool_calls_list), salvaged_error,
        )

    yield (
        "done",
        {
            "content": "".join(full_content),
            "tool_calls": tool_calls_list,
            "provider": resolution.provider,
            "model_name": resolution.model_name,
            "prompt_tokens": int(getattr(usage_obj, "prompt_tokens", 0) or 0),
            "completion_tokens": int(
                getattr(usage_obj, "completion_tokens", 0) or 0,
            ),
            "total_tokens": int(getattr(usage_obj, "total_tokens", 0) or 0),
        },
    )
