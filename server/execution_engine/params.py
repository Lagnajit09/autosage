"""
Parameter resolution for workflow node execution.

Before a node executes, its ``parameters`` list must be resolved into a flat
dict of ``{name: value}`` pairs that the exec-worker understands.

Parameter source types
──────────────────────
Each entry in ``node.data.parameters`` has a ``sourceType`` field:

  manual   — the value is a literal string typed by the user.
             e.g.  { "name": "THRESHOLD", "value": "80", "sourceType": "manual" }
             Resolved as-is (with type-coercion to int/float/bool if requested).

  output   — the value is a template reference to a previous node's JSON output.
             e.g.  { "name": "MEMORY", "value": "{{action-xxx.output.MEMORY}}", "sourceType": "output" }
             Resolved by looking up node_outputs[action-xxx]["MEMORY"] at runtime.

Condition fields (on decision nodes) use the same ``{{node-id.output.FIELD}}``
syntax and are resolved via ``resolve_condition_value()``.

Public API
──────────
  resolve_parameters(parameters, node_outputs) -> dict[str, Any]
  resolve_condition_value(raw_value, node_outputs) -> Any
  resolve_template_string(raw, node_outputs) -> str
"""

from __future__ import annotations

import re
from typing import Any

# ── Template pattern — matches {{node-id.output.FIELD}} ──────────────────────
_OUTPUT_REF_RE = re.compile(r"\{\{([\w-]+)\.output\.([\w]+)\}\}")

# ── Source type constants ─────────────────────────────────────────────────────
SOURCE_MANUAL = "manual"
SOURCE_OUTPUT = "output"


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _coerce_value(raw: Any, param_type: str) -> Any:
    """
    Best-effort type coercion based on the parameter's declared ``type`` field.

    Supported types: ``"number"``, ``"boolean"``, ``"string"``.
    Falls back to the original string if coercion fails.

    Args:
        raw:        The raw string value (already resolved from template if needed).
        param_type: The parameter type declared in the node JSON.

    Returns:
        A Python int, float, bool, or str depending on ``param_type``.
    """
    if raw is None or raw == "":
        return raw

    ptype = (param_type or "string").lower()

    if ptype == "number":
        try:
            # Prefer int for whole numbers (e.g. "80" -> 80, not 80.0)
            if isinstance(raw, (int, float)):
                return raw
            s = str(raw)
            return int(s) if "." not in s else float(s)
        except (ValueError, TypeError):
            return raw

    if ptype == "boolean":
        if isinstance(raw, bool):
            return raw
        return str(raw).strip().lower() in ("true", "1", "yes")

    # Default: string
    return str(raw)


def _resolve_single_ref(node_id: str, field: str, node_outputs: dict[str, Any]) -> Any:
    """
    Look up the value of ``{{node_id.output.field}}`` in ``node_outputs``.

    Args:
        node_id:      ID of the producer node (e.g. ``"action-1771310603866"``).
        field:        Output field name (e.g. ``"MEMORY"``).
        node_outputs: Dict mapping completed node IDs -> their parsed JSON output.

    Returns:
        The resolved value.

    Raises:
        KeyError:  If ``node_id`` hasn't completed yet (missing from node_outputs).
        KeyError:  If ``field`` is not present in the producer node's output.
        TypeError: If the producer node's output is not a dict.
    """
    if node_id not in node_outputs:
        raise KeyError(
            f"Cannot resolve '{{{{action-{node_id}.output.{field}}}}}': "
            f"node '{node_id}' has no output recorded yet. "
            f"Ensure it executed successfully before this node."
        )

    output = node_outputs[node_id]

    if not isinstance(output, dict):
        raise TypeError(
            f"Node '{node_id}' output is not a dict (got {type(output).__name__}). "
            f"Cannot resolve field '{field}'."
        )

    if field not in output:
        available = ", ".join(output.keys()) or "(none)"
        raise KeyError(
            f"Field '{field}' not found in node '{node_id}' output. "
            f"Available fields: {available}."
        )

    return output[field]


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def resolve_template_string(raw: str, node_outputs: dict[str, Any]) -> str:
    """
    Replace **all** ``{{node-id.output.FIELD}}`` placeholders in a string with
    their resolved values, returning a plain string.

    Useful for condition ``field`` / ``value`` strings on decision nodes that
    embed a template reference inside a larger composite string.

    If the entire string is a single template reference (most common case), it
    returns the resolved value cast to ``str``.
    Use ``resolve_condition_value()`` for scalar (native-type) extraction.

    Args:
        raw:          Input string potentially containing ``{{...}}`` references.
        node_outputs: Dict mapping completed node IDs -> their parsed JSON output.

    Returns:
        String with all references substituted.

    Raises:
        KeyError / TypeError: Propagated from ``_resolve_single_ref()``.
    """
    def _replace(match: re.Match) -> str:
        node_id = match.group(1)
        field = match.group(2)
        resolved = _resolve_single_ref(node_id, field, node_outputs)
        return str(resolved)

    return _OUTPUT_REF_RE.sub(_replace, raw)


def resolve_condition_value(raw_value: str, node_outputs: dict[str, Any]) -> Any:
    """
    Resolve a condition ``field`` or ``value`` string from a decision node.

    Unlike ``resolve_template_string()``, when the *entire* string is a single
    ``{{...}}`` reference this function returns the **native Python value**
    (int, float, bool, str, etc.) so numeric comparisons work correctly.

    Examples::

        # Entire string is a ref -> return native value
        resolve_condition_value("{{action-xxx.output.MEMORY}}", outputs)
        # -> 87  (int, from the output dict)

        # Mixed/composite string -> substitute all refs, return str
        resolve_condition_value("used-{{action-xxx.output.MEMORY}}%", outputs)
        # -> "used-87%"

        # Plain literal -> return as-is (no substitution needed)
        resolve_condition_value("80", {})
        # -> "80"

    Args:
        raw_value:    Condition value/field string from the node JSON.
        node_outputs: Dict mapping completed node IDs -> their parsed JSON output.

    Returns:
        Resolved Python value (native type for single refs, str for composites).
    """
    if not raw_value or not isinstance(raw_value, str):
        return raw_value

    stripped = raw_value.strip()

    # Entire value is one single reference -> return native Python value
    match = _OUTPUT_REF_RE.fullmatch(stripped)
    if match:
        return _resolve_single_ref(match.group(1), match.group(2), node_outputs)

    # Partial / composite template -> substitute all refs and return as string
    if _OUTPUT_REF_RE.search(raw_value):
        return resolve_template_string(raw_value, node_outputs)

    # Plain literal -> return unchanged
    return raw_value


def resolve_parameters(
    parameters: list[dict[str, Any]],
    node_outputs: dict[str, Any],
) -> dict[str, Any]:
    """
    Resolve a node's ``parameters`` list into a flat ``{name: value}`` dict
    ready to be passed to the exec-worker at execution time.

    Resolution rules
    ----------------
    * ``sourceType == "manual"``
        The ``value`` field is a literal string.  It is coerced to the
        appropriate Python type via the parameter's ``type`` field
        (``"number"`` | ``"boolean"`` | ``"string"``).

    * ``sourceType == "output"``
        The ``value`` field contains a ``{{node-id.output.FIELD}}`` template
        reference.  It is resolved from ``node_outputs`` and then coerced.
        If the declared ``value`` has no template (edge-case: user cleared it),
        it falls back to a plain-literal coercion.

    Parameters with an empty ``name`` are silently skipped.

    Args:
        parameters:   List of parameter dicts from ``node.data.parameters``.
        node_outputs: Dict mapping completed node IDs -> their parsed JSON output.
                      Keys are node IDs (e.g. ``"action-1771310603866"``).
                      Values are the parsed dict from the node's JSON stdout,
                      i.e. the ``jsonSchema``-compliant output the script emitted.

    Returns:
        ``{param_name: resolved_value, ...}``

    Raises:
        ValueError: If a parameter has an unsupported ``sourceType``.
        KeyError:   If an ``output`` reference cannot be resolved (producer node
                    not yet finished or field missing from its output dict).
        TypeError:  If a producer node's output is not a mapping/dict.

    Example
    -------
    Given the ``demo_workflow.json`` decision node::

        parameters = [
            {
                "name": "THRESHOLD",
                "type": "number",
                "value": "80",
                "sourceType": "manual",
            },
            {
                "name": "MEMORY",
                "type": "number",
                "value": "{{action-1771310603866.output.MEMORY}}",
                "sourceType": "output",
            },
        ]
        node_outputs = {
            "action-1771310603866": {"MEMORY": 87}
        }

        resolve_parameters(parameters, node_outputs)
        # -> {"THRESHOLD": 80, "MEMORY": 87}
    """
    resolved: dict[str, Any] = {}

    for param in parameters:
        name: str = (param.get("name") or "").strip()
        if not name:
            # Unnamed parameters cannot be meaningfully passed to the script
            continue

        source_type: str = (param.get("sourceType") or SOURCE_MANUAL).lower()
        raw_value: Any = param.get("value", "")
        param_type: str = param.get("type", "string")

        if source_type == SOURCE_MANUAL:
            # Literal value — coerce to declared type
            resolved[name] = _coerce_value(raw_value, param_type)

        elif source_type == SOURCE_OUTPUT:
            # Template reference — resolve from previous node's output, then coerce
            raw_str = str(raw_value) if raw_value is not None else ""

            # Most common: the entire value is exactly one {{...}} placeholder
            single_match = _OUTPUT_REF_RE.fullmatch(raw_str.strip())
            if single_match:
                native = _resolve_single_ref(
                    single_match.group(1), single_match.group(2), node_outputs
                )
                resolved[name] = _coerce_value(native, param_type)

            elif _OUTPUT_REF_RE.search(raw_str):
                # Composite string: substitute all refs, keep as string
                resolved[name] = resolve_template_string(raw_str, node_outputs)

            else:
                # Declared as output but no template found — treat as literal
                # (happens if the user cleared the reference without changing sourceType)
                resolved[name] = _coerce_value(raw_str, param_type)

        else:
            raise ValueError(
                f"Parameter '{name}' has unsupported sourceType='{source_type}'. "
                f"Expected '{SOURCE_MANUAL}' or '{SOURCE_OUTPUT}'."
            )

    return resolved
