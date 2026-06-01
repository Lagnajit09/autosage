"""Script tools — list / read / create / update.

Async wrappers around Django's `/api/scripts/*` endpoints. The JWT is
forwarded; Django enforces per-user ownership.

Django API quirks:
  • List response is `data: [...]` (flat array), not `data.scripts`.
  • Metadata and content are split — `read_script` hits the content URL.
  • Update is `POST /api/scripts/<id>/update/`, not PATCH on the main URL.
  • `language` is serializer-level; the model stores `pathname` + `content_type`.

Language list is a deliberate subset of Django's full enum — only
languages the workflow runtime understands. Keep aligned with
`server/scripts/serializers.py::LANGUAGE_MAP`.
"""

from __future__ import annotations

import logging
from typing import Any

from conversation.persistence import DjangoUnavailable, get_django_client
from llm.tools import ToolDefinition, register_tool

logger = logging.getLogger(__name__)

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


def _django_error(status_code: int, body: Any, default: str) -> dict[str, Any]:
    """Normalize a non-2xx Django response into a tool-result error dict."""
    msg = None
    if isinstance(body, dict):
        msg = body.get("message") or body.get("detail")
        errs = body.get("errors")
        # Surface field-level errors so the LLM can self-correct.
        if errs and isinstance(errs, dict):
            try:
                pairs = ", ".join(f"{k}: {v}" for k, v in errs.items())
                msg = f"{msg}: {pairs}" if msg else pairs
            except Exception:
                pass
    return {"error": msg or f"{default} (HTTP {status_code})"}


def _require(args: dict[str, Any], field: str, expected_type: type) -> Any:
    if field not in args:
        raise ValueError(f"Missing required argument '{field}'.")
    value = args[field]
    if not isinstance(value, expected_type):
        raise ValueError(
            f"Argument '{field}' must be of type "
            f"{expected_type.__name__} (got {type(value).__name__}).",
        )
    return value


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
