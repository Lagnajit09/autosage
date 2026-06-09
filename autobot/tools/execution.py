"""Execution tools — investigation (X06, X07) + preview (X09) + run (X10).

Async wrappers around Django's execution-engine endpoints. The JWT is
forwarded; Django scopes every queryset to the calling user, so a
cross-user run id returns 404 → we surface `{"error": ...}`.

The X06/X07 investigation tools are SAFE in both `research` and
`execution` modes (mode hard-floor `_READ_TOOLS`): they only READ run
history / status / logs, never trigger or mutate anything.

`preview_workflow_run` (X09) is ALSO side-effect-free (it never enqueues),
but lives in the `_EXEC_TOOLS` floor — it's only meaningful in `execution`
mode as the mandatory pre-run confirmation step (AD-B3). It masks
password-param values (AD-B9) and refuses workflows that need a run-time
secret, redirecting the user to the builder (AD-B9 Layer-4a).

`run_workflow` (X10) is the first WRITE tool here — it enqueues a real run.
It is gated by the exec quota (X08), drops any password-typed input before
POSTing (AD-B9 Layer-2; the Django Layer-3 backstop drops it again), and
sends an Idempotency-Key = the per-tool-call id (X01b) so a double-call in
one turn collapses to one run. `trigger_source` is fixed to `"autobot"`.
Both gating signals (user_sub, tool-call id) arrive via
`current_tool_context()`, not the handler args.

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

from conversation.cache import get_cache
from conversation.persistence import DjangoUnavailable, get_django_client
from llm.tools import ToolDefinition, current_tool_context, register_tool
from settings import get_settings
from tools._security import _PASSWORD_MASK

logger = logging.getLogger(__name__)


def _watch_url(run_id: str) -> str:
    """The pre-existing workflow-run SSE stream the RunPanel consumes (AD-B2)."""
    return f"/api/execution-engine/workflows/runs/{run_id}/stream/"


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


# ── X09 — preview (side-effect-free pre-run confirmation) ────────────


def _collect_password_params(nodes: Any) -> dict[str, bool]:
    """Map each password-typed param id → whether it has a baked-in value.

    Mirrors `run_builder.py`'s detection (`type == "password"`, keyed by
    param `id`). `True` = a default value is baked into the workflow JSON
    (the worker supplies it at run time; Autobot never sees it). `False` =
    the param needs a value at run time — which Autobot cannot provide
    (AD-B9), so it forces a builder redirect.
    """
    out: dict[str, bool] = {}
    if not isinstance(nodes, list):
        return out
    for node in nodes:
        if not isinstance(node, dict):
            continue
        params = (node.get("data") or {}).get("parameters")
        if not isinstance(params, list):
            continue
        for p in params:
            if not isinstance(p, dict) or p.get("type") != "password":
                continue
            pid = p.get("id")
            if not pid:
                continue
            # A param can appear once; OR-in any baked value across nodes.
            out[pid] = out.get(pid, False) or bool(p.get("value"))
    return out


def _summarize_targets(nodes: Any) -> list[dict[str, Any]]:
    """One compact entry per action/script node — what would run, never how.

    Pulls only non-secret identifiers from the node JSON: the node label,
    the script type + id, and whether vault bindings are present. We do NOT
    resolve ids to names (that would add N+1 fetches to a side-effect-free
    preview); the model already has `read_workflow` if it needs more.
    """
    targets: list[dict[str, Any]] = []
    if not isinstance(nodes, list):
        return targets
    for node in nodes:
        if not isinstance(node, dict):
            continue
        data = node.get("data") or {}
        if not isinstance(data, dict) or data.get("type") != "script":
            continue
        sel = data.get("selectedScript") or {}
        vault = data.get("vaultDetails") or {}
        targets.append({
            "node_label": data.get("label") or node.get("id"),
            "script_type": sel.get("type") if isinstance(sel, dict) else None,
            "script_id": sel.get("scriptId") if isinstance(sel, dict) else None,
            "has_vault_binding": bool(
                isinstance(vault, dict) and vault.get("serverId")
            ),
        })
    return targets


def _mask_inputs_preview(
    inputs: Any, password_ids: set[str]
) -> dict[str, Any]:
    """Echo proposed `inputs` with password-typed keys masked (AD-B9).

    Mirrors `run_builder.py:178-189` — any input key that maps to a
    password-typed param id is shown as ``"*****"`` so a value the user (or
    model) put in `inputs` is never echoed back in plaintext.
    """
    if not isinstance(inputs, dict):
        return {}
    out: dict[str, Any] = {}
    for k, v in inputs.items():
        out[k] = _PASSWORD_MASK if k in password_ids and v else v
    return out


async def _handler_preview_workflow_run(
    args: dict[str, Any], jwt: str
) -> dict[str, Any]:
    """Summarize what a workflow run WOULD do — no enqueue, no write.

    The mandatory side-effect-free first step of execution (AD-B3): the
    model calls this, presents the summary, and waits for the user's
    explicit "run it" before calling `run_workflow`.

    AD-B9 Layer-4(a): if any password-typed param has no baked-in value, it
    needs a run-time secret that Autobot must never handle → `ready:false`
    with a `blocking` message telling the user to run it from the builder.
    """
    wf_id = args.get("workflow_id")
    if not isinstance(wf_id, str) or not wf_id.strip():
        return {"error": "Missing required argument 'workflow_id'."}
    wf_id = wf_id.strip()

    client = get_django_client()
    try:
        s, body = await client.request(
            method="GET", path=f"/api/workflows/{wf_id}/", jwt=jwt,
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s != 200:
        return _django_error(s, body, "Failed to read workflow")

    wf = (body or {}).get("data") or {}
    nodes = wf.get("nodes") if isinstance(wf, dict) else None
    node_list = nodes if isinstance(nodes, list) else []

    password_params = _collect_password_params(node_list)
    proposed_inputs = args.get("inputs") if isinstance(args.get("inputs"), dict) else {}

    blocking: list[str] = []
    needs_secret = sorted(pid for pid, has_val in password_params.items() if not has_val)
    if needs_secret:
        blocking.append(
            "This workflow has a password parameter with no stored value, so "
            "it needs a secret at run time. I can't handle passwords — run "
            "this one from the workflow builder so your secret goes straight "
            "to the executor, never through me. "
            f"(parameter id(s): {', '.join(needs_secret)})"
        )

    return {
        "name": wf.get("name") if isinstance(wf, dict) else None,
        "node_count": len(node_list),
        "targets": _summarize_targets(node_list),
        "inputs_preview": _mask_inputs_preview(
            proposed_inputs, set(password_params)
        ),
        "ready": not blocking,
        "blocking": blocking,
    }


# ── X10 — run_workflow (gated write; enqueues a real run) ────────────


async def _check_exec_quota() -> dict[str, Any] | None:
    """Tick the per-user exec quota. Returns an `{error}` dict if over the
    cap, else None (allowed). Reads user_sub from the dispatch context;
    fail-open inside the cache helper. `limit<=0` disables the cap.
    """
    settings = get_settings()
    limit = int(getattr(settings, "AUTOBOT_EXEC_DAILY_LIMIT", 0) or 0)
    if limit <= 0:
        return None
    ctx = current_tool_context()
    if not ctx.user_sub:
        # No identity to meter against — let it through (Django throttles
        # are the backstop) rather than blocking on a missing context.
        return None
    allowed, count = await get_cache().incr_exec_quota_for_today(
        ctx.user_sub, limit,
    )
    if not allowed:
        return {
            "error": (
                f"Daily execution limit reached ({limit} runs/day). This "
                "caps chat-initiated workflow and script runs. Try again "
                "tomorrow, or run it from the builder."
            )
        }
    logger.info(
        "Exec quota tick: user_sub=%s count=%d/%d",
        ctx.user_sub, count, limit,
    )
    return None


async def _password_param_ids(wf_id: str, jwt: str) -> tuple[set[str], dict[str, Any] | None]:
    """Fetch the workflow and return its set of password-typed param ids.

    Returns (ids, None) on success or (set(), error_dict) if the workflow
    can't be read — so the caller can refuse the run rather than POST blind.
    """
    client = get_django_client()
    try:
        s, body = await client.request(
            method="GET", path=f"/api/workflows/{wf_id}/", jwt=jwt,
        )
    except DjangoUnavailable as e:
        return set(), {"error": f"Storage unreachable: {e}"}
    if s != 200:
        return set(), _django_error(s, body, "Failed to read workflow")
    wf = (body or {}).get("data") or {}
    return set(_collect_password_params(wf.get("nodes"))), None


async def _handler_run_workflow(args: dict[str, Any], jwt: str) -> dict[str, Any]:
    """Enqueue a real workflow run on the `autobot` trigger path.

    Gating: exec quota (X08), AD-B9 Layer-2 (drops any password-typed input
    key BEFORE POSTing — the model has no channel to supply a secret), and
    an Idempotency-Key = this tool call's id so a double-call in one LLM
    turn collapses to a single run (X01b). Whole-workflow run; the user must
    have confirmed via preview_workflow_run first (enforced by the prompt).
    """
    wf_id = args.get("workflow_id")
    if not isinstance(wf_id, str) or not wf_id.strip():
        return {"error": "Missing required argument 'workflow_id'."}
    wf_id = wf_id.strip()

    # AD-B9 Layer-2 — strip password-typed inputs before they leave Autobot.
    # We must know which param ids are passwords, so read the workflow first.
    pwd_ids, err = await _password_param_ids(wf_id, jwt)
    if err:
        return err

    raw_inputs = args.get("inputs")
    inputs: dict[str, Any] = {}
    dropped: list[str] = []
    if isinstance(raw_inputs, dict):
        for k, v in raw_inputs.items():
            if k in pwd_ids:
                dropped.append(k)  # never forward a password the model supplied
                continue
            inputs[k] = v
    if dropped:
        logger.warning(
            "run_workflow dropped %d password-typed input(s) %s (AD-B9 L2)",
            len(dropped), dropped,
        )

    # Quota AFTER validation but BEFORE the POST — an invalid request
    # shouldn't burn the user's daily allowance.
    quota_err = await _check_exec_quota()
    if quota_err:
        return quota_err

    body_payload: dict[str, Any] = {
        "inputs": inputs,
        "trigger_source": "autobot",
    }
    send_email = args.get("send_email")
    if isinstance(send_email, bool):
        body_payload["send_email"] = send_email
    user_email = args.get("user_email")
    if isinstance(user_email, str) and user_email.strip():
        body_payload["user_email"] = user_email.strip()

    # Idempotency-Key = the per-tool-call id (X01b). A retried/duplicated
    # call in one turn collapses to one run server-side.
    req_headers: dict[str, str] = {}
    tc_id = current_tool_context().tool_call_id
    if tc_id:
        req_headers["Idempotency-Key"] = tc_id

    client = get_django_client()
    try:
        s, body = await client.request(
            method="POST",
            path=f"/api/execution-engine/workflows/{wf_id}/run/",
            jwt=jwt,
            json_body=body_payload,
            headers=req_headers or None,
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s not in (200, 202):
        return _django_error(s, body, "Failed to start workflow run")

    data = (body or {}).get("data") or {}
    run_id = data.get("workflow_run_id")
    if not run_id:
        return {"error": "Workflow run started but no run id was returned."}
    out: dict[str, Any] = {
        "run_id": run_id,
        "kind": "workflow",
        "status": data.get("status") or "queued",
        "watch_url": _watch_url(str(run_id)),
    }
    if data.get("idempotent"):
        out["idempotent"] = True  # this tool-call id already ran this workflow
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


register_tool(ToolDefinition(
    name="preview_workflow_run",
    description=(
        "Preview what running a workflow WOULD do — WITHOUT running it. This "
        "is the MANDATORY first step before run_workflow: call it, show the "
        "user the summary, and WAIT for their explicit confirmation (never "
        "preview and run in the same turn). Returns name, node_count, targets "
        "(per script node: label, script type/id, whether a server is bound), "
        "inputs_preview (your proposed inputs, password params masked), and "
        "ready/blocking. If ready=false, relay each blocking reason and do "
        "NOT run — a password-needing workflow must be run from the builder. "
        "No side effects. You can NOT pass password values."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "workflow_id": {
                "type": "string",
                "description": "UUID of the workflow (from list_workflows).",
            },
            "inputs": {
                "type": "object",
                "description": (
                    "Optional proposed run inputs keyed by parameter id. "
                    "Password-typed params are NOT accepted and will be "
                    "masked in the preview."
                ),
                "additionalProperties": True,
            },
        },
        "required": ["workflow_id"],
        "additionalProperties": False,
    },
    handler=_handler_preview_workflow_run,
    timeout_seconds=30.0,
))


register_tool(ToolDefinition(
    name="run_workflow",
    description=(
        "Run a workflow NOW (whole-workflow execution on the autobot path). "
        "Only call this AFTER preview_workflow_run returned ready=true and the "
        "user explicitly confirmed in a LATER turn — never preview and run in "
        "the same turn. Returns {run_id, kind:'workflow', status:'queued', "
        "watch_url}; the client mounts a live run panel from watch_url. You "
        "CANNOT pass password/secret parameter values — any such key is "
        "dropped before the run; password-needing workflows must be run from "
        "the builder (preview tells you which). Counts against the user's "
        "daily execution limit."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "workflow_id": {
                "type": "string",
                "description": "UUID of the workflow to run (from list_workflows).",
            },
            "inputs": {
                "type": "object",
                "description": (
                    "Optional run inputs keyed by parameter id. Password-typed "
                    "params are NOT accepted and are dropped — do not put "
                    "secrets here."
                ),
                "additionalProperties": True,
            },
            "send_email": {
                "type": "boolean",
                "description": "Optional: email the user a run summary on completion.",
            },
            "user_email": {
                "type": "string",
                "description": "Optional recipient when send_email is true.",
            },
        },
        "required": ["workflow_id"],
        "additionalProperties": False,
    },
    handler=_handler_run_workflow,
    timeout_seconds=600.0,
))
