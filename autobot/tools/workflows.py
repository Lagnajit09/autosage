"""Workflow tools — list / read / create / update.

Async wrappers around Django's `/api/workflows/*` endpoints. The JWT
is forwarded; Django enforces per-user ownership.

Django stores `nodes` and `edges` as plain JSONFields with NO validation
on save — a malformed graph stores fine and fails only at runtime. To
catch obvious shape bugs early, wrappers here do minimal validation
(node id + type, edge source + target). Deeper checks (parameter
resolution, cycle detection) belong in the runtime graph helper.
"""

from __future__ import annotations

import logging
from typing import Any

from conversation.persistence import DjangoUnavailable, get_django_client
from llm.tools import ToolDefinition, register_tool

logger = logging.getLogger(__name__)


_VALID_NODE_TYPES = {"trigger", "action", "decision"}


def _django_error(status_code: int, body: Any, default: str) -> dict[str, Any]:
    """Normalize a non-2xx Django response into a tool-result error dict."""
    msg = None
    if isinstance(body, dict):
        msg = body.get("message") or body.get("detail")
        errs = body.get("errors")
        if errs and isinstance(errs, dict):
            try:
                pairs = ", ".join(f"{k}: {v}" for k, v in errs.items())
                msg = f"{msg}: {pairs}" if msg else pairs
            except Exception:
                pass
    return {"error": msg or f"{default} (HTTP {status_code})"}


def _validate_nodes(nodes: Any) -> str | None:
    """Return None on valid, or an error string."""
    if not isinstance(nodes, list):
        return "`nodes` must be a JSON array."
    for i, n in enumerate(nodes):
        if not isinstance(n, dict):
            return f"`nodes[{i}]` must be an object."
        node_id = n.get("id")
        node_type = n.get("type")
        if not isinstance(node_id, str) or not node_id:
            return f"`nodes[{i}].id` must be a non-empty string."
        if node_type not in _VALID_NODE_TYPES:
            return (
                f"`nodes[{i}].type` must be one of "
                f"{sorted(_VALID_NODE_TYPES)} (got {node_type!r})."
            )
    return None


def _validate_edges(edges: Any, node_ids: set[str] | None = None) -> str | None:
    """Return None on valid, or an error string. If `node_ids` given,
    cross-check that every edge endpoint refers to a real node.
    """
    if not isinstance(edges, list):
        return "`edges` must be a JSON array."
    for i, e in enumerate(edges):
        if not isinstance(e, dict):
            return f"`edges[{i}]` must be an object."
        src = e.get("source")
        tgt = e.get("target")
        if not isinstance(src, str) or not src:
            return f"`edges[{i}].source` must be a non-empty string."
        if not isinstance(tgt, str) or not tgt:
            return f"`edges[{i}].target` must be a non-empty string."
        if node_ids is not None:
            if src not in node_ids:
                return (
                    f"`edges[{i}].source` ({src!r}) does not match any "
                    f"node id in this workflow."
                )
            if tgt not in node_ids:
                return (
                    f"`edges[{i}].target` ({tgt!r}) does not match any "
                    f"node id in this workflow."
                )
    return None


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


# ── Handlers ─────────────────────────────────────────────────────────


async def _handler_list_workflows(args: dict[str, Any], jwt: str) -> dict[str, Any]:
    client = get_django_client()
    try:
        s, body = await client.request(
            method="GET", path="/api/workflows/", jwt=jwt,
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s != 200:
        return _django_error(s, body, "Failed to list workflows")
    return {"workflows": (body or {}).get("data") or []}


async def _handler_read_workflow(args: dict[str, Any], jwt: str) -> dict[str, Any]:
    try:
        wf_id = _require(args, "id", str)
    except ValueError as e:
        return {"error": str(e)}
    client = get_django_client()
    try:
        s, body = await client.request(
            method="GET", path=f"/api/workflows/{wf_id}/", jwt=jwt,
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s != 200:
        return _django_error(s, body, "Failed to read workflow")
    return (body or {}).get("data") or {}


async def _handler_create_workflow(args: dict[str, Any], jwt: str) -> dict[str, Any]:
    try:
        name = _require(args, "name", str)
        nodes = _require(args, "nodes", list)
        edges = _require(args, "edges", list)
    except ValueError as e:
        return {"error": str(e)}
    if not name.strip():
        return {"error": "`name` must not be empty."}
    description = args.get("description") or ""
    if not isinstance(description, str):
        return {"error": "`description` must be a string."}

    node_err = _validate_nodes(nodes)
    if node_err:
        return {"error": node_err}
    node_ids = {n["id"] for n in nodes}
    edge_err = _validate_edges(edges, node_ids=node_ids)
    if edge_err:
        return {"error": edge_err}

    client = get_django_client()
    try:
        s, body = await client.request(
            method="POST",
            path="/api/workflows/",
            jwt=jwt,
            json_body={
                "name": name,
                "description": description,
                "nodes": nodes,
                "edges": edges,
            },
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s not in (200, 201):
        return _django_error(s, body, "Failed to create workflow")
    return (body or {}).get("data") or {}


async def _handler_update_workflow(args: dict[str, Any], jwt: str) -> dict[str, Any]:
    try:
        wf_id = _require(args, "id", str)
    except ValueError as e:
        return {"error": str(e)}

    # PATCH semantics — only forward fields the LLM explicitly set.
    # `nodes: []` would clear the workflow, so absence ≠ empty array.
    patch_body: dict[str, Any] = {}
    if "name" in args:
        if not isinstance(args["name"], str) or not args["name"].strip():
            return {"error": "`name` must be a non-empty string when provided."}
        patch_body["name"] = args["name"]
    if "description" in args:
        if not isinstance(args["description"], str):
            return {"error": "`description` must be a string when provided."}
        patch_body["description"] = args["description"]
    if "nodes" in args:
        err = _validate_nodes(args["nodes"])
        if err:
            return {"error": err}
        patch_body["nodes"] = args["nodes"]
    if "edges" in args:
        # Only cross-check edges against nodes when both are being updated;
        # otherwise we'd need to fetch the existing workflow to validate.
        node_ids = None
        if "nodes" in patch_body:
            node_ids = {n["id"] for n in patch_body["nodes"]}
        err = _validate_edges(args["edges"], node_ids=node_ids)
        if err:
            return {"error": err}
        patch_body["edges"] = args["edges"]

    if not patch_body:
        return {
            "error": (
                "No fields to update. Provide at least one of "
                "`name`, `description`, `nodes`, `edges`."
            ),
        }

    client = get_django_client()
    try:
        s, body = await client.request(
            method="PATCH",
            path=f"/api/workflows/{wf_id}/",
            jwt=jwt,
            json_body=patch_body,
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s not in (200, 201):
        return _django_error(s, body, "Failed to update workflow")
    return (body or {}).get("data") or {}


register_tool(ToolDefinition(
    name="list_workflows",
    description=(
        "List every workflow owned by the current user. Returns id, "
        "name, description, total_nodes, total_edges, runs (count), "
        "and last_run timestamp for each. Does NOT include the full "
        "nodes/edges JSON — call `read_workflow` for that."
    ),
    parameters_schema={
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": False,
    },
    handler=_handler_list_workflows,
))


register_tool(ToolDefinition(
    name="read_workflow",
    description=(
        "Fetch a workflow's full definition by id, including the "
        "complete nodes and edges arrays. Use this before "
        "`update_workflow` so the next update can be based on the "
        "current state."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "id": {
                "type": "string",
                "description": "UUID of the workflow (from list_workflows).",
            },
        },
        "required": ["id"],
        "additionalProperties": False,
    },
    handler=_handler_read_workflow,
))


register_tool(ToolDefinition(
    name="create_workflow",
    description=(
        "Create a new workflow. Returns the new workflow's id plus "
        "all stored fields. The `nodes` and `edges` arrays must follow "
        "the structure documented in the system prompt — each node "
        "needs `id` and `type` (one of trigger/action/decision), each "
        "edge needs `source` and `target` matching real node ids. "
        "Before calling this for an action node that references a "
        "vault server / credential, call `list_vault_resources` to get "
        "the actual UUIDs — never invent them."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "Short human-readable workflow name.",
            },
            "description": {
                "type": "string",
                "description": "Optional longer description.",
            },
            "nodes": {
                "type": "array",
                "description": (
                    "Array of node objects. Each must have `id` (string) "
                    "and `type` ('trigger'|'action'|'decision'). See "
                    "system prompt sections 3-7 for the full per-type "
                    "data shape."
                ),
                "items": {"type": "object"},
            },
            "edges": {
                "type": "array",
                "description": (
                    "Array of edge objects. Each must have `source` and "
                    "`target` matching node ids. Decision-branch edges "
                    "additionally need `sourceHandle: 'true'|'false'`."
                ),
                "items": {"type": "object"},
            },
        },
        "required": ["name", "nodes", "edges"],
        "additionalProperties": False,
    },
    handler=_handler_create_workflow,
))


register_tool(ToolDefinition(
    name="update_workflow",
    description=(
        "Partially update an existing workflow. Send only the fields "
        "you want to change (PATCH semantics). To modify the graph, "
        "typically call `read_workflow` first, mutate the nodes/edges, "
        "then pass the full updated arrays here. Sending `nodes: []` "
        "clears the workflow — only do that if explicitly intended."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "id": {
                "type": "string",
                "description": "UUID of the workflow to update.",
            },
            "name": {"type": "string"},
            "description": {"type": "string"},
            "nodes": {"type": "array", "items": {"type": "object"}},
            "edges": {"type": "array", "items": {"type": "object"}},
        },
        "required": ["id"],
        "additionalProperties": False,
    },
    handler=_handler_update_workflow,
))
