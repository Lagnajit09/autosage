"""
Tests for execution_engine.helpers.params.resolve_script_inputs and the
secret-name heuristic used by parameterized standalone script execution.

Run with:
    pytest server/execution_engine/tests/test_script_params.py -v
"""

from execution_engine.helpers.params import (
    resolve_script_inputs,
    is_secret_param_name,
)


class TestIsSecretParamName:
    def test_flags_common_secret_names(self):
        for name in [
            "PASSWORD", "db_password", "API_KEY", "apikey", "access_key",
            "SECRET", "auth_token", "PRIVATE_KEY", "passphrase", "credential",
        ]:
            assert is_secret_param_name(name), f"{name!r} should be secret"

    def test_non_secret_names(self):
        for name in ["HOST", "THRESHOLD", "region", "count", "USERNAME"]:
            assert not is_secret_param_name(name), f"{name!r} should not be secret"


class TestResolveScriptInputs:
    def test_coerces_by_metadata_type(self):
        meta = [
            {"name": "THRESHOLD", "type": "number"},
            {"name": "ENABLED", "type": "boolean"},
            {"name": "ENV", "type": "string"},
        ]
        inputs = {"THRESHOLD": "80", "ENABLED": "true", "ENV": "prod"}
        resolved, secret_names, secret_values = resolve_script_inputs(inputs, meta)
        assert resolved == {"THRESHOLD": 80, "ENABLED": True, "ENV": "prod"}
        assert secret_names == []
        assert secret_values == []

    def test_defaults_to_string_without_metadata(self):
        resolved, _, _ = resolve_script_inputs({"HOST": "prod-1"}, None)
        assert resolved == {"HOST": "prod-1"}

    def test_secret_by_metadata_flag(self):
        meta = [{"name": "MY_VALUE", "type": "string", "secret": True}]
        resolved, secret_names, secret_values = resolve_script_inputs(
            {"MY_VALUE": "hunter2"}, meta
        )
        assert secret_names == ["MY_VALUE"]
        assert secret_values == ["hunter2"]
        assert resolved == {"MY_VALUE": "hunter2"}

    def test_secret_by_password_type(self):
        meta = [{"name": "PW", "type": "password"}]
        _, secret_names, secret_values = resolve_script_inputs({"PW": "s3cr3t"}, meta)
        assert secret_names == ["PW"]
        assert secret_values == ["s3cr3t"]

    def test_secret_by_name_heuristic_without_metadata(self):
        _, secret_names, secret_values = resolve_script_inputs(
            {"API_TOKEN": "abc123"}, []
        )
        assert secret_names == ["API_TOKEN"]
        assert secret_values == ["abc123"]

    def test_empty_secret_value_not_collected(self):
        meta = [{"name": "TOKEN", "type": "password"}]
        _, secret_names, secret_values = resolve_script_inputs({"TOKEN": ""}, meta)
        assert secret_names == ["TOKEN"]
        assert secret_values == []  # nothing to mask

    def test_secret_values_sorted_longest_first(self):
        meta = [
            {"name": "T1", "type": "password"},
            {"name": "T2", "type": "password"},
        ]
        _, _, secret_values = resolve_script_inputs({"T1": "abc", "T2": "abcdef"}, meta)
        assert secret_values == ["abcdef", "abc"]

    def test_empty_inputs(self):
        assert resolve_script_inputs({}, [{"name": "X", "type": "string"}]) == (
            {},
            [],
            [],
        )
