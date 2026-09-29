from django.test import TestCase

from scripts.serializers import ScriptParametersUpdateSerializer


class ScriptParametersUpdateSerializerTests(TestCase):
    """Validation rules for the /scripts/<pk>/parameters/ metadata payload."""

    def test_valid_payload(self):
        s = ScriptParametersUpdateSerializer(
            data={
                "parameters": [
                    {"name": "HOST", "type": "string", "default": "prod-1"},
                    {"name": "THRESHOLD", "type": "number", "default": "80"},
                ]
            }
        )
        self.assertTrue(s.is_valid(), s.errors)
        params = s.validated_data["parameters"]
        self.assertEqual(params[0]["name"], "HOST")
        self.assertEqual(params[1]["type"], "number")

    def test_password_type_forces_secret_and_strips_default(self):
        s = ScriptParametersUpdateSerializer(
            data={"parameters": [{"name": "TOKEN", "type": "password", "default": "leak"}]}
        )
        self.assertTrue(s.is_valid(), s.errors)
        p = s.validated_data["parameters"][0]
        self.assertTrue(p["secret"])
        self.assertEqual(p["default"], "")

    def test_secret_flag_strips_default(self):
        s = ScriptParametersUpdateSerializer(
            data={
                "parameters": [
                    {"name": "MY_VALUE", "type": "string", "secret": True, "default": "x"}
                ]
            }
        )
        self.assertTrue(s.is_valid(), s.errors)
        p = s.validated_data["parameters"][0]
        self.assertTrue(p["secret"])
        self.assertEqual(p["default"], "")

    def test_invalid_identifier_name_rejected(self):
        s = ScriptParametersUpdateSerializer(
            data={"parameters": [{"name": "1BAD NAME", "type": "string"}]}
        )
        self.assertFalse(s.is_valid())
        self.assertIn("parameters", s.errors)

    def test_duplicate_names_case_insensitive_rejected(self):
        s = ScriptParametersUpdateSerializer(
            data={
                "parameters": [
                    {"name": "HOST", "type": "string"},
                    {"name": "host", "type": "string"},
                ]
            }
        )
        self.assertFalse(s.is_valid())
        self.assertIn("parameters", s.errors)

    def test_unknown_type_rejected(self):
        s = ScriptParametersUpdateSerializer(
            data={"parameters": [{"name": "X", "type": "date"}]}
        )
        self.assertFalse(s.is_valid())

    def test_defaults_applied(self):
        s = ScriptParametersUpdateSerializer(data={"parameters": [{"name": "X"}]})
        self.assertTrue(s.is_valid(), s.errors)
        p = s.validated_data["parameters"][0]
        self.assertEqual(p["type"], "string")
        self.assertFalse(p["secret"])
        self.assertEqual(p["default"], "")
