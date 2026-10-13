"""Monthly quota enforcement across every trigger source.

Regression coverage for the gap where HTTP-webhook and cron-schedule runs (and
reruns / async script runs) bypassed the monthly caps. The cap now lives in
``enqueue_workflow_run`` — the single entry point for all trigger sources.
"""
import datetime
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from billing.enforcement import PlanLimitExceeded, limit_message
from billing.limits import PLAN_LIMITS, script_executions_this_month
from billing.models import Subscription
from execution_engine.helpers.run_builder import RunBuildError, enqueue_workflow_run
from execution_engine.models import ScriptExecution, WorkflowRun
from workflows.models import Workflow

User = get_user_model()

RUN_CAP = PLAN_LIMITS["free"]["max_workflow_runs_per_month"]
EXEC_CAP = PLAN_LIMITS["free"]["max_script_executions_per_month"]

# Smallest valid workflow: exactly one trigger node, no actions.
TRIGGER_NODE_ID = "trigger-1"
TRIGGER_NODE = {
    "id": TRIGGER_NODE_ID,
    "type": "trigger",
    "data": {"type": "schedule", "label": "Every hour"},
}


def _seed_runs(user, workflow, n, source="manual", created_at=None):
    runs = WorkflowRun.objects.bulk_create(
        [
            WorkflowRun(workflow=workflow, user=user, status="success", trigger_source=source)
            for _ in range(n)
        ]
    )
    if created_at is not None:
        # auto_now_add ignores explicit values on insert — backdate afterwards.
        WorkflowRun.objects.filter(id__in=[r.id for r in runs]).update(created_at=created_at)


class _QuotaTestBase(TestCase):
    def setUp(self):
        self.user = User.objects.create(username="user_free")
        self.workflow = Workflow.objects.create(
            user=self.user, name="wf", nodes=[TRIGGER_NODE], edges=[]
        )
        # Never hit Celery/Redis from tests.
        patcher = mock.patch("execution_engine.helpers.run_builder.execute_workflow")
        self.task = patcher.start()
        self.task.delay.return_value.id = "celery-task-id"
        self.addCleanup(patcher.stop)

    def enqueue(self, source):
        return enqueue_workflow_run(
            workflow=self.workflow,
            user=self.user,
            trigger_source=source,
            trigger_node_id=TRIGGER_NODE_ID,
        )


class WorkflowRunQuotaTests(_QuotaTestBase):
    def test_under_cap_enqueues(self):
        run = self.enqueue("http")
        self.assertEqual(run.trigger_source, "http")
        self.task.delay.assert_called_once()

    def test_every_trigger_source_is_blocked_at_cap(self):
        _seed_runs(self.user, self.workflow, RUN_CAP)
        for source in ("manual", "autobot", "http", "schedule"):
            with self.subTest(source=source):
                with self.assertRaises(PlanLimitExceeded) as ctx:
                    self.enqueue(source)
                self.assertEqual(ctx.exception.detail["limit_key"], "max_workflow_runs_per_month")
                self.assertEqual(ctx.exception.detail["limit"], RUN_CAP)
        # Nothing was created or dispatched once over the cap.
        self.assertEqual(WorkflowRun.objects.filter(user=self.user).count(), RUN_CAP)
        self.task.delay.assert_not_called()

    def test_all_sources_share_one_monthly_quota(self):
        _seed_runs(self.user, self.workflow, RUN_CAP - 2, source="manual")
        self.enqueue("http")
        self.enqueue("schedule")  # this one uses the last slot
        with self.assertRaises(PlanLimitExceeded):
            self.enqueue("http")

    def test_last_months_runs_do_not_count(self):
        last_month = timezone.now().replace(day=1) - datetime.timedelta(days=1)
        _seed_runs(self.user, self.workflow, RUN_CAP, created_at=last_month)
        self.assertEqual(self.enqueue("schedule").trigger_source, "schedule")

    def test_pro_plan_gets_the_higher_cap(self):
        Subscription.objects.create(user=self.user, plan="pro", status="active")
        _seed_runs(self.user, self.workflow, RUN_CAP)
        self.enqueue("http")  # over the Free cap, within Pro's

    def test_staff_are_exempt(self):
        self.user.is_staff = True
        self.user.save()
        _seed_runs(self.user, self.workflow, RUN_CAP + 5)
        self.enqueue("http")

    def test_invalid_workflow_does_not_consume_quota(self):
        self.workflow.nodes = []
        self.workflow.save()
        with self.assertRaises(RunBuildError):
            self.enqueue("http")
        self.assertEqual(WorkflowRun.objects.filter(user=self.user).count(), 0)


class ScheduleQuotaTests(_QuotaTestBase):
    def setUp(self):
        super().setUp()
        from triggers.models import ScheduleTrigger

        self.schedule = ScheduleTrigger.objects.create(
            workflow=self.workflow, node_id=TRIGGER_NODE_ID, cron_expression="0 * * * *"
        )

    def test_dispatch_records_reason_and_raises_for_fire_now(self):
        from triggers.tasks import dispatch_schedule

        _seed_runs(self.user, self.workflow, RUN_CAP)
        with self.assertRaises(PlanLimitExceeded):
            dispatch_schedule(self.schedule)
        self.schedule.refresh_from_db()
        self.assertIn("monthly workflow run limit", self.schedule.last_error)
        self.assertIn(f"{RUN_CAP}/{RUN_CAP}", self.schedule.last_error)
        self.assertIsNone(self.schedule.last_run)

    def test_beat_task_skips_quietly_when_over_quota(self):
        from triggers.tasks import fire_scheduled_workflow

        _seed_runs(self.user, self.workflow, RUN_CAP)
        fire_scheduled_workflow.run(str(self.schedule.id))  # must not raise
        self.schedule.refresh_from_db()
        self.assertIn("monthly workflow run limit", self.schedule.last_error)
        self.task.delay.assert_not_called()

    def test_beat_task_runs_when_under_quota(self):
        from triggers.tasks import fire_scheduled_workflow

        fire_scheduled_workflow.run(str(self.schedule.id))
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.last_error, "")
        self.assertIsNotNone(self.schedule.last_run)


class HttpWebhookQuotaTests(_QuotaTestBase):
    SECRET = "s3cr3t-webhook-value"

    def setUp(self):
        super().setUp()
        from triggers.models import HttpTrigger
        from triggers.utils import hash_secret

        self.trigger = HttpTrigger.objects.create(
            workflow=self.workflow,
            user=self.user,
            node_id=TRIGGER_NODE_ID,
            trigger_token="tok-quota-test",
            secret_hash=hash_secret(self.SECRET),
        )

    def _post(self, key):
        from execution_engine.views_workflow import trigger_workflow_via_http

        request = APIRequestFactory().post(
            f"/api/execution-engine/triggers/http/{self.trigger.trigger_token}/",
            {"inputs": {}},
            format="json",
            HTTP_X_TRIGGER_SECRET=self.SECRET,
            HTTP_IDEMPOTENCY_KEY=key,
        )
        return trigger_workflow_via_http(request, trigger_token=self.trigger.trigger_token)

    def test_webhook_accepted_under_cap(self):
        self.assertEqual(self._post("k1").status_code, 202)

    def test_webhook_rejected_at_cap_with_upgrade_info(self):
        _seed_runs(self.user, self.workflow, RUN_CAP)
        resp = self._post("k2")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data["errors"]["limit_key"], "max_workflow_runs_per_month")
        self.assertEqual(WorkflowRun.objects.filter(user=self.user).count(), RUN_CAP)

    def test_idempotent_replay_still_returns_original_run_at_cap(self):
        first = self._post("same-key")
        self.assertEqual(first.status_code, 202)
        _seed_runs(self.user, self.workflow, RUN_CAP)
        replay = self._post("same-key")
        self.assertEqual(replay.status_code, 200)
        self.assertTrue(replay.data["data"]["idempotent"])


NUMERIC_LIMIT_KEYS = [
    k for k, v in PLAN_LIMITS["free"].items()
    if k != "execution_mode" and v is not None
]


class LimitMessageTests(TestCase):
    """Messages must match the user's plan — Pro users can't 'upgrade to Pro'."""

    def test_free_messages_offer_pro_with_real_pro_numbers(self):
        for key in NUMERIC_LIMIT_KEYS:
            with self.subTest(key=key):
                msg = limit_message(key, PLAN_LIMITS["free"][key], "free")
                self.assertIn("Free plan", msg)
                self.assertIn("Upgrade to Pro", msg)
                pro_cap = PLAN_LIMITS["pro"][key]
                self.assertIn("unlimited" if pro_cap is None else str(pro_cap), msg)

    def test_pro_messages_never_say_upgrade_to_pro(self):
        pro_keys = [k for k in NUMERIC_LIMIT_KEYS if PLAN_LIMITS["pro"][k] is not None]
        for key in pro_keys:
            with self.subTest(key=key):
                msg = limit_message(key, PLAN_LIMITS["pro"][key], "pro")
                self.assertIn("Pro plan", msg)
                self.assertNotIn("Upgrade to Pro", msg)
                self.assertIn("Enterprise", msg)

    def test_monthly_limits_mention_the_reset(self):
        msg = limit_message("max_workflow_runs_per_month", 300, "pro")
        next_month = (timezone.now().replace(day=28) + datetime.timedelta(days=4)).strftime("%B")
        self.assertIn(f"resets on {next_month} 1", msg)
        self.assertNotIn("resets", limit_message("max_workflows", 50, "pro"))

    def test_singular_for_a_cap_of_one(self):
        self.assertIn("limit of 1 HTTP trigger.", limit_message("max_http_triggers", 1, "free"))

    def test_pro_user_hitting_run_cap_gets_pro_message(self):
        user = User.objects.create(username="user_pro")
        Subscription.objects.create(user=user, plan="pro", status="active")
        workflow = Workflow.objects.create(user=user, name="wf", nodes=[TRIGGER_NODE], edges=[])
        pro_cap = PLAN_LIMITS["pro"]["max_workflow_runs_per_month"]
        _seed_runs(user, workflow, pro_cap)
        with mock.patch("execution_engine.helpers.run_builder.execute_workflow"):
            with self.assertRaises(PlanLimitExceeded) as ctx:
                enqueue_workflow_run(workflow=workflow, user=user, trigger_source="http")
        detail = ctx.exception.detail
        self.assertEqual(detail["plan"], "pro")
        self.assertFalse(detail["upgrade_required"])
        self.assertNotIn("Upgrade to Pro", detail["detail"])
        self.assertIn(f"Pro plan limit of {pro_cap} workflow runs", detail["detail"])


class ScriptExecutionQuotaTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username="user_free_scripts")

    def test_execution_blocked_at_cap(self):
        from execution_engine.views_script import _create_execution_within_quota

        ScriptExecution.objects.bulk_create(
            [ScriptExecution(user=self.user) for _ in range(EXEC_CAP)]
        )
        with self.assertRaises(PlanLimitExceeded) as ctx:
            _create_execution_within_quota(self.user, status="pending")
        self.assertEqual(ctx.exception.detail["limit_key"], "max_script_executions_per_month")
        self.assertEqual(script_executions_this_month(self.user), EXEC_CAP)

    def test_execution_created_under_cap(self):
        from execution_engine.views_script import _create_execution_within_quota

        execution = _create_execution_within_quota(self.user, status="pending")
        self.assertEqual(execution.user, self.user)
