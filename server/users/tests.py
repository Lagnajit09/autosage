"""SageCode (sagex CLI) sign-in, sessions and activity.

Covers the device-authorization login (start -> approve in the browser -> the
CLI collects its key once), the browser-only / API-key-only split, the activity
summary recorded from request headers, idle expiry, revocation and the
new-device email.
"""
import datetime
import uuid
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from users import cli_sessions
from users.models import ApiKey, CliLoginRequest, normalize_user_code
from workflows.models import Workflow

User = get_user_model()

CLI_UA = "sagex/1.1.0 (Windows 11)"
SMTP = dict(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_HOST_USER="sender@example.com",
    EMAIL_HOST_PASSWORD="app-password",
)


class _CliTestBase(TestCase):
    def setUp(self):
        cache.clear()  # throttle counters live in the cache
        self.user = User.objects.create(username="user_cli", email="dev@example.com")
        self.browser = APIClient()
        self.browser.force_authenticate(user=self.user)
        # The new-device email goes through Celery; run it inline instead.
        patcher = mock.patch("users.tasks.send_new_device_email.delay",
                             side_effect=lambda key_id: self._send_email(key_id))
        patcher.start()
        self.addCleanup(patcher.stop)

    @staticmethod
    def _send_email(key_id):
        from users.emails import send_new_device_email
        send_new_device_email(key_id)

    def cli(self, key=None, invocation=None, command=None):
        """An APIClient that looks like the sagex CLI."""
        client = APIClient()
        headers = {"HTTP_USER_AGENT": CLI_UA}
        if key:
            headers["HTTP_X_API_KEY"] = key
        if invocation:
            headers["HTTP_X_SAGEX_INVOCATION"] = invocation
        if command:
            headers["HTTP_X_SAGEX_COMMAND"] = command
        client.credentials(**headers)
        return client

    def start_login(self, device="dev-laptop"):
        resp = self.cli().post("/api/users/cli/auth/start/",
                               {"device_name": device, "os": "Windows 11", "cli_version": "1.1.0"},
                               format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        return resp.json()["data"]

    def poll(self, device_code):
        return self.cli().post("/api/users/cli/auth/token/", {"device_code": device_code}, format="json")

    def sign_in(self, device="dev-laptop"):
        """Run the whole flow; return the new plaintext key."""
        login = self.start_login(device)
        resp = self.browser.post(f"/api/users/cli/auth/requests/{login['user_code']}/approve/")
        self.assertEqual(resp.status_code, 200, resp.content)
        with self.captureOnCommitCallbacks(execute=True):
            resp = self.poll(login["device_code"])
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()["data"]["api_key"]


@override_settings(**SMTP)
class DeviceLoginTests(_CliTestBase):
    def test_full_flow_mints_one_working_key(self):
        login = self.start_login()
        self.assertRegex(login["user_code"], r"^[A-Z]{4}-[A-Z]{4}$")
        self.assertTrue(login["verification_uri_complete"].endswith(f"/cli-auth?code={login['user_code']}"))
        self.assertEqual(login["interval"], 5)

        # Still pending until the user approves.
        self.assertEqual(self.poll(login["device_code"]).status_code, 202)

        # The approval page sees the device asking.
        detail = self.browser.get(f"/api/users/cli/auth/requests/{login['user_code'].lower().replace('-', ' ')}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["data"]["device_name"], "dev-laptop")

        self.browser.post(f"/api/users/cli/auth/requests/{login['user_code']}/approve/")
        with self.captureOnCommitCallbacks(execute=True):
            resp = self.poll(login["device_code"])
        self.assertEqual(resp.status_code, 200)
        data = resp.json()["data"]
        self.assertTrue(data["api_key"].startswith("sgx_"))
        self.assertEqual(data["user"]["email"], "dev@example.com")
        self.assertEqual(data["session"]["kind"], "device")

        key = ApiKey.objects.get(user=self.user)
        self.assertEqual((key.name, key.client_os, key.cli_version), ("dev-laptop", "Windows 11", "1.1.0"))

        # The key works...
        me = self.cli(data["api_key"]).get("/api/users/cli/sessions/current/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["data"]["session"]["id"], str(key.id))
        # ...and can't be collected twice.
        self.assertEqual(self.poll(login["device_code"]).status_code, 410)

    def test_denied_request_never_yields_a_key(self):
        login = self.start_login()
        self.browser.post(f"/api/users/cli/auth/requests/{login['user_code']}/deny/")
        resp = self.poll(login["device_code"])
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["errors"]["code"], "access_denied")
        self.assertFalse(ApiKey.objects.exists())

    def test_expired_request_cannot_be_approved_or_collected(self):
        login = self.start_login()
        CliLoginRequest.objects.update(expires_at=timezone.now() - datetime.timedelta(seconds=1))
        approve = self.browser.post(f"/api/users/cli/auth/requests/{login['user_code']}/approve/")
        self.assertEqual(approve.status_code, 404)
        self.assertEqual(self.poll(login["device_code"]).status_code, 410)

    def test_unknown_device_code(self):
        self.assertEqual(self.poll("not-a-real-code").status_code, 404)

    def test_code_normalization(self):
        self.assertEqual(normalize_user_code("wdjb mjht"), "WDJB-MJHT")
        self.assertEqual(normalize_user_code("WDJBMJHT"), "WDJB-MJHT")
        self.assertEqual(normalize_user_code("WDJB-MJH"), "")

    def test_new_device_email_only_for_unseen_devices(self):
        self.sign_in("dev-laptop")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("dev-laptop", mail.outbox[0].subject)
        self.assertIn("/profile#sagecode", mail.outbox[0].body)

        self.sign_in("dev-laptop")            # same machine again: no email
        self.assertEqual(len(mail.outbox), 1)
        self.sign_in("build-server")          # a new one: email
        self.assertEqual(len(mail.outbox), 2)

    def test_session_cap(self):
        for i in range(cli_sessions.MAX_ACTIVE_KEYS):
            ApiKey.create_for_user(self.user, name=f"k{i}", kind=ApiKey.Kind.TOKEN)
        login = self.start_login()
        resp = self.browser.post(f"/api/users/cli/auth/requests/{login['user_code']}/approve/")
        self.assertEqual(resp.status_code, 409)


class BrowserOnlyTests(_CliTestBase):
    """An API key can't approve sign-ins, mint keys or manage other sessions."""

    def test_api_key_is_refused_on_browser_endpoints(self):
        _, key = ApiKey.create_for_user(self.user, name="k", kind=ApiKey.Kind.DEVICE)
        login = self.start_login()
        client = self.cli(key)
        self.assertEqual(client.post(f"/api/users/cli/auth/requests/{login['user_code']}/approve/").status_code, 403)
        self.assertEqual(client.get("/api/users/cli/sessions/").status_code, 403)
        self.assertEqual(client.post("/api/users/cli/tokens/", {"name": "ci"}, format="json").status_code, 403)
        other, _ = ApiKey.create_for_user(self.user, name="other")
        self.assertEqual(client.delete(f"/api/users/cli/sessions/{other.id}/").status_code, 403)

    def test_current_session_needs_an_api_key(self):
        self.assertEqual(self.browser.get("/api/users/cli/sessions/current/").status_code, 403)

    def test_cannot_revoke_someone_elses_session(self):
        stranger = User.objects.create(username="stranger")
        theirs, _ = ApiKey.create_for_user(stranger, name="theirs")
        self.assertEqual(self.browser.delete(f"/api/users/cli/sessions/{theirs.id}/").status_code, 404)
        theirs.refresh_from_db()
        self.assertTrue(theirs.is_active)


class SessionTests(_CliTestBase):
    def test_list_create_token_and_revoke(self):
        resp = self.browser.post("/api/users/cli/tokens/", {"name": "GitHub Actions"}, format="json")
        self.assertEqual(resp.status_code, 201)
        token = resp.json()["data"]["api_key"]
        self.assertTrue(token.startswith("sgx_"))

        sessions = self.browser.get("/api/users/cli/sessions/").json()["data"]
        self.assertEqual(sessions["idle_expiry_days"], 90)
        self.assertEqual([s["name"] for s in sessions["sessions"]], ["GitHub Actions"])
        self.assertNotIn("api_key", sessions["sessions"][0])   # plaintext is never listed

        session_id = sessions["sessions"][0]["id"]
        self.assertEqual(self.browser.delete(f"/api/users/cli/sessions/{session_id}/").status_code, 200)
        resp = self.cli(token).get("/api/users/cli/sessions/current/")
        self.assertEqual(resp.status_code, 401)
        self.assertIn("revoked", resp.json()["errors"]["detail"])
        self.assertEqual(self.browser.get("/api/users/cli/sessions/").json()["data"]["sessions"], [])

    def test_token_needs_a_name(self):
        resp = self.browser.post("/api/users/cli/tokens/", {"name": "  "}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_logout_revokes_the_calling_session(self):
        _, key = ApiKey.create_for_user(self.user, name="laptop", kind=ApiKey.Kind.DEVICE)
        self.assertEqual(self.cli(key).delete("/api/users/cli/sessions/current/").status_code, 200)
        resp = self.cli(key).get("/api/users/cli/sessions/current/")
        self.assertEqual(resp.status_code, 401)
        self.assertIn("signed out", resp.json()["errors"]["detail"])

    def test_idle_session_expires(self):
        api_key, key = ApiKey.create_for_user(self.user, name="old", kind=ApiKey.Kind.DEVICE)
        ApiKey.objects.filter(pk=api_key.pk).update(
            last_used_at=timezone.now() - cli_sessions.IDLE_EXPIRY - datetime.timedelta(minutes=1),
        )
        resp = self.cli(key).get("/api/users/cli/sessions/current/")
        self.assertEqual(resp.status_code, 401)
        self.assertIn("expired after 90 days", resp.json()["errors"]["detail"])
        api_key.refresh_from_db()
        self.assertEqual((api_key.is_active, api_key.revoke_reason), (False, "expired"))
        # And it no longer shows on the Profile page.
        self.assertEqual(self.browser.get("/api/users/cli/sessions/").json()["data"]["sessions"], [])

    def test_recently_used_session_does_not_expire(self):
        api_key, key = ApiKey.create_for_user(self.user, name="busy", kind=ApiKey.Kind.DEVICE)
        ApiKey.objects.filter(pk=api_key.pk).update(
            created_at=timezone.now() - datetime.timedelta(days=400),
            last_used_at=timezone.now() - datetime.timedelta(days=30),
        )
        self.assertEqual(self.cli(key).get("/api/users/cli/sessions/current/").status_code, 200)


class ActivityTests(_CliTestBase):
    def setUp(self):
        super().setUp()
        self.api_key, self.key = ApiKey.create_for_user(self.user, name="laptop", kind=ApiKey.Kind.DEVICE)

    def test_commands_counted_once_per_invocation(self):
        first, second = uuid.uuid4().hex, uuid.uuid4().hex
        for _ in range(3):   # one command making three requests
            self.cli(self.key, first, "list workflow").get("/api/users/cli/sessions/current/")
        self.cli(self.key, second, "auth status").get("/api/users/cli/sessions/current/")

        self.api_key.refresh_from_db()
        self.assertEqual(self.api_key.commands_run, 2)
        self.assertEqual(self.api_key.last_command, "auth status")
        self.assertEqual((self.api_key.cli_version, self.api_key.client_os), ("1.1.0", "Windows 11"))
        self.assertEqual(self.api_key.last_ip, "127.0.0.1")
        self.assertIsNotNone(self.api_key.last_used_at)

    def test_malformed_headers_are_ignored(self):
        self.cli(self.key, "not-hex", "x").get("/api/users/cli/sessions/current/")
        self.cli(self.key, uuid.uuid4().hex, "DROP TABLE; --").get("/api/users/cli/sessions/current/")
        self.api_key.refresh_from_db()
        self.assertEqual(self.api_key.commands_run, 1)
        self.assertEqual(self.api_key.last_command, "")

    @mock.patch("execution_engine.helpers.run_builder.execute_workflow")
    def test_workflow_run_counts_as_a_run_started(self, task):
        task.delay.return_value.id = "celery-task-id"
        workflow = Workflow.objects.create(
            user=self.user, name="wf", edges=[],
            nodes=[{"id": "trigger-1", "type": "trigger", "data": {"type": "manual", "label": "Start"}}],
        )
        resp = self.cli(self.key, uuid.uuid4().hex, "run workflow").post(
            f"/api/execution-engine/workflows/{workflow.id}/run/", {"inputs": {}}, format="json",
        )
        self.assertEqual(resp.status_code, 202, resp.content)
        # A failed request (unknown workflow) doesn't count.
        self.cli(self.key).post(f"/api/execution-engine/workflows/{uuid.uuid4()}/run/", {}, format="json")

        self.api_key.refresh_from_db()
        self.assertEqual(self.api_key.runs_started, 1)
