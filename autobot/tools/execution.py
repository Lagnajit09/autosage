"""Execution tools — investigate (X06,X07) + preview (X09) + run (X10–X12).

Async wrappers around Django's execution-engine endpoints. The JWT is
forwarded; Django scopes every queryset to the calling user, so a
cross-user run id returns 404 → we surface `{"error": ...}`.

The X06/X07 investigation tools are SAFE in both `research` and
`execution` modes (mode hard-floor `_READ_TOOLS`): they only READ run
history / status / logs, never trigger or mutate anything.

`preview_workflow_run` (X09) is ALSO side-effect-free (it never enqueues),
but lives in the `_EXEC_TOOLS` floor — it's only meaningful in `execution`
mode as the mandatory pre-run confirmation step (AD-B3). It masks
password-param values (AD-B9) and returns `needs_params` describing every
configured param so the client can render the secure confirmation form.

`run_workflow` (X10) is the first WRITE tool here. A no-param workflow it
enqueues directly; a workflow with run-time params it does NOT run — it mints
a single-use run intent and returns `awaiting_secret` (AD-B9 Layer-4b), so
the user confirms params in a composer-anchored form that POSTs the secret
browser→Django, never through Autobot. It is gated by the exec quota (X08),
drops any password-typed input before POSTing (AD-B9 Layer-2; the Django
Layer-3 backstop drops it again), and sends an Idempotency-Key = the
per-tool-call id (X01b) so a double-call in one turn collapses to one run.
`trigger_source` is fixed to `"autobot"`.
Both gating signals (user_sub, tool-call id) arrive via
`current_tool_context()`, not the handler args.

`run_script` (X11) is the script sibling: it resolves the four bindings
(script + vault/server/credential), ticks the same exec quota, and POSTs
the nested ScriptExecutionRequest to the X02 `run/async/` endpoint. There
is no SSE stream for scripts (AD-B4) — `watch_url` is the status-poll URL.
Scripts have no password-type param schema, so its `inputs_preview` masks
secret-looking keys by name heuristic (`_security.mask_inputs_by_keyname`).

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
from tools._security import _PASSWORD_MASK, mask_inputs_by_keyname

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
    the param needs a value at run time — which Autobot never transports
    (AD-B9); the user supplies it in the secure confirmation form (Layer-4b).
    Used to mask the inputs preview and strip secrets before any POST.
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


def _collect_needs_params(nodes: Any) -> list[dict[str, Any]]:
    """Describe every configured param across action nodes for the composer
    confirmation form (X17). Mirrors Django's ``build_needs_params`` shape:
    ``{param_id, name, type, has_default, is_secret, source}``.

    The form renders one row per entry — secret params as masked inputs,
    ``source=="output"`` (node references) as read-only chips, the rest as
    editable inputs pre-filled from their baked default. A param id seen on
    multiple nodes appears once, with ``has_default`` OR-ed across them.
    """
    out: list[dict[str, Any]] = []
    seen: dict[str, int] = {}
    if not isinstance(nodes, list):
        return out
    for node in nodes:
        if not isinstance(node, dict):
            continue
        params = (node.get("data") or {}).get("parameters")
        if not isinstance(params, list):
            continue
        for p in params:
            if not isinstance(p, dict):
                continue
            pid = p.get("id")
            if not pid:
                continue
            has_default = bool(p.get("value"))
            if pid in seen:
                if has_default:
                    out[seen[pid]]["has_default"] = True
                continue
            ptype = p.get("type") or "string"
            seen[pid] = len(out)
            out.append({
                "param_id": pid,
                "name": p.get("name") or pid,
                "type": ptype,
                "has_default": has_default,
                "is_secret": ptype == "password",
                "source": (p.get("sourceType") or "manual").lower(),
            })
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

    AD-B9 Layer-4(b): a workflow with run-time params (incl. a password with
    no baked value) no longer blocks the preview. `needs_params` describes
    every configured param; `run_workflow` will route it through the secure
    composer form / intent so the secret goes browser→Django, never via us.
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

    # AD-B9 Layer-4(b): a run-time password no longer blocks. Params (secret or
    # not) are confirmed in the composer form after run_workflow returns
    # awaiting_secret, so the preview is always `ready`.
    return {
        "name": wf.get("name") if isinstance(wf, dict) else None,
        "node_count": len(node_list),
        "targets": _summarize_targets(node_list),
        "inputs_preview": _mask_inputs_preview(
            proposed_inputs, set(password_params)
        ),
        "needs_params": _collect_needs_params(node_list),
        "ready": True,
        "blocking": [],
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


async def _fetch_workflow(wf_id: str, jwt: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Fetch a workflow's stored JSON. Returns (wf_dict, None) on success or
    (None, error_dict) if it can't be read — so the caller refuses the run
    rather than POSTing blind.
    """
    client = get_django_client()
    try:
        s, body = await client.request(
            method="GET", path=f"/api/workflows/{wf_id}/", jwt=jwt,
        )
    except DjangoUnavailable as e:
        return None, {"error": f"Storage unreachable: {e}"}
    if s != 200:
        return None, _django_error(s, body, "Failed to read workflow")
    return (body or {}).get("data") or {}, None


async def _create_run_intent(
    wf_id: str,
    inputs: dict[str, Any],
    args: dict[str, Any],
    name: Any,
    needs_params: list[dict[str, Any]],
    jwt: str,
) -> dict[str, Any]:
    """AD-B9 Layer-4(b): mint a single-use run intent instead of enqueuing.

    The model-proposed (already password-stripped) `inputs` are stashed in the
    intent; the user's browser will overlay the authoritative params — incl.
    any secret — straight to Django's fulfill endpoint. We return
    `awaiting_secret` so the client renders the composer confirmation form.
    """
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

    client = get_django_client()
    try:
        s, body = await client.request(
            method="POST",
            path=f"/api/execution-engine/workflows/{wf_id}/run/intent/",
            jwt=jwt,
            json_body=body_payload,
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s not in (200, 202):
        return _django_error(s, body, "Failed to prepare workflow run")

    data = (body or {}).get("data") or {}
    intent_id = data.get("run_intent_id")
    if not intent_id:
        return {"error": "Could not prepare the run (no intent id returned)."}
    return {
        "kind": "workflow",
        "status": "awaiting_secret",
        "run_intent_id": intent_id,
        # Django is authoritative; fall back to our local view if absent.
        "needs_params": data.get("needs_params") or needs_params,
        "name": name,
    }


async def _handler_run_workflow(args: dict[str, Any], jwt: str) -> dict[str, Any]:
    """Run a workflow on the `autobot` trigger path.

    Two paths, both gated by the exec quota (X08) — the tick happens once,
    before the branch, since either outcome is "the user asked to run it":
      • Any configured params → AD-B9 Layer-4(b): create a single-use intent
        and return `awaiting_secret`; the user confirms in the composer form
        and the run proceeds browser→Django (no secret ever flows through us).
      • No params → direct enqueue fast path with an Idempotency-Key = this
        tool call's id, so a double-call in one turn collapses to one run.

    Either way AD-B9 Layer-2 drops any password-typed input the model supplied
    BEFORE it leaves Autobot. The user must have confirmed via
    preview_workflow_run first (enforced by the prompt).
    """
    wf_id = args.get("workflow_id")
    if not isinstance(wf_id, str) or not wf_id.strip():
        return {"error": "Missing required argument 'workflow_id'."}
    wf_id = wf_id.strip()

    # Read the workflow once: we need its param schema to (a) strip secrets and
    # (b) decide between the intent form and the direct-enqueue path.
    wf, err = await _fetch_workflow(wf_id, jwt)
    if err:
        return err
    nodes = wf.get("nodes")
    name = wf.get("name")
    pwd_ids = set(_collect_password_params(nodes))
    needs_params = _collect_needs_params(nodes)

    # AD-B9 Layer-2 — strip password-typed inputs before they leave Autobot.
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

    # Quota AFTER validation but BEFORE either branch — an invalid request
    # shouldn't burn the user's daily allowance, but an abandoned intent does
    # consume a tick (the user asked to run it; ticking on fulfill would mean
    # duplicating the Redis quota logic in Django — not worth it).
    quota_err = await _check_exec_quota()
    if quota_err:
        return quota_err

    # Any run-time params → secure side-channel; the form IS the confirmation.
    if needs_params:
        return await _create_run_intent(wf_id, inputs, args, name, needs_params, jwt)

    # No params → existing direct-enqueue fast path.
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


# ── X11 — run_script (gated write; fire-and-forget script run) ───────


def _status_poll_url(execution_id: str) -> str:
    """Where the client polls a script run (no SSE stream for scripts — AD-B4)."""
    return f"/api/execution-engine/{execution_id}/status/"


async def _resolve_script_meta(
    script_id: int, jwt: str
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Look up a script's name + pathname (required by the run serializer).

    Returns ({name, pathname}, None) or (None, error). Uses the list
    endpoint (which carries `pathname`; the /content/ endpoint does not).
    `resolve_run_targets` re-fetches the script by id server-side, so these
    values only satisfy serializer validation — but they must be the real
    ones, and the name doubles as the chat's "Executing <script>…" label.
    """
    client = get_django_client()
    try:
        s, body = await client.request(
            method="GET", path="/api/scripts/", jwt=jwt,
        )
    except DjangoUnavailable as e:
        return None, {"error": f"Storage unreachable: {e}"}
    if s != 200:
        return None, _django_error(s, body, "Failed to look up script")
    rows = (body or {}).get("data") or []
    if isinstance(rows, list):
        for r in rows:
            if isinstance(r, dict) and str(r.get("id")) == str(script_id):
                return {
                    "name": r.get("name") or f"script {script_id}",
                    "pathname": r.get("pathname") or "",
                }, None
    return None, {
        "error": (
            f"Script {script_id} not found in your library. Call list_scripts "
            "to get a valid script id."
        )
    }


async def _handler_run_script(args: dict[str, Any], jwt: str) -> dict[str, Any]:
    """Enqueue a fire-and-forget script run via the X02 async endpoint.

    Validates the four bindings (script + vault/server/credential ids),
    ticks the exec quota (X08), then POSTs the nested ScriptExecutionRequest
    body. No live token stream (AD-B4) — the client polls watch_url. Returns
    `inputs_preview` with secret-looking keys masked (key-name heuristic, as
    scripts have no password-type schema).
    """
    # script_id is numeric; the vault triplet are UUID strings.
    script_id = args.get("script_id")
    if isinstance(script_id, str) and script_id.strip().isdigit():
        script_id = int(script_id.strip())
    if not isinstance(script_id, int):
        return {"error": "Missing or invalid 'script_id' (numeric script id)."}

    missing = [
        f for f in ("vault_id", "server_id", "credential_id")
        if not (isinstance(args.get(f), str) and args[f].strip())
    ]
    if missing:
        return {
            "error": (
                f"Missing required id(s): {', '.join(missing)}. Call "
                "list_vault_resources to resolve the vault, server, and "
                "credential UUIDs for this script — never invent them."
            )
        }

    meta, err = await _resolve_script_meta(script_id, jwt)
    if err:
        return err

    raw_inputs = args.get("inputs")
    inputs = raw_inputs if isinstance(raw_inputs, dict) else {}

    quota_err = await _check_exec_quota()
    if quota_err:
        return quota_err

    body_payload = {
        "script_details": {
            "script_id": script_id,
            "script_name": meta["name"],
            "pathname": meta["pathname"],
        },
        "vault_details": {
            "vault_id": args["vault_id"].strip(),
            "server_id": args["server_id"].strip(),
            "credential_id": args["credential_id"].strip(),
        },
        "inputs": inputs,
    }

    client = get_django_client()
    try:
        s, body = await client.request(
            method="POST",
            path="/api/execution-engine/run/async/",
            jwt=jwt,
            json_body=body_payload,
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s not in (200, 202):
        return _django_error(s, body, "Failed to start script run")

    data = (body or {}).get("data") or {}
    run_id = data.get("execution_id")
    if not run_id:
        return {"error": "Script run started but no execution id was returned."}
    return {
        "run_id": run_id,
        "kind": "script",
        "status": data.get("status") or "pending",
        "watch_url": _status_poll_url(str(run_id)),
        "script_name": meta["name"],
        "server_id": args["server_id"].strip(),
        # Secret-looking keys masked (key-name heuristic — scripts have no
        # password-type schema). Powers the chat's "Executing <script> on
        # <server> with parameters: (…)" line without echoing secrets.
        "inputs_preview": mask_inputs_by_keyname(inputs),
    }


# ── X12 — rerun_workflow (gated write; re-enqueues a prior run) ──────


async def _handler_rerun_workflow(args: dict[str, Any], jwt: str) -> dict[str, Any]:
    """Re-enqueue a prior workflow run as a fresh run (whole-workflow only).

    The investigate→fix→rerun endpoint of the failure loop. Ticks the exec
    quota (X08) and sends an Idempotency-Key = this tool call's id (X01b) so
    a double-call collapses to one new run. The server fixes
    `trigger_source="autobot"`, so the Layer-3 backstop drops any password
    that sneaks into an `inputs` override; omit `inputs` to reuse the prior
    run's (already-masked) inputs. There is NO resume-from-failed-node.
    """
    run_id, err = _require_run_id(args)
    if err:
        return err

    body_payload: dict[str, Any] = {}
    override = args.get("inputs")
    if isinstance(override, dict):
        body_payload["inputs"] = override

    quota_err = await _check_exec_quota()
    if quota_err:
        return quota_err

    req_headers: dict[str, str] = {}
    tc_id = current_tool_context().tool_call_id
    if tc_id:
        req_headers["Idempotency-Key"] = tc_id

    client = get_django_client()
    try:
        s, body = await client.request(
            method="POST",
            path=f"/api/execution-engine/workflows/runs/{run_id}/rerun/",
            jwt=jwt,
            json_body=body_payload,
            headers=req_headers or None,
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s not in (200, 202):
        return _django_error(s, body, "Failed to rerun workflow")

    data = (body or {}).get("data") or {}
    new_run_id = data.get("workflow_run_id")
    if not new_run_id:
        return {"error": "Rerun started but no run id was returned."}
    out: dict[str, Any] = {
        "run_id": new_run_id,
        "kind": "workflow",
        "status": data.get("status") or "queued",
        "watch_url": _watch_url(str(new_run_id)),
    }
    if data.get("idempotent"):
        out["idempotent"] = True
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
        "inputs_preview (your proposed inputs, password params masked), "
        "needs_params (every configured param: id/name/type/has_default/"
        "is_secret/source), and ready/blocking. A workflow with run-time "
        "params (incl. passwords) is now ready — run_workflow routes it "
        "through a secure confirmation form. No side effects. You can NOT "
        "pass password values."
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
        "the same turn. For a no-param workflow this enqueues immediately and "
        "returns {run_id, kind:'workflow', status:'queued', watch_url} — the "
        "client mounts a live run panel. For a workflow WITH run-time params "
        "it returns {status:'awaiting_secret', run_intent_id, needs_params, "
        "name} instead of running: the user fills a secure form anchored at "
        "the message box and the run proceeds via the intent. You CANNOT pass "
        "password/secret values — any such key is dropped; the user supplies "
        "them in that form, never through you. Counts against the user's "
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


register_tool(ToolDefinition(
    name="run_script",
    description=(
        "Run a single script NOW on a target server (fire-and-forget). You "
        "MUST supply the script id plus the vault, server, and credential "
        "UUIDs — call list_vault_resources first to resolve them; never "
        "invent ids. There is NO live log stream for script runs: poll "
        "get_script_run with the returned run_id for status, then "
        "read_run_logs(kind='script') for output. Returns {run_id, "
        "kind:'script', status, watch_url, script_name, server_id, "
        "inputs_preview}. Do NOT put secrets in inputs — secret-looking "
        "values are masked in the preview and logs. Counts against the "
        "user's daily execution limit."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "script_id": {
                "type": "integer",
                "description": "Numeric id of the script to run (from list_scripts).",
            },
            "vault_id": {
                "type": "string",
                "description": "UUID of the vault (from list_vault_resources).",
            },
            "server_id": {
                "type": "string",
                "description": "UUID of the target server within the vault.",
            },
            "credential_id": {
                "type": "string",
                "description": "UUID of the credential within the vault.",
            },
            "inputs": {
                "type": "object",
                "description": (
                    "Optional {{PLACEHOLDER}} substitution values for the "
                    "script. Do not include passwords/secrets."
                ),
                "additionalProperties": True,
            },
        },
        "required": ["script_id", "vault_id", "server_id", "credential_id"],
        "additionalProperties": False,
    },
    handler=_handler_run_script,
    timeout_seconds=600.0,
))


register_tool(ToolDefinition(
    name="rerun_workflow",
    description=(
        "Re-run a prior workflow run as a fresh, whole-workflow run (there is "
        "NO resume-from-failed-node). Use this to close the investigate→fix→"
        "rerun loop: after you've diagnosed a failure and the user approved a "
        "fix (e.g. update_script/update_workflow), call this with the FAILED "
        "run's id to try again. Pass `inputs` only to override the prior run's "
        "inputs; omit it to reuse them. You cannot supply password values. "
        "Returns {run_id, kind:'workflow', status:'queued', watch_url} for the "
        "NEW run. Counts against the user's daily execution limit. Propose ONE "
        "fix and rerun ONCE, then ask the user before iterating again."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "run_id": {
                "type": "string",
                "description": (
                    "UUID of the PRIOR workflow run to re-run (e.g. the failed "
                    "run from get_workflow_run / get_execution_histories)."
                ),
            },
            "inputs": {
                "type": "object",
                "description": (
                    "Optional inputs override for the new run. Omit to reuse "
                    "the prior run's inputs. Password params are not accepted."
                ),
                "additionalProperties": True,
            },
        },
        "required": ["run_id"],
        "additionalProperties": False,
    },
    handler=_handler_rerun_workflow,
    timeout_seconds=600.0,
))
