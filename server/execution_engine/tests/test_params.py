"""
Tests for execution_engine/params.py

Run with:
    pytest server/execution_engine/test_params.py -v
"""

import pytest
from execution_engine.params import (
    resolve_parameters,
    resolve_condition_value,
    resolve_template_string,
)

# ─────────────────────────────────────────────────────────────────────────────
# Fixtures: node IDs match demo_workflow.json
# ─────────────────────────────────────────────────────────────────────────────

CHECK_MEM_NODE = "action-1771310603866"
DECISION_NODE  = "decision-1771310615633"


# ─────────────────────────────────────────────────────────────────────────────
# resolve_parameters — manual source
# ─────────────────────────────────────────────────────────────────────────────

class TestResolveParametersManual:
    """Parameters with sourceType='manual' are literal values."""

    def test_number_integer(self):
        params = [{"name": "THRESHOLD", "type": "number", "value": "80", "sourceType": "manual"}]
        result = resolve_parameters(params, {})
        assert result == {"THRESHOLD": 80}
        assert isinstance(result["THRESHOLD"], int)

    def test_number_float(self):
        params = [{"name": "RATIO", "type": "number", "value": "3.14", "sourceType": "manual"}]
        result = resolve_parameters(params, {})
        assert result["RATIO"] == pytest.approx(3.14)
        assert isinstance(result["RATIO"], float)

    def test_number_already_int(self):
        params = [{"name": "N", "type": "number", "value": 42, "sourceType": "manual"}]
        assert resolve_parameters(params, {})["N"] == 42

    def test_boolean_true_variants(self):
        for v in ("true", "True", "TRUE", "1", "yes", "YES"):
            params = [{"name": "FLAG", "type": "boolean", "value": v, "sourceType": "manual"}]
            assert resolve_parameters(params, {})["FLAG"] is True, f"failed for value={v!r}"

    def test_boolean_false_variants(self):
        for v in ("false", "False", "0", "no", "NO"):
            params = [{"name": "FLAG", "type": "boolean", "value": v, "sourceType": "manual"}]
            assert resolve_parameters(params, {})["FLAG"] is False, f"failed for value={v!r}"

    def test_string_type(self):
        params = [{"name": "ENV", "type": "string", "value": "production", "sourceType": "manual"}]
        assert resolve_parameters(params, {})["ENV"] == "production"

    def test_string_default_when_type_missing(self):
        params = [{"name": "ENV", "value": "production", "sourceType": "manual"}]
        assert resolve_parameters(params, {})["ENV"] == "production"

    def test_empty_name_is_skipped(self):
        params = [
            {"name": "", "type": "string", "value": "ignored", "sourceType": "manual"},
            {"name": "KEEP", "type": "string", "value": "ok", "sourceType": "manual"},
        ]
        result = resolve_parameters(params, {})
        assert result == {"KEEP": "ok"}

    def test_multiple_params(self):
        params = [
            {"name": "A", "type": "number",  "value": "10",    "sourceType": "manual"},
            {"name": "B", "type": "boolean", "value": "false", "sourceType": "manual"},
            {"name": "C", "type": "string",  "value": "hello", "sourceType": "manual"},
        ]
        assert resolve_parameters(params, {}) == {"A": 10, "B": False, "C": "hello"}

    def test_empty_value_passthrough(self):
        params = [{"name": "OPT", "type": "string", "value": "", "sourceType": "manual"}]
        assert resolve_parameters(params, {})["OPT"] == ""

    def test_invalid_number_fallback_to_string(self):
        """If coercion fails, the raw string is returned as-is."""
        params = [{"name": "X", "type": "number", "value": "not-a-number", "sourceType": "manual"}]
        assert resolve_parameters(params, {})["X"] == "not-a-number"


# ─────────────────────────────────────────────────────────────────────────────
# resolve_parameters — output source
# ─────────────────────────────────────────────────────────────────────────────

class TestResolveParametersOutput:
    """Parameters with sourceType='output' reference prior node outputs."""

    def test_single_ref_integer(self):
        """{{node.output.FIELD}} where the field value is 87 (int)."""
        params = [
            {
                "name": "MEMORY",
                "type": "number",
                "value": f"{{{{{CHECK_MEM_NODE}.output.MEMORY}}}}",
                "sourceType": "output",
            }
        ]
        node_outputs = {CHECK_MEM_NODE: {"MEMORY": 87}}
        result = resolve_parameters(params, node_outputs)
        assert result == {"MEMORY": 87}

    def test_single_ref_string_then_coerced_to_int(self):
        """Output provides a string "87"; param type=number should coerce to 87."""
        params = [
            {
                "name": "MEMORY",
                "type": "number",
                "value": f"{{{{{CHECK_MEM_NODE}.output.MEMORY}}}}",
                "sourceType": "output",
            }
        ]
        node_outputs = {CHECK_MEM_NODE: {"MEMORY": "87"}}
        result = resolve_parameters(params, node_outputs)
        assert result == {"MEMORY": 87}
        assert isinstance(result["MEMORY"], int)

    def test_single_ref_boolean_coercion(self):
        params = [
            {
                "name": "IS_HEALTHY",
                "type": "boolean",
                "value": f"{{{{{CHECK_MEM_NODE}.output.IS_HEALTHY}}}}",
                "sourceType": "output",
            }
        ]
        node_outputs = {CHECK_MEM_NODE: {"IS_HEALTHY": True}}
        result = resolve_parameters(params, node_outputs)
        assert result["IS_HEALTHY"] is True

    def test_composite_string_ref(self):
        """Value embeds a ref inside a larger string → stays string."""
        params = [
            {
                "name": "MSG",
                "type": "string",
                "value": f"Memory is {{{{{CHECK_MEM_NODE}.output.MEMORY}}}}%",
                "sourceType": "output",
            }
        ]
        node_outputs = {CHECK_MEM_NODE: {"MEMORY": 87}}
        result = resolve_parameters(params, node_outputs)
        assert result["MSG"] == "Memory is 87%"

    def test_missing_producer_node_raises_key_error(self):
        params = [
            {
                "name": "MEMORY",
                "type": "number",
                "value": f"{{{{{CHECK_MEM_NODE}.output.MEMORY}}}}",
                "sourceType": "output",
            }
        ]
        with pytest.raises(KeyError, match=CHECK_MEM_NODE):
            resolve_parameters(params, {})

    def test_missing_field_raises_key_error(self):
        params = [
            {
                "name": "MISSING",
                "type": "string",
                "value": f"{{{{{CHECK_MEM_NODE}.output.NONEXISTENT}}}}",
                "sourceType": "output",
            }
        ]
        node_outputs = {CHECK_MEM_NODE: {"MEMORY": 87}}
        with pytest.raises(KeyError, match="NONEXISTENT"):
            resolve_parameters(params, node_outputs)

    def test_non_dict_output_raises_type_error(self):
        params = [
            {
                "name": "X",
                "type": "string",
                "value": f"{{{{{CHECK_MEM_NODE}.output.FIELD}}}}",
                "sourceType": "output",
            }
        ]
        node_outputs = {CHECK_MEM_NODE: "not-a-dict"}
        with pytest.raises(TypeError):
            resolve_parameters(params, node_outputs)

    def test_output_sourcetype_no_template_falls_back_to_literal(self):
        """Edge case: sourceType=output but value has no {{...}} — treat as literal."""
        params = [
            {
                "name": "X",
                "type": "number",
                "value": "99",
                "sourceType": "output",
            }
        ]
        assert resolve_parameters(params, {})["X"] == 99

    def test_unsupported_source_type_raises_value_error(self):
        params = [
            {"name": "X", "type": "string", "value": "v", "sourceType": "webhook"}
        ]
        with pytest.raises(ValueError, match="unsupported sourceType"):
            resolve_parameters(params, {})


# ─────────────────────────────────────────────────────────────────────────────
# resolve_parameters — Integration: demo_workflow.json decision node
# ─────────────────────────────────────────────────────────────────────────────

class TestResolveParametersDemoWorkflow:
    """
    Mirrors the exact parameters defined on the decision node in
    server/seed/demo_workflow.json.
    """

    PARAMS = [
        {
            "id": "param-1771310790430-0.5614646481121536",
            "name": "MEMORY",
            "type": "number",
            "value": "{{action-1771310603866.output.MEMORY}}",
            "sourceType": "output",
            "description": "",
        },
        {
            "id": "param-1775151985225-0.3959100659205089",
            "name": "IS_ADMIN",
            "type": "boolean",
            "value": "",
            "sourceType": "manual",
            "description": "",
        },
    ]

    def test_full_resolution(self):
        node_outputs = {CHECK_MEM_NODE: {"MEMORY": 87}}
        result = resolve_parameters(self.PARAMS, node_outputs)
        assert result["MEMORY"] == 87
        assert isinstance(result["MEMORY"], int)
        # Empty boolean value should pass through as empty string (coercion skipped)
        assert result["IS_ADMIN"] == ""

    def test_action_node_manual_param(self):
        """The action node (CheckMEMORY) has a single manual THRESHOLD param."""
        params = [
            {
                "id": "param-1771310702179-0.5436742152871394",
                "name": "THRESHOLD",
                "type": "number",
                "value": "80",
                "sourceType": "manual",
                "description": "",
            }
        ]
        result = resolve_parameters(params, {})
        assert result == {"THRESHOLD": 80}


# ─────────────────────────────────────────────────────────────────────────────
# resolve_condition_value
# ─────────────────────────────────────────────────────────────────────────────

class TestResolveConditionValue:

    def test_single_ref_returns_native_value(self):
        raw = f"{{{{{CHECK_MEM_NODE}.output.MEMORY}}}}"
        node_outputs = {CHECK_MEM_NODE: {"MEMORY": 87}}
        result = resolve_condition_value(raw, node_outputs)
        assert result == 87
        assert isinstance(result, int)

    def test_plain_literal_returned_unchanged(self):
        assert resolve_condition_value("80", {}) == "80"

    def test_composite_ref_returns_string(self):
        raw = f"threshold-{{{{{CHECK_MEM_NODE}.output.MEMORY}}}}"
        node_outputs = {CHECK_MEM_NODE: {"MEMORY": 87}}
        result = resolve_condition_value(raw, node_outputs)
        assert result == "threshold-87"

    def test_none_passthrough(self):
        assert resolve_condition_value(None, {}) is None

    def test_empty_string_passthrough(self):
        assert resolve_condition_value("", {}) == ""

    def test_missing_node_raises_key_error(self):
        raw = f"{{{{{CHECK_MEM_NODE}.output.MEMORY}}}}"
        with pytest.raises(KeyError, match=CHECK_MEM_NODE):
            resolve_condition_value(raw, {})

    def test_demo_workflow_condition_field(self):
        """
        Mirrors the condition on decision-1771310615633 in demo_workflow.json:
          field: "{{action-1771310603866.output.MEMORY}}"
          operator: ">="
          value: "80"  (manual literal)
        """
        field_raw = "{{action-1771310603866.output.MEMORY}}"
        value_raw = "80"
        node_outputs = {CHECK_MEM_NODE: {"MEMORY": 87}}

        field = resolve_condition_value(field_raw, node_outputs)
        value = resolve_condition_value(value_raw, node_outputs)

        # Numeric comparison should work directly after resolution
        assert field >= int(value)


# ─────────────────────────────────────────────────────────────────────────────
# resolve_template_string
# ─────────────────────────────────────────────────────────────────────────────

class TestResolveTemplateString:

    def test_single_ref_returns_str(self):
        raw = f"{{{{{CHECK_MEM_NODE}.output.MEMORY}}}}"
        node_outputs = {CHECK_MEM_NODE: {"MEMORY": 87}}
        result = resolve_template_string(raw, node_outputs)
        # Always returns str
        assert result == "87"
        assert isinstance(result, str)

    def test_multiple_refs_in_one_string(self):
        raw = f"mem={{{{{CHECK_MEM_NODE}.output.MEMORY}}}}, cpu={{{{{CHECK_MEM_NODE}.output.CPU}}}}"
        node_outputs = {CHECK_MEM_NODE: {"MEMORY": 87, "CPU": 45}}
        assert resolve_template_string(raw, node_outputs) == "mem=87, cpu=45"

    def test_no_refs_unchanged(self):
        assert resolve_template_string("plain string", {}) == "plain string"

    def test_missing_node_raises_key_error(self):
        raw = f"{{{{{CHECK_MEM_NODE}.output.MEMORY}}}}"
        with pytest.raises(KeyError):
            resolve_template_string(raw, {})
