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
        logger.exception(
            "LLM stream open failed: provider=%s model=%s err_type=%s",
            resolution.provider, resolution.model_name, type(e).__name__,
        )
        raise LLMError(str(e)) from e

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
                    entry = tool_calls_by_index.setdefault(idx, {
                        "id": None,
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
        logger.exception(
            "LLM stream broken mid-flight: provider=%s model=%s err_type=%s",
            resolution.provider, resolution.model_name, type(e).__name__,
        )
        raise LLMError(str(e)) from e

    # Order tool calls by their original index — keeps the OpenAI
    # tool-call array order stable for downstream consumers (and the
    # frontend, when it renders the inline "Working: ..." badges).
    tool_calls_list = [
        tool_calls_by_index[i]
        for i in sorted(tool_calls_by_index.keys())
        if tool_calls_by_index[i]["function"]["name"]  # drop empties
    ]

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
