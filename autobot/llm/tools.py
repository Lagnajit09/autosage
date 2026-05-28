"""Tool registry + dispatcher for autobot (T14).

Tools are how the LLM acts on the world. Each tool is a Python coroutine
that takes JSON-serializable arguments + the caller's Clerk JWT, and
returns a plain dict. The dict is JSON-encoded and fed back to the LLM
as the content of a ``role: "tool"`` message.

Design rules:

  • Registration is process-global. Tool modules (e.g. `tools/scripts.py`)
    call `register_tool()` at import time; importing `tools/__init__.py`
    once at app startup is enough to wire everything.
  • Schemas follow the OpenAI/LiteLLM function-calling JSON Schema
    convention. LiteLLM forwards them verbatim to the provider — Gemini,
    Groq (OpenAI-compat), OpenAI, etc. all accept this shape.
  • Per-tool timeout (configurable, default 30s) bounds runaway calls.
  • Errors are normalized to ``{"error": "<short message>"}`` so the LLM
    sees a clean failure signal and can decide to retry, ask the user,
    or apologize — instead of choking on an exception traceback.
  • The dispatcher NEVER raises — every code path returns a dict the
    chat router can hand straight to the LLM.

Security:

  • Tools must NOT trust their own arguments to authorize actions. Every
    tool that hits Django forwards the caller's JWT; Django enforces
    per-user scoping via its existing `IsAuthenticated` + queryset
    filtering. Autobot does no authorization checks here.
  • Tools must NOT log secret values. JWT is never echoed back into
    return dicts. Tool wrappers exist to call Django's public REST
    surface — anything sensitive (credential reveals) is left out
    of T14's tool inventory.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

# Type alias for a tool handler. Receives the parsed args dict plus the
# caller's raw JWT (so the handler can forward it to Django). Returns a
# JSON-serializable result; the dispatcher serializes it for the LLM.
ToolHandler = Callable[[dict[str, Any], str], Awaitable[Any]]


@dataclass(frozen=True)
class ToolDefinition:
    """Everything the dispatcher needs to run one tool."""
    name: str
    description: str
    parameters_schema: dict[str, Any]
    handler: ToolHandler
    timeout_seconds: float = 30.0


# Module-global registry. Populated at import time when `tools/*.py`
# modules call `register_tool()`. Read by `get_tool_schemas()` and
# `dispatch_tool()` on every chat turn.
_REGISTRY: dict[str, ToolDefinition] = {}


def register_tool(definition: ToolDefinition) -> None:
    """Add a tool to the global registry. Overwrites on name collision —
    useful for hot-reload during dev, harmless in prod where the name
    space is curated by the maintainers.
    """
    if definition.name in _REGISTRY:
        logger.info("Tool '%s' re-registered (overwrite)", definition.name)
    _REGISTRY[definition.name] = definition


def get_tool_schemas() -> list[dict[str, Any]]:
    """Build the `tools=` payload for `litellm.acompletion()`.

    Empty list ⇒ no tools advertised to the LLM (and the LLM won't
    attempt any function call). The chat router can swap this for a
    subset later (e.g. only `create_script` for the AIScriptGenerator
    quick-action endpoint).
    """
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters_schema,
            },
        }
        for t in _REGISTRY.values()
    ]


def list_tool_names() -> list[str]:
    """Debug / startup-logging helper."""
    return sorted(_REGISTRY.keys())


async def dispatch_tool(
    name: str,
    args_json: str,
    jwt: str,
) -> dict[str, Any]:
    """Execute one tool call. Always returns a dict — never raises.

    ``args_json`` is the raw string the LLM emitted as the function
    call arguments. LiteLLM passes it through unmodified (it's whatever
    the provider serialized — usually JSON). Empty string is treated
    as `{}`.

    Failure modes folded into ``{"error": "..."}``:
      • Unknown tool name
      • Malformed JSON arguments
      • Tool timed out
      • Tool raised any exception
      • Tool returned a non-JSON-serializable value
    """
    tool = _REGISTRY.get(name)
    if tool is None:
        return {"error": f"Unknown tool: '{name}'."}

    try:
        args = json.loads(args_json) if args_json else {}
    except json.JSONDecodeError as e:
        return {"error": f"Invalid tool arguments JSON: {e.msg}"}
    if not isinstance(args, dict):
        return {"error": "Tool arguments must be a JSON object."}

    try:
        result = await asyncio.wait_for(
            tool.handler(args, jwt),
            timeout=tool.timeout_seconds,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "Tool '%s' timed out after %.1fs", name, tool.timeout_seconds,
        )
        return {
            "error": (
                f"Tool '{name}' timed out after "
                f"{tool.timeout_seconds:.0f}s. Try again or simplify the request."
            ),
        }
    except Exception as e:
        # Last-resort net for handler bugs. Don't leak stack traces to
        # the LLM (it would just confuse the model); log fully so the
        # operator can grep.
        logger.exception("Tool '%s' raised", name)
        return {"error": f"Tool '{name}' failed: {type(e).__name__}: {e}"}

    # Sanity-check the result is serializable. If not, downgrade to
    # an error string the LLM can act on.
    try:
        json.dumps(result, default=str)
    except (TypeError, ValueError) as e:
        logger.error("Tool '%s' returned non-serializable result: %s", name, e)
        return {"error": f"Tool '{name}' returned an invalid result shape."}

    return result if isinstance(result, dict) else {"data": result}
