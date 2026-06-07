"""Execution-investigation tools — read-only (Phase X2: X06, X07).

Async wrappers around Django's execution-engine endpoints. The JWT is
forwarded; Django scopes every queryset to the calling user, so a
cross-user run id returns 404 → we surface `{"error": ...}`.

These tools are SAFE in both `research` and `execution` modes (mode
hard-floor `_READ_TOOLS`): they only READ run history / status / logs,
never trigger or mutate anything.

Two response hygiene rules enforced here, before anything reaches the LLM:
  • **Signed GCS URLs never leave the tool.** Django returns short-lived
    `*_signed_url` fields on runs/nodes; the model has no use for a URL and
    it would just burn tokens / risk being echoed. We strip them from the
    metadata tools (X06) and, in `read_run_logs` (X07), fetch the URL
    server-side and return the TEXT.
  • **Persisted `inputs` are already password-masked by Django**
    (`run_builder.py` masks password-typed params to "*****" at persist
    time), so `get_workflow_run` can surface `inputs` as-is — but we keep
    the AD-B9 posture explicit in case that ever changes.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from conversation.persistence import DjangoUnavailable, get_django_client
from llm.tools import ToolDefinition, register_tool

logger = logging.getLogger(__name__)


# Per-stream cap on log text returned to the model. Logs can be megabytes;
# the diagnostic signal is almost always at the tail (the error + traceback).
# ~6 KB ≈ a comfortable chunk for the model without blowing the context.
_LOG_TAIL_BYTES = 6_000

# Fields Django attaches that must never reach the model.
_SIGNED_URL_FIELDS = ("stdout_signed_url", "stderr_signed_url", "logs_signed_url")


def _django_error(status_code: int, body: Any, default: str) -> dict[str, Any]:
    """Normalize a non-2xx Django response into a tool-result error dict.

    Mirrors `tools/workflows.py::_django_error` so error shape is uniform
    across the tool surface.
    """
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


def _strip_signed_urls(obj: Any) -> Any:
    """Drop `*_signed_url` keys from a dict (in place on a shallow copy)."""
    if not isinstance(obj, dict):
        return obj
    return {k: v for k, v in obj.items() if k not in _SIGNED_URL_FIELDS}


def _require_run_id(args: dict[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
    """Validate the `run_id` arg. Returns (run_id, None) or (None, error)."""
    rid = args.get("run_id")
    if not isinstance(rid, str) or not rid.strip():
        return None, {"error": "Missing required argument 'run_id' (a run UUID)."}
    return rid.strip(), None


# ── X06 — metadata / status tools ────────────────────────────────────


async def _handler_get_execution_histories(
    args: dict[str, Any], jwt: str
) -> dict[str, Any]:
    """List recent executions (workflow runs + script runs), newest first.

    Wraps `GET /api/execution-engine/executions/all/`. The unified list
    discriminates each row by `tag` ('workflow'|'script'). Signed-URL
    fields are stripped — use `read_run_logs` to read a specific run's logs.
    """
    params: dict[str, Any] = {}
    page = args.get("page")
    page_size = args.get("page_size")
    # Always paginate so the response is bounded (the endpoint returns the
    # FULL list when neither param is present — bad for a token budget).
    params["page"] = int(page) if isinstance(page, (int, str)) and str(page).isdigit() else 1
    if isinstance(page_size, (int, str)) and str(page_size).isdigit():
        params["page_size"] = min(max(int(page_size), 1), 50)
    else:
        params["page_size"] = 20

    client = get_django_client()
    try:
        s, body = await client.request(
            method="GET",
            path="/api/execution-engine/executions/all/",
            jwt=jwt,
            params=params,
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s != 200:
        return _django_error(s, body, "Failed to list executions")

    data = (body or {}).get("data") or {}
    # Paginated branch → {executions, total_count, ...}; both params present
    # so we always land here, but guard the shape defensively.
    rows = data.get("executions") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        rows = []

    tag = (args.get("tag") or "").strip().lower()
    cleaned = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        if tag in ("workflow", "script") and r.get("tag") != tag:
            continue
        cleaned.append(_strip_signed_urls(r))

    out: dict[str, Any] = {"executions": cleaned}
    if isinstance(data, dict):
        for k in ("total_count", "total_pages", "current_page"):
            if k in data:
                out[k] = data[k]
    return out


async def _handler_get_workflow_run(
    args: dict[str, Any], jwt: str
) -> dict[str, Any]:
    """Fetch a workflow run's status + per-node breakdown.

    Merges `GET .../workflows/runs/<id>/` (run-level status, error,
    timestamps, masked inputs) with `.../nodes/` (per-node status, exit
    code, error). This is the tool that tells the model WHICH node failed
    and WHY — the entry point of the failure-investigation loop.
    """
    run_id, err = _require_run_id(args)
    if err:
        return err

    client = get_django_client()
    try:
        s, body = await client.request(
            method="GET",
            path=f"/api/execution-engine/workflows/runs/{run_id}/",
            jwt=jwt,
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s != 200:
        return _django_error(s, body, "Failed to read workflow run")
    run = (body or {}).get("data") or {}

    # Per-node breakdown. A failure here is non-fatal — return run-level
    # data with an empty nodes list rather than erroring the whole tool.
    nodes: list[dict[str, Any]] = []
    try:
        ns, nbody = await client.request(
            method="GET",
            path=f"/api/execution-engine/workflows/runs/{run_id}/nodes/",
            jwt=jwt,
        )
        if ns == 200:
            raw_nodes = (nbody or {}).get("data") or []
            if isinstance(raw_nodes, list):
                nodes = [_strip_signed_urls(n) for n in raw_nodes if isinstance(n, dict)]
    except DjangoUnavailable:
        pass  # keep run-level data; nodes simply omitted

    run = _strip_signed_urls(run)
    run["nodes"] = nodes
    # `inputs` is already password-masked by Django at persist time
    # (run_builder.py). Left as-is; see module docstring (AD-B9).
    return run


async def _handler_get_script_run(
    args: dict[str, Any], jwt: str
) -> dict[str, Any]:
    """Fetch a single script execution's status (exit code, timing).

    Wraps `GET /api/execution-engine/<id>/status/`. Use this to poll a
    chat-initiated `run_script` to completion, or to inspect a past run.
    """
    run_id, err = _require_run_id(args)
    if err:
        return err

    client = get_django_client()
    try:
        s, body = await client.request(
            method="GET",
            path=f"/api/execution-engine/{run_id}/status/",
            jwt=jwt,
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s != 200:
        return _django_error(s, body, "Failed to read script run")
    return _strip_signed_urls((body or {}).get("data") or {})


# ── X07 — log-reading tool ───────────────────────────────────────────


def _tail(text: str, limit: int = _LOG_TAIL_BYTES) -> str:
    """Return the last `limit` bytes of text, prefixed with a truncation
    marker when content was dropped (the error is almost always at the end).
    """
    if not text:
        return ""
    if len(text) <= limit:
        return text
    return "...[earlier output truncated]...\n" + text[-limit:]


async def _fetch_signed_url_text(url: str) -> str | None:
    """GET a short-lived signed GCS URL and return its text body.

    This is a RAW fetch (no JWT) to the storage URL Django minted — NOT a
    Django call. The signed URL never leaves this tool; only the text is
    returned to the model. Returns None on any failure (expired/missing).
    """
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            resp = await c.get(url)
        if resp.status_code != 200:
            logger.warning("Signed-URL fetch returned HTTP %d", resp.status_code)
            return None
        return resp.text
    except httpx.HTTPError as e:
        logger.warning("Signed-URL fetch failed: %s", e)
        return None


async def _handler_read_run_logs(
    args: dict[str, Any], jwt: str
) -> dict[str, Any]:
    """Fetch and return the stdout/stderr TEXT for a run (or one node).

    The investigation workhorse. Resolves the signed log URL from Django,
    fetches the GCS text SERVER-SIDE, and returns truncated content so the
    model has actual stderr to diagnose — never a URL.

    Args:
      run_id (required), kind ('workflow'|'script', required),
      node_id (workflow only — which node's logs; omit for the failed one),
      stream ('stderr'|'stdout'|'both', default 'both').
    """
    run_id, err = _require_run_id(args)
    if err:
        return err
    kind = (args.get("kind") or "").strip().lower()
    if kind not in ("workflow", "script"):
        return {"error": "Argument 'kind' must be 'workflow' or 'script'."}
    stream = (args.get("stream") or "both").strip().lower()
    if stream not in ("stderr", "stdout", "both"):
        return {"error": "Argument 'stream' must be 'stderr', 'stdout', or 'both'."}

    client = get_django_client()

    # Resolve the signed URLs for the requested run/node.
    stdout_url = stderr_url = ""
    meta: dict[str, Any] = {}

    if kind == "script":
        try:
            s, body = await client.request(
                method="GET",
                path=f"/api/execution-engine/{run_id}/status/",
                jwt=jwt,
            )
        except DjangoUnavailable as e:
            return {"error": f"Storage unreachable: {e}"}
        if s != 200:
            return _django_error(s, body, "Failed to read script run")
        d = (body or {}).get("data") or {}
        stdout_url = d.get("stdout_signed_url") or ""
        stderr_url = d.get("stderr_signed_url") or ""
        meta = {"status": d.get("status"), "exit_code": d.get("exit_code")}

    else:  # workflow
        try:
            s, body = await client.request(
                method="GET",
                path=f"/api/execution-engine/workflows/runs/{run_id}/nodes/",
                jwt=jwt,
            )
        except DjangoUnavailable as e:
            return {"error": f"Storage unreachable: {e}"}
        if s != 200:
            return _django_error(s, body, "Failed to read workflow node runs")
        node_runs = (body or {}).get("data") or []
        if not isinstance(node_runs, list) or not node_runs:
            return {"error": "No node runs found for this workflow run."}

        want_node = (args.get("node_id") or "").strip()
        target = None
        if want_node:
            target = next(
                (n for n in node_runs if isinstance(n, dict) and n.get("node_id") == want_node),
                None,
            )
            if target is None:
                return {"error": f"node_id {want_node!r} not found in this run."}
        else:
            # Default to the failed node (the thing worth investigating);
            # fall back to the last node by execution_order.
            failed = [
                n for n in node_runs
                if isinstance(n, dict) and n.get("status") == "failed"
            ]
            if failed:
                target = failed[0]
            else:
                target = max(
                    (n for n in node_runs if isinstance(n, dict)),
                    key=lambda n: n.get("execution_order", 0),
                    default=None,
                )
        if target is None:
            return {"error": "Could not resolve a node to read logs for."}

        stdout_url = target.get("stdout_signed_url") or ""
        stderr_url = target.get("stderr_signed_url") or ""
        meta = {
            "node_id": target.get("node_id"),
            "node_label": target.get("node_label"),
            "status": target.get("status"),
            "exit_code": target.get("exit_code"),
            "error_message": target.get("error_message"),
        }

    # Fetch the requested streams server-side, return TEXT only.
    out: dict[str, Any] = dict(meta)
    if stream in ("stdout", "both"):
        txt = await _fetch_signed_url_text(stdout_url)
        out["stdout_tail"] = _tail(txt) if txt is not None else ""
    if stream in ("stderr", "both"):
        txt = await _fetch_signed_url_text(stderr_url)
        out["stderr_tail"] = _tail(txt) if txt is not None else ""

    # If nothing came back at all, say so explicitly rather than returning
    # empty strings that read like "the logs were empty".
    if not out.get("stdout_tail") and not out.get("stderr_tail"):
        out["note"] = (
            "No log content available (the signed URL may have expired, or "
            "the run produced no output / hasn't finished yet)."
        )
    return out


# ── Registration ─────────────────────────────────────────────────────


register_tool(ToolDefinition(
    name="get_execution_histories",
    description=(
        "List the user's recent executions (workflow runs AND script runs), "
        "newest first. Each row has id, name, status, tag "
        "('workflow'|'script'), duration, created_at (and workflow_id for "
        "workflow rows). Use this to answer 'what ran / failed recently?' and "
        "to get a run id to pass to get_workflow_run / get_script_run / "
        "read_run_logs. Read-only."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "page": {"type": "integer", "description": "1-based page (default 1)."},
            "page_size": {
                "type": "integer",
                "description": "Rows per page, 1-50 (default 20).",
            },
            "tag": {
                "type": "string",
                "enum": ["workflow", "script"],
                "description": "Optional filter to only workflow or only script runs.",
            },
        },
        "required": [],
        "additionalProperties": False,
    },
    handler=_handler_get_execution_histories,
))


register_tool(ToolDefinition(
    name="get_workflow_run",
    description=(
        "Fetch one workflow run's status plus its per-node breakdown: "
        "run-level status / error_message / timestamps / masked inputs, and "
        "a `nodes` array where each node has node_id, node_label, status, "
        "exit_code, error_message, execution_order. THIS is how you learn "
        "which node failed and why — the start of investigating a failure. "
        "Read-only."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "run_id": {
                "type": "string",
                "description": "UUID of the workflow run (from get_execution_histories).",
            },
        },
        "required": ["run_id"],
        "additionalProperties": False,
    },
    handler=_handler_get_workflow_run,
))


register_tool(ToolDefinition(
    name="get_script_run",
    description=(
        "Fetch one script execution's status: status, exit_code, started_at, "
        "completed_at, duration. Use it to poll a chat-initiated script run "
        "to completion or to inspect a past run. Read-only."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "run_id": {
                "type": "string",
                "description": "UUID of the script execution (from get_execution_histories).",
            },
        },
        "required": ["run_id"],
        "additionalProperties": False,
    },
    handler=_handler_get_script_run,
))


register_tool(ToolDefinition(
    name="read_run_logs",
    description=(
        "Read the actual stdout/stderr TEXT of a run so you can diagnose a "
        "failure. For a workflow, pass kind='workflow' and optionally a "
        "node_id (omit to auto-select the failed node). For a script, pass "
        "kind='script'. Returns truncated stdout_tail / stderr_tail plus "
        "status / exit_code (and node_id / error_message for workflows). The "
        "logs are fetched server-side; you get the text, not a URL. Read-only."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "run_id": {"type": "string", "description": "UUID of the run."},
            "kind": {
                "type": "string",
                "enum": ["workflow", "script"],
                "description": "Whether run_id is a workflow run or a script execution.",
            },
            "node_id": {
                "type": "string",
                "description": (
                    "Workflow only: which node's logs to read. Omit to read "
                    "the failed node (or the last node if none failed)."
                ),
            },
            "stream": {
                "type": "string",
                "enum": ["stderr", "stdout", "both"],
                "description": "Which stream(s) to return (default 'both').",
            },
        },
        "required": ["run_id", "kind"],
        "additionalProperties": False,
    },
    handler=_handler_read_run_logs,
    timeout_seconds=30.0,
))
