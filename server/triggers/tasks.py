"""Celery tasks for the triggers app.

``fire_scheduled_workflow`` is the lightweight dispatcher enqueued by Celery
Beat. It re-validates the schedule, enforces the overlap policy, then delegates
to ``enqueue_workflow_run`` so every scheduled run goes through the same graph
validation, node-run creation, and Celery execution path as manual and HTTP
runs.

Queue: ``scheduler``  (see CELERY_TASK_ROUTES in settings)
"""
import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(
    name="triggers.fire_scheduled_workflow",
    bind=True,
    max_retries=0,
    ignore_result=True,
)
def fire_scheduled_workflow(self, schedule_trigger_id: str) -> None:  # type: ignore[override]
    """Dispatch a scheduled workflow run.

    Steps:
    1. Reload ``ScheduleTrigger`` (bail if gone or disabled).
    2. Verify the workflow still has a trigger node with ``data.type == "schedule"``.
    3. Enforce overlap policy: skip if a queued/running scheduled run exists.
    4. Call ``enqueue_workflow_run(...)`` with ``trigger_source="schedule"``.
    5. Update ``last_triggered_at``, ``last_run``, ``last_error``.
    """
    # Lazy imports to avoid circular-import issues at module load time.
    from triggers.models import ScheduleTrigger
    from execution_engine.helpers.run_builder import RunBuildError, enqueue_workflow_run
    from execution_engine.models import WorkflowRun

    # ── 1. Load & guard ──────────────────────────────────────────────────────
    try:
        schedule = (
            ScheduleTrigger.objects
            .select_related("workflow", "workflow__user")
            .get(id=schedule_trigger_id)
        )
    except ScheduleTrigger.DoesNotExist:
        logger.warning(
            "fire_scheduled_workflow: ScheduleTrigger %s not found — skipping.",
            schedule_trigger_id,
        )
        return

    if not schedule.is_active:
        logger.info(
            "fire_scheduled_workflow: ScheduleTrigger %s is disabled — skipping.",
            schedule_trigger_id,
        )
        return

    workflow = schedule.workflow
    if workflow.user is None:
        _record_error(schedule, "Workflow has no owner — cannot run.")
        return

    # ── 2. Verify trigger node still matches ─────────────────────────────────
    trigger_node = _find_schedule_trigger_node(workflow.nodes, schedule.node_id)
    if trigger_node is None:
        _record_error(
            schedule,
            f"Node {schedule.node_id} no longer exists or is not a schedule trigger.",
        )
        return

    # ── 3. Overlap policy: no concurrent scheduled runs ──────────────────────
    active = WorkflowRun.objects.filter(
        workflow=workflow,
        trigger_source="schedule",
        status__in=["queued", "running"],
    ).exists()
    if active:
        logger.info(
            "fire_scheduled_workflow: workflow %s already has a queued/running "
            "scheduled run — skipping fire for schedule %s.",
            workflow.id,
            schedule_trigger_id,
        )
        _record_error(
            schedule,
            "Skipped: a prior scheduled run is still queued or running.",
        )
        return

    # ── 4. Enqueue ────────────────────────────────────────────────────────────
    try:
        workflow_run = enqueue_workflow_run(
            workflow=workflow,
            user=workflow.user,
            inputs={},
            send_email=False,
            user_email="",
            trigger_source="schedule",
            trigger_node_id=schedule.node_id,
        )
    except RunBuildError as exc:
        logger.error(
            "fire_scheduled_workflow: RunBuildError for workflow %s / schedule %s: %s",
            workflow.id,
            schedule_trigger_id,
            exc.message,
        )
        _record_error(schedule, exc.message)
        return
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "fire_scheduled_workflow: unexpected error for schedule %s",
            schedule_trigger_id,
        )
        _record_error(schedule, str(exc))
        return

    # ── 5. Update observability fields ────────────────────────────────────────
    schedule.last_triggered_at = timezone.now()
    schedule.last_run = workflow_run
    schedule.last_error = ""
    schedule.save(update_fields=["last_triggered_at", "last_run", "last_error"])

    logger.info(
        "fire_scheduled_workflow: queued WorkflowRun %s for workflow %s (schedule %s).",
        workflow_run.id,
        workflow.id,
        schedule_trigger_id,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _find_schedule_trigger_node(nodes: list, node_id: str) -> dict | None:
    """Return the node dict if it exists and is a schedule trigger, else None."""
    for node in nodes:
        if node.get("id") != node_id:
            continue
        data = node.get("data") or {}
        if data.get("type") == "schedule":
            return node
    return None


def _record_error(schedule, message: str) -> None:
    """Persist a last_error string without overwriting last_triggered_at."""
    schedule.last_error = message
    schedule.save(update_fields=["last_error"])
    logger.warning(
        "fire_scheduled_workflow: schedule %s — %s",
        schedule.id,
        message,
    )
