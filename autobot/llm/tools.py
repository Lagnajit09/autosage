"""Tool registry + dispatcher.

Tools are Python coroutines that take JSON-serializable args + the
caller's Clerk JWT and return a plain dict. Errors are normalized to
``{"error": "..."}`` — the dispatcher never raises.

Tool authorization is Django's responsibility: tools forward the JWT and
Django enforces per-user scoping. Autobot does no authorization checks.
"""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

ToolHandler = Callable[[dict[str, Any], str], Awaitable[Any]]


@dataclass(frozen=True)
class ToolContext:
    """Per-call context a handler may need beyond its args + JWT.

    Threaded through a ContextVar (not the handler signature) so the
    `handler(args, jwt)` contract stays unchanged for the ~all tools that
    don't need it. Only the execution write tools (X10+) read it: they
    need `user_sub` for the exec quota and `tool_call_id` as the
    Idempotency-Key so a double-call in one LLM turn collapses to one run.
    """
    user_sub: str = ""
    tool_call_id: str = ""


# Set inside `dispatch_tool` for the duration of one handler invocation.
# Dispatch is serial (see routers/chat.py), and a ContextVar is per-task
# anyway, so reads inside the handler always see this call's context.
_TOOL_CONTEXT: contextvars.ContextVar[ToolContext] = contextvars.ContextVar(
    "autobot_tool_context", default=ToolContext(),
)


def current_tool_context() -> ToolContext:
    """The context for the in-flight tool call (empty default off-dispatch)."""
    return _TOOL_CONTEXT.get()


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    parameters_schema: dict[str, Any]
    handler: ToolHandler
    timeout_seconds: float = 30.0


_REGISTRY: dict[str, ToolDefinition] = {}


def register_tool(definition: ToolDefinition) -> None:
    if definition.name in _REGISTRY:
        logger.info("Tool '%s' re-registered (overwrite)", definition.name)
    _REGISTRY[definition.name] = definition


def get_tool_schemas(
    allowed_names: frozenset[str] | set[str] | None = None,
) -> list[dict[str, Any]]:
    """Build the `tools=` payload for `litellm.acompletion()`.

    `allowed_names` filters the registry — used by surface-specific
    panels (ScriptEditor sees only script tools, etc.). Filtering at
    the LLM API layer is the real guard: a tool not in the payload
    isn't callable regardless of what the system prompt says.
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
        if allowed_names is None or t.name in allowed_names
    ]


def list_tool_names() -> list[str]:
    return sorted(_REGISTRY.keys())


async def dispatch_tool(
    name: str,
    args_json: str,
    jwt: str,
    *,
    allowed_names: frozenset[str] | set[str] | None = None,
    context: ToolContext | None = None,
) -> dict[str, Any]:
    """Execute one tool call. Always returns a dict — never raises.

    `allowed_names` re-checks the panel allow-list as a hard floor: even
    if the LLM hallucinates a tool name not in the advertised set, we
    refuse to execute.

    `context` (user_sub, per-tool-call id) is exposed to the handler via
    `current_tool_context()` for the duration of this call — see
    `ToolContext`. Handlers that don't need it simply ignore it.
    """
    if allowed_names is not None and name not in allowed_names:
        logger.warning(
            "Tool '%s' blocked by panel allow-list (advertised set: %s)",
            name, sorted(allowed_names),
        )
        return {
            "error": (
                f"Tool '{name}' is not available in this context and "
                "cannot be called from here. Refer the user to the "
                "appropriate panel if they need it."
            ),
        }

    tool = _REGISTRY.get(name)
    if tool is None:
        return {"error": f"Unknown tool: '{name}'."}

    try:
        args = json.loads(args_json) if args_json else {}
    except json.JSONDecodeError as e:
        return {"error": f"Invalid tool arguments JSON: {e.msg}"}
    if not isinstance(args, dict):
        return {"error": "Tool arguments must be a JSON object."}

    ctx_token = _TOOL_CONTEXT.set(context or ToolContext())
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
        # Don't leak stack traces to the LLM — log fully so operator can grep.
        logger.exception("Tool '%s' raised", name)
        return {"error": f"Tool '{name}' failed: {type(e).__name__}: {e}"}
    finally:
        _TOOL_CONTEXT.reset(ctx_token)

    try:
        json.dumps(result, default=str)
    except (TypeError, ValueError) as e:
        logger.error("Tool '%s' returned non-serializable result: %s", name, e)
        return {"error": f"Tool '{name}' returned an invalid result shape."}

    return result if isinstance(result, dict) else {"data": result}
