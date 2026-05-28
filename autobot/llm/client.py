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
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import litellm

from settings import get_settings

logger = logging.getLogger(__name__)

# Quiet litellm's default chatty INFO logs and disable telemetry. Tokens
# could end up in DEBUG dumps; safer to silence unless explicitly raised.
litellm.telemetry = False
litellm.suppress_debug_info = True


class LLMError(Exception):
    """Surfaces any provider-side or configuration error to the caller."""


@dataclass(frozen=True)
class LLMResolution:
    """Resolved call parameters — what to pass to `litellm.acompletion`."""
    model: str          # litellm-format, e.g. "gemini/gemini-1.5-flash"
    api_key: str
    provider: str       # short tag stored on Message.provider, e.g. "gemini"
    model_name: str     # bare model name stored on Message.model_name


# LiteLLM dispatches by the `provider/` prefix on the model string. We
# don't add new providers without also wiring an API-key field in settings.
_ADMIN_PROVIDERS = {"gemini", "groq", "openrouter"}


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
    if "/" in model:
        # Already prefixed (e.g. "gemini/gemini-1.5-flash") — trust it.
        litellm_model = model
        bare_model = model.split("/", 1)[1]
    else:
        litellm_model = f"{provider}/{model}"
        bare_model = model

    return LLMResolution(
        model=litellm_model,
        api_key=api_key,
        provider=provider,
        model_name=bare_model,
    )


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
    try:
        response = await litellm.acompletion(
            model=resolution.model,
            messages=messages,
            api_key=resolution.api_key,
            temperature=temperature,
            stream=False,
        )
    except Exception as e:
        # Catch broad — litellm raises a zoo of provider-specific subclasses
        # (RateLimitError, AuthenticationError, APIConnectionError, …) and
        # the caller only needs to know "the call failed". Log the type so
        # an operator can grep, but don't log the api_key (litellm doesn't
        # echo it in __repr__, but be defensive).
        logger.exception(
            "LLM call failed: provider=%s model=%s err_type=%s",
            resolution.provider, resolution.model_name, type(e).__name__,
        )
        raise LLMError(str(e)) from e

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
) -> AsyncIterator[tuple[str, Any]]:
    """Stream the LLM's reply chunk-by-chunk.

    Yields ``(kind, payload)`` tuples:

      • ``("token", str)`` — a text delta as it arrives. Concatenating
        all deltas in order produces the full assistant reply.
      • ``("done", dict)`` — emitted exactly once at the end with the
        same shape as `acomplete()`'s return value:
          ``{content, provider, model_name, prompt_tokens, completion_tokens, total_tokens}``
        The caller persists this dict; the running accumulation of
        `content` lets the caller render to the browser even if the
        provider doesn't echo it back on the final chunk.

    `stream_options={"include_usage": True}` asks the provider to attach
    usage on the LAST chunk. Gemini, Groq (OpenAI-compat), and OpenAI
    all support this; providers that ignore the flag will give us
    `prompt_tokens=0` etc., which the caller still persists harmlessly.

    Raises:
      LLMError on any provider-side or transport failure. If the stream
      breaks mid-flight, this propagates — the caller should `yield`
      an `event: error` SSE frame to the browser.
    """
    full_content: list[str] = []
    usage_obj: Any = None

    try:
        stream = await litellm.acompletion(
            model=resolution.model,
            messages=messages,
            api_key=resolution.api_key,
            temperature=temperature,
            stream=True,
            stream_options={"include_usage": True},
        )
    except Exception as e:
        logger.exception(
            "LLM stream open failed: provider=%s model=%s err_type=%s",
            resolution.provider, resolution.model_name, type(e).__name__,
        )
        raise LLMError(str(e)) from e

    try:
        async for chunk in stream:
            # Per-chunk content delta. The final usage chunk usually
            # has no `choices`, so guard with try/except.
            try:
                delta = chunk.choices[0].delta
                piece = getattr(delta, "content", None)
            except (AttributeError, IndexError, TypeError):
                piece = None
            if piece:
                full_content.append(piece)
                yield ("token", piece)

            # Usage rides on the last chunk when include_usage=True.
            chunk_usage = getattr(chunk, "usage", None)
            if chunk_usage is not None:
                usage_obj = chunk_usage
    except Exception as e:
        logger.exception(
            "LLM stream broken mid-flight: provider=%s model=%s err_type=%s",
            resolution.provider, resolution.model_name, type(e).__name__,
        )
        raise LLMError(str(e)) from e

    yield (
        "done",
        {
            "content": "".join(full_content),
            "provider": resolution.provider,
            "model_name": resolution.model_name,
            "prompt_tokens": int(getattr(usage_obj, "prompt_tokens", 0) or 0),
            "completion_tokens": int(
                getattr(usage_obj, "completion_tokens", 0) or 0,
            ),
            "total_tokens": int(getattr(usage_obj, "total_tokens", 0) or 0),
        },
    )
