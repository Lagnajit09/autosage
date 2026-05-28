"""Script tools (T14) — list / read / create / update.

Thin async wrappers around Django's `/api/scripts/*` endpoints. Each
handler forwards the caller's JWT; Django enforces per-user ownership
via its queryset filtering. Autobot does no authorization checks here.

Notable Django API quirks worth knowing about so the LLM's tool-call
shapes line up:

  • The list response is ``data: [{...}, {...}]`` (a flat array), NOT
    ``data.scripts: [...]`` like `autobot_api` uses. We don't normalize
    that here — the LLM sees Django's exact shape.
  • Metadata (`GET /api/scripts/<id>/`) and content (`GET /api/scripts/
    <id>/content/`) are split. `read_script` calls the CONTENT endpoint
    so the LLM gets the source it actually wants to read or modify.
  • Update is `POST /api/scripts/<id>/update/` (NOT PATCH on the main
    URL). Same for `/rename/`. This is a legacy oddity in the scripts
    app's URL design; mirror it exactly or you get 405s.
  • `language` is a serializer-level field; the model stores `pathname`
    + `content_type`. The serializer accepts a language name (e.g.
    "python") on create and maps it to the right extension/MIME.

Language enum surfaced to the LLM is a subset of the full Django enum —
keep this list aligned with `server/scripts/serializers.py::LANGUAGE_MAP`.
We only expose languages the workflow runtime understands; "html"/"css"
type entries exist in the Django enum but are nonsensical as workflow
scripts and would just confuse the model.
"""

from __future__ import annotations

import logging
from typing import Any

from conversation.persistence import DjangoUnavailable, get_django_client
from llm.tools import ToolDefinition, register_tool

logger = logging.getLogger(__name__)

# Languages the LLM may emit on `create_script`. Aligned with workflow
# semantics — see the system prompt's Section 5/13. The full Django list
# is broader; we deliberately narrow it so the LLM doesn't generate
# nonsensical workflow node bindings (e.g. an HTML "script").
_SCRIPT_LANGUAGES = [
    "python",
    "shell",
    "bash",
    "powershell",
    "javascript",
    "typescript",
    "ruby",
    "go",
    "rust",
    "sql",
]


# ── Helpers ──────────────────────────────────────────────────────────


def _django_error(status_code: int, body: Any, default: str) -> dict[str, Any]:
    """Normalize a non-2xx Django response into a tool-result error dict."""
    msg = None
    if isinstance(body, dict):
        msg = body.get("message") or body.get("detail")
        errs = body.get("errors")
        # Surface field-level validation errors so the LLM can self-correct.
        if errs and isinstance(errs, dict):
            try:
                pairs = ", ".join(f"{k}: {v}" for k, v in errs.items())
                msg = f"{msg}: {pairs}" if msg else pairs
            except Exception:
                pass
    return {"error": msg or f"{default} (HTTP {status_code})"}


def _require(args: dict[str, Any], field: str, expected_type: type) -> Any:
    """Type-check one argument or return an error sentinel via raise.

    Returns the value on success. Raises `ValueError` with a precise
    message on failure — the dispatcher converts that to `{error: ...}`.
    """
    if field not in args:
        raise ValueError(f"Missing required argument '{field}'.")
    value = args[field]
    if not isinstance(value, expected_type):
        raise ValueError(
            f"Argument '{field}' must be of type "
            f"{expected_type.__name__} (got {type(value).__name__}).",
        )
    return value


# ── Handlers ─────────────────────────────────────────────────────────


async def _handler_list_scripts(args: dict[str, Any], jwt: str) -> dict[str, Any]:
    client = get_django_client()
    try:
        s, body = await client.request(
            method="GET", path="/api/scripts/", jwt=jwt,
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s != 200:
        return _django_error(s, body, "Failed to list scripts")
    return {"scripts": (body or {}).get("data") or []}


async def _handler_read_script(args: dict[str, Any], jwt: str) -> dict[str, Any]:
    try:
        script_id = _require(args, "id", int)
    except ValueError as e:
        return {"error": str(e)}
    client = get_django_client()
    try:
        s, body = await client.request(
            method="GET",
            path=f"/api/scripts/{script_id}/content/",
            jwt=jwt,
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s != 200:
        return _django_error(s, body, "Failed to read script")
    return (body or {}).get("data") or {}


async def _handler_create_script(args: dict[str, Any], jwt: str) -> dict[str, Any]:
    try:
        name = _require(args, "name", str)
        language = _require(args, "language", str)
        content = _require(args, "content", str)
    except ValueError as e:
        return {"error": str(e)}
    if language not in _SCRIPT_LANGUAGES:
        return {
            "error": (
                f"Unsupported language '{language}'. "
                f"Choose one of: {', '.join(_SCRIPT_LANGUAGES)}."
            ),
        }
    if not content.strip():
        return {"error": "Script content must not be empty."}
    client = get_django_client()
    try:
        s, body = await client.request(
            method="POST",
            path="/api/scripts/",
            jwt=jwt,
            json_body={"name": name, "language": language, "content": content},
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s not in (200, 201):
        return _django_error(s, body, "Failed to create script")
    return (body or {}).get("data") or {}


async def _handler_update_script(args: dict[str, Any], jwt: str) -> dict[str, Any]:
    try:
        script_id = _require(args, "id", int)
        content = _require(args, "content", str)
    except ValueError as e:
        return {"error": str(e)}
    if not content.strip():
        return {"error": "Script content must not be empty."}
    client = get_django_client()
    try:
        s, body = await client.request(
            method="POST",
            path=f"/api/scripts/{script_id}/update/",
            jwt=jwt,
            json_body={"content": content},
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s not in (200, 201):
        return _django_error(s, body, "Failed to update script")
    return (body or {}).get("data") or {}


# ── Registration ─────────────────────────────────────────────────────


register_tool(ToolDefinition(
    name="list_scripts",
    description=(
        "List every script owned by the current user. Returns id, name, "
        "pathname (with extension), content_type, file_size, version, "
        "and timestamps. Call this before `read_script` or `update_script` "
        "when the user references a script by name rather than id."
    ),
    parameters_schema={
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": False,
    },
    handler=_handler_list_scripts,
))


register_tool(ToolDefinition(
    name="read_script",
    description=(
        "Fetch a script's full source code and metadata by id. Use this "
        "to inspect existing scripts before suggesting changes. The "
        "returned `content` is the exact source as last saved."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "id": {
                "type": "integer",
                "description": "Numeric id of the script (from list_scripts).",
            },
        },
        "required": ["id"],
        "additionalProperties": False,
    },
    handler=_handler_read_script,
))


register_tool(ToolDefinition(
    name="create_script",
    description=(
        "Create a new script. Returns the new script's id, name, "
        "pathname, and version=1. Pick `language` to match the workflow "
        "target: 'shell'/'bash' for Linux SSH, 'powershell' for Windows "
        "WinRM, 'python' where the target VM has Python available. The "
        "file extension is appended automatically — do NOT include it "
        "in `name`."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": (
                    "Script name. Alphanumerics, underscores, hyphens "
                    "only — no spaces, no path separators, no extension."
                ),
            },
            "language": {
                "type": "string",
                "enum": _SCRIPT_LANGUAGES,
                "description": (
                    "Script language. Determines file extension and "
                    "interpreter."
                ),
            },
            "content": {
                "type": "string",
                "description": (
                    "Full script source code. Use {{PARAM}} placeholders "
                    "for configurable values that will be supplied via "
                    "workflow-node parameters."
                ),
            },
        },
        "required": ["name", "language", "content"],
        "additionalProperties": False,
    },
    handler=_handler_create_script,
))


register_tool(ToolDefinition(
    name="update_script",
    description=(
        "Replace an existing script's content. Increments the version. "
        "Returns the new version number. Use `read_script` first if you "
        "need to base the update on the current content."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "id": {
                "type": "integer",
                "description": "Numeric id of the script to update.",
            },
            "content": {
                "type": "string",
                "description": (
                    "New full script source code. Replaces — does NOT "
                    "patch — the existing content."
                ),
            },
        },
        "required": ["id", "content"],
        "additionalProperties": False,
    },
    handler=_handler_update_script,
))
