"""LiteLLM client wrapper for autobot.

Thin layer over `litellm.acompletion`. Two responsibilities:

  1. Resolve provider/model/api_key:
     pull `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` from
     settings based on `DEFAULT_PROVIDER` (or an explicit override).
     T17 will add BYO via `LLMConfig` (one /reveal/ round-trip per request).

  2. Normalize the LiteLLM response shape into a plain dict the chat
     router can persist verbatim — keeps every call site free of litellm
     object access.

No streaming, no tools yet. T13 adds streaming; T14 adds tool dispatch.
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
# provider (T18a). RateLimitError + ServiceUnavailableError + APIConnection
# are transient. Timeout is usually transient too. We deliberately do
# NOT include BadRequestError / AuthenticationError / ContextWindowExceeded
# in this set — those reflect the request itself being broken, and a
# fallback provider would reject for the same reason.
_RETRYABLE_LITELLM_ERRORS: tuple[type[Exception], ...] = tuple(
    cls for cls in (
        getattr(litellm, "RateLimitError", None),
        getattr(litellm, "ServiceUnavailableError", None),
        getattr(litellm, "APIConnectionError", None),
        getattr(litellm, "Timeout", None),
    ) if cls is not None
)


# Mapping from litellm exception class → our friendly `kind` discriminator.
# Order matters: more-specific classes first (ContextWindowExceeded is a
# subclass of BadRequest on some litellm versions, so check it first).
def _kind_for(e: Exception) -> str:
    """Classify a litellm exception into a friendly-message bucket.

    The chat router maps each bucket to a user-facing string via
    `friendly_llm_message()` — we deliberately don't expose the raw
    provider error to the UI (it can leak provider names, api keys
    in stack traces, internal model ids, etc.).
    """
    # Most specific first.
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
    """Convert a litellm exception to our LLMError, tagging it
    retryable if the underlying class is in the safe-to-retry set,
    and stamping a friendly-message kind for the UI."""
    retryable = isinstance(e, _RETRYABLE_LITELLM_ERRORS)
    return LLMError(str(e), retryable=retryable, kind=_kind_for(e))


logger = logging.getLogger(__name__)

# Quiet litellm's default chatty INFO logs and disable telemetry. Tokens
# could end up in DEBUG dumps; safer to silence unless explicitly raised.
litellm.telemetry = False
litellm.suppress_debug_info = True


class LLMError(Exception):
    """Surfaces any provider-side or configuration error to the caller.

    `retryable=True` flags errors that another provider might survive
    (rate limits, connection drops, 503s). The chat router uses this to
    decide whether to try the next admin fallback (T18a). `False` —
    the default — is for errors where retrying gains nothing (bad
    request, auth failure, context overflow, malformed config).

    `kind` is the friendly-message discriminator: one of
    `rate_limit | service_unavailable | context_overflow |
    content_policy | auth | bad_request | connection | timeout |
    unknown`. The chat router maps it to a user-facing string via
    `friendly_llm_message()` so the UI never sees a raw provider error.
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


# Friendly message table — what the UI ACTUALLY shows for each kind.
# Keep these short, neutral, and free of provider names. The raw
# provider error is logged server-side only (operators grep it).
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

    `all_exhausted=True` means every provider in the admin chain failed
    — the user has hit a hard wall and retrying immediately won't help.
    We surface a slightly different framing for that case so the UI
    can offer the "add a personal LLM key" escape hatch.
    """
    base = _FRIENDLY_LLM_MESSAGES.get(kind, _FRIENDLY_LLM_MESSAGES["unknown"])
    if not all_exhausted:
        return base
    # All admin providers down → tell the user the fallbacks didn't help
    # and point at the BYO option. Friendly framings per-kind:
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
    # context_overflow / content_policy / auth / bad_request → the same
    # underlying message applies no matter how many providers we tried;
    # appending the BYO hint is overkill for these.
    return base


@dataclass(frozen=True)
class LLMResolution:
    """Resolved call parameters — what to pass to `litellm.acompletion`.

    `base_url` and `api_version` are optional — only populated when the
    LLM came from an `LLMConfig` row (T17 BYO path), since admin keys
    always use the provider's default endpoint and api version. They
    cover three real cases:
      • Azure OpenAI deployments (api_version required, base_url is
        the resource endpoint).
      • Self-hosted OpenAI-compatible inference (Ollama, vLLM, etc.)
        — base_url points at the local server.
      • Provider proxies (e.g. an internal AWS Bedrock gateway).
    """
    model: str          # litellm-format, e.g. "gemini/gemini-1.5-flash"
    api_key: str
    provider: str       # short tag stored on Message.provider, e.g. "gemini"
    model_name: str     # bare model name stored on Message.model_name
    base_url: str | None = None      # api_base override
    api_version: str | None = None   # required for Azure
    # T18a: `True` for admin-keyed resolutions (subject to fallback
    # chain + per-user daily quota), `False` for BYO (LLMConfig). The
    # chat router branches on this flag for both decisions.
    is_admin: bool = True


# LiteLLM dispatches by the `provider/` prefix on the model string. We
# don't add new providers without also wiring an API-key field in settings.
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

    # Normalize so the litellm call always sees `provider/model`.
    # `model` may arrive in three shapes:
    #   • "gemini-1.5-flash"             — bare model, prepend provider
    #   • "gemini/gemini-1.5-flash"      — already provider-prefixed
    #   • "meta-llama/llama-4-scout-17b" — HF-style `org/name` model
    #                                       (common on Groq + OpenRouter);
    #                                       the `/` is NOT a provider tag,
    #                                       still needs `groq/` prepended
    # Only treat a leading `{provider}/` segment as the prefix; anything
    # else (including org/name models) gets the provider tag added.
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
    """Return the ordered admin LLMResolutions to try for a chat turn (T18a).

    [0] is the primary (DEFAULT_PROVIDER + DEFAULT_MODEL).
    [1:] are fallbacks parsed from `AUTOBOT_ADMIN_FALLBACKS` env, in
    declared order. Entries are `provider/model` strings (e.g.
    `groq/llama-3.1-70b-versatile`). Empty fallback env → list of just
    the primary. Empty list returned only when no provider is
    configured at all — caller surfaces a 500-style error.

    Providers with no API key configured (e.g. listed in the fallback
    chain but missing `GROQ_API_KEY`) are SKIPPED silently — the chain
    only contains usable resolutions.

    Duplicate `provider|model` pairs across the chain are deduped so a
    misconfigured fallback that re-lists the primary doesn't burn an
    extra round of retry attempts.
    """
    chain: list[LLMResolution] = []
    seen: set[str] = set()

    # Primary — exception swallowed; if primary is unconfigured, we
    # still want to try fallbacks. If everything's empty, return [].
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
    """Build an LLMResolution from a decrypted LLMConfig dict (T17).

    `config` is the response of `POST /api/autobot/llm-configs/<id>/reveal/`'s
    `data` field — it carries the plaintext `api_key` alongside the
    provider/model/base_url/api_version. The api_key never enters logs,
    caches, or any persisted object — only this dataclass holds it for
    the duration of the request.

    Raises:
      LLMError on a malformed config (missing provider / model / key).
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

    # Same shape-handling as `resolve_admin`. Only strip the
    # `{provider}/` prefix when it's actually present — HF-style
    # `org/name` models (e.g. "meta-llama/llama-4-scout-17b-16e-instruct"
    # on Groq) must still get `groq/` prepended; they aren't "already
    # prefixed" just because they contain a `/`.
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
        # BYO: never subject to admin fallback chain or per-user quota.
        is_admin=False,
    )


async def resolve_for_thread(
    *,
    jwt: str,
    thread: dict[str, Any],
    user_settings: dict[str, Any] | None,
) -> list[LLMResolution]:
    """Pick the LLM resolution(s) to try for a chat turn (T17 + T18a).

    Priority for selecting the path:
      1. `thread.llm_config`              — per-thread override (BYO)
      2. `user_settings.default_llm_config` — per-user default (BYO)
      3. Admin keys + AUTOBOT_ADMIN_FALLBACKS chain

    Return shape:
      • BYO path → single-element list `[byo_resolution]`. The user's
        choice is final; we never silently switch them to a different
        provider.
      • Admin path → `[primary, *fallbacks]` from `resolve_admin_chain()`.
        Caller tries each in order on retryable errors (round 1 only).

    For BYO, this function makes ONE extra Django call to the reveal
    endpoint to fetch the decrypted api_key. The plaintext lives only
    in the returned `LLMResolution` and is GC'd when that goes out of
    scope. Never logged. Never cached.

    Failure handling: if the BYO reveal call fails (network, 4xx, 5xx,
    or malformed config), we log a warning and fall back to the ADMIN
    CHAIN. The user's chat still works — they just don't get billed
    against their personal key for this turn. A noisy failure would be
    worse (one stale FK shouldn't break chat).
    """
    # Imported here, not at module top, to avoid a circular import:
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
    # BYO returns a one-element list — no fallback for user choice.
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
        # Catch broad — litellm raises a zoo of provider-specific subclasses.
        # `_wrap_litellm_error` tags retryable variants so the chat
        # router can decide whether to try a fallback admin provider
        # (T18a). Log the type so an operator can grep, but don't log
        # the api_key.
        logger.exception(
            "LLM call failed: provider=%s model=%s err_type=%s",
            resolution.provider, resolution.model_name, type(e).__name__,
        )
        raise _wrap_litellm_error(e) from e

    # LiteLLM normalizes everything to the OpenAI ChatCompletion shape, so
    # `choices[0].message.content` and `usage.*` are stable across providers.
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

    Yields ``(kind, payload)`` tuples:

      • ``("token", str)`` — a text delta as it arrives. Concatenating
        all deltas in order produces the full assistant reply.
      • ``("done", dict)`` — emitted exactly once at the end:
          ``{
              "content":           str,    # concatenated content
              "tool_calls":        list,   # may be empty
              "provider":          str,
              "model_name":        str,
              "prompt_tokens":     int,
              "completion_tokens": int,
              "total_tokens":      int,
          }``
        `tool_calls` is the assembled list of function calls the model
        wants invoked, normalized to OpenAI's tool-call shape:
          ``[{"id": "call_...", "type": "function",
              "function": {"name": "...", "arguments": "<json-string>"}}]``
        Empty list means the model returned a normal text reply and the
        chat loop should exit.

    Provider quirks:
      • Some providers stream tool-call arguments piece-by-piece across
        chunks. We accumulate by `index` (the field every chunk carries)
        and concatenate strings. The final dict is what OpenAI's
        non-streaming `acompletion()` would have returned in one shot.
      • `stream_options={"include_usage": True}` asks for usage on the
        last chunk. Providers that ignore the flag give us 0s — the
        caller still persists harmlessly.

    Raises:
      LLMError on any provider-side or transport failure. If the stream
      breaks mid-flight, the caller should `yield` an `event: error`
      SSE frame.
    """
    full_content: list[str] = []
    usage_obj: Any = None
    # tool-call accumulator, keyed by the provider's `index` field
    # because `id` may arrive on a later chunk than the args delta.
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
        # `auto` lets the model choose between text reply and tool call
        # turn-by-turn. Forcing "required" would make even simple
        # questions trigger a tool. Default is provider-dependent, so
        # set it explicitly for parity.
        completion_kwargs["tool_choice"] = "auto"

    try:
        stream = await litellm.acompletion(**completion_kwargs)
    except Exception as e:
        # OPEN-time failure — the stream never started, so a fallback
        # provider could pick up cleanly. Tag retryable so the chat
        # router knows it's safe to try the next entry in the chain
        # (no tokens have been yielded yet, no client-side state to
        # corrupt). T18a.
        logger.exception(
            "LLM stream open failed: provider=%s model=%s err_type=%s",
            resolution.provider, resolution.model_name, type(e).__name__,
        )
        raise _wrap_litellm_error(e) from e

    # `salvaged_error` defers the decision of whether to raise or
    # salvage until AFTER we've fully iterated the stream and know
    # whether any output (content OR tool_calls) was accumulated.
    salvaged_error: LLMError | None = None
    try:
        async for chunk in stream:
            # Per-chunk delta. Usage-only chunks usually have no
            # `choices`; guard with try/except so they don't blow up.
            try:
                delta = chunk.choices[0].delta
            except (AttributeError, IndexError, TypeError):
                delta = None

            if delta is not None:
                piece = getattr(delta, "content", None)
                if piece:
                    full_content.append(piece)
                    yield ("token", piece)

                # Streamed tool-call fragments. Each fragment looks like:
                #   { index: 0, id: "call_abc", type: "function",
                #     function: { name: "create_script", arguments: "{\"" } }
                # Subsequent fragments at the same `index` carry more
                # `arguments` text to append.
                delta_tool_calls = getattr(delta, "tool_calls", None) or []
                for tc in delta_tool_calls:
                    idx = getattr(tc, "index", None)
                    if idx is None:
                        # Provider didn't supply an index — fall back
                        # to len() so we still accumulate something.
                        idx = len(tool_calls_by_index)
                    # Seed with a synthetic id so we ALWAYS have a non-empty
                    # `id`. Some providers (notably Groq's
                    # meta-llama/llama-4-scout-17b-16e-instruct) emit
                    # tool_call deltas without an `id` at all — the OpenAI
                    # protocol then rejects the follow-up `role: "tool"`
                    # message with "Missing tool_call_id" because it has
                    # nothing to bind to. Providers that DO send an `id`
                    # (Gemini, OpenAI, most OpenRouter models) overwrite
                    # the synthetic on the next line.
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
        # Mid-stream failure. The most common real-world trigger is
        # litellm 1.55.x's Databricks-shared chunk parser crashing on
        # the final usage-only chunk that Groq (and other OpenAI-
        # compatible providers) emit — `choices: []` is valid OpenAI
        # protocol but the parser indexes `choices[0]` without a guard.
        # The decision (raise vs salvage) is deferred to after this
        # block so we have the full accumulated-state picture.
        salvaged_error = _wrap_litellm_error(e)
        logger.warning(
            "LLM stream interrupted mid-flight (provider=%s model=%s "
            "err_type=%s): %s",
            resolution.provider, resolution.model_name,
            type(e).__name__, salvaged_error,
        )

    # Order tool calls by their original index — keeps the OpenAI
    # tool-call array order stable for downstream consumers (and the
    # frontend, when it renders the inline "Working: ..." badges).
    tool_calls_list = [
        tool_calls_by_index[i]
        for i in sorted(tool_calls_by_index.keys())
        if tool_calls_by_index[i]["function"]["name"]  # drop empties
    ]

    # Salvage policy:
    #   • Error + ANY accumulated output (content OR tool_calls)
    #     → yield a synthesized `done` event. The caller never sees
    #       the error; the chat loop persists what we have and
    #       continues normally. Token counts will be 0 because the
    #       usage chunk is what failed in most of these scenarios.
    #   • Error + NO accumulated output
    #     → propagate the error normally so the caller can either
    #       fall back to another provider (T18a) or surface
    #       `event: error` to the client.
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
