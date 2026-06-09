"""Shared tool-layer security helpers (AD-B9).

The invariant: a `password`-typed workflow parameter value must NEVER reach
the model. Workflow `nodes[].data.parameters[]` entries have the shape
(see `client/src/utils/types.ts::Parameter`):

    {"id": str, "name": str, "type": "string"|"number"|"boolean"|"password",
     "description"?: str, "value"?: str, "sourceType"?: "manual"|"output"}

The secret-bearing field is `value`. A node can bake a default value straight
into the workflow JSON, so `read_workflow` / `preview_workflow_run` must strip
it (AD-B9 Layer 1) BEFORE the JSON is ever returned to the LLM. The model
still sees the param exists (id, name, type=password) — just not its value.

This is the LLM-boundary mask. It is independent of, and complementary to,
the server-side execution-time drop in `run_builder.py` (AD-B9 Layer 3): one
keeps secrets out of the model's view, the other keeps them out of the
worker/DB on the autobot trigger path.
"""

from __future__ import annotations

import copy
from typing import Any

_PASSWORD_MASK = "*****"

# Scripts (unlike workflow nodes) have NO password-typed param schema —
# their `inputs` are a free-form {{PLACEHOLDER}} dict, so there is no `type`
# field to identify a secret. For run_script's returned `inputs_preview` we
# fall back to a conservative KEY-NAME heuristic: any input whose key looks
# secret is masked before the dict reaches the model/client. This is
# best-effort hygiene only — the authoritative secret handling is still
# Django/worker log masking + TLS transport of the real value to Django.
_SECRET_KEY_HINTS = (
    "password", "passwd", "pwd", "secret", "token",
    "api_key", "apikey", "access_key", "private_key", "passphrase",
)


def looks_secret(key: Any) -> bool:
    """True if a dict key name suggests it holds a secret (case-insensitive)."""
    if not isinstance(key, str):
        return False
    k = key.lower()
    return any(hint in k for hint in _SECRET_KEY_HINTS)


def mask_inputs_by_keyname(inputs: Any) -> dict[str, Any]:
    """Return a copy of `inputs` with secret-looking keys masked to ``*****``.

    Only masks keys with a non-empty value (an empty value can't leak). Used
    by run_script where no param-type schema exists. Non-dict input → {}.
    """
    if not isinstance(inputs, dict):
        return {}
    return {
        k: (_PASSWORD_MASK if looks_secret(k) and v else v)
        for k, v in inputs.items()
    }


def mask_password_params(workflow: Any) -> Any:
    """Return a deep copy of `workflow` with every password-typed parameter
    `value` replaced by ``"*****"``.

    Walks `nodes[].data.parameters[]` (the only place parameter values live).
    Non-password params and all other fields are untouched. A non-password
    param that happens to be named "password" is NOT masked — only
    `type == "password"` triggers the mask, matching how the executor and
    log-masking identify secrets (`tasks.py`/`run_builder.py`).

    Safe on malformed input: anything that isn't the expected dict/list shape
    is passed through unchanged rather than raising — a tool must never crash
    the dispatcher (it would still mask whatever it CAN reach).
    """
    if not isinstance(workflow, dict):
        return workflow

    masked = copy.deepcopy(workflow)
    nodes = masked.get("nodes")
    if not isinstance(nodes, list):
        return masked

    for node in nodes:
        if not isinstance(node, dict):
            continue
        data = node.get("data")
        if not isinstance(data, dict):
            continue
        params = data.get("parameters")
        if not isinstance(params, list):
            continue
        for p in params:
            if not isinstance(p, dict):
                continue
            if p.get("type") == "password" and p.get("value"):
                p["value"] = _PASSWORD_MASK

    return masked
