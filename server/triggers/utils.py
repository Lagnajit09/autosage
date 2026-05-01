"""Utility helpers for the triggers app.

HTTP trigger helpers (generate_secret, etc.) live here alongside the new
schedule-trigger helpers that manage django-celery-beat PeriodicTask rows.
"""
import hashlib
import logging
import secrets
import string

import bcrypt

logger = logging.getLogger(__name__)


# ── HTTP trigger helpers ──────────────────────────────────────────────────────

def generate_secret(length: int = 40) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def generate_trigger_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def hash_secret(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_secret(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:  # noqa: BLE001
        return False


def secret_last4(plain: str) -> str:
    return plain[-4:]


# ── Schedule trigger helpers ──────────────────────────────────────────────────

def parse_cron_fields(cron_expression: str) -> dict:
    """Split a 5-field cron string into kwargs for CrontabSchedule.

    Returns a dict with keys: minute, hour, day_of_month, month_of_year,
    day_of_week — matching django-celery-beat's CrontabSchedule field names.

    Raises ValueError if the expression doesn't have exactly 5 fields.
    """
    parts = cron_expression.strip().split()
    if len(parts) != 5:
        raise ValueError(
            f"Expected 5-field cron expression, got {len(parts)} field(s): {cron_expression!r}"
        )
    minute, hour, dom, month, dow = parts
    return {
        "minute": minute,
        "hour": hour,
        "day_of_month": dom,
        "month_of_year": month,
        "day_of_week": dow,
    }


def make_periodic_task_name(schedule_trigger_id) -> str:
    """Return the deterministic Beat task name for a ScheduleTrigger."""
    return f"workflow-schedule:{schedule_trigger_id}"


def sync_beat_task(schedule_trigger) -> None:
    """Create or update the django-celery-beat PeriodicTask linked to a ScheduleTrigger.

    Must be called inside a transaction when the ScheduleTrigger is being saved
    (create or update). Safe to call multiple times — it is idempotent.
    """
    from django_celery_beat.models import CrontabSchedule, PeriodicTask
    import json

    try:
        cron_fields = parse_cron_fields(schedule_trigger.cron_expression)
    except ValueError as exc:
        logger.error(
            "sync_beat_task: invalid cron for schedule %s: %s",
            schedule_trigger.id,
            exc,
        )
        raise

    # get_or_create the CrontabSchedule row (shared across tasks that happen
    # to use the same cron expression + timezone).
    crontab, _ = CrontabSchedule.objects.get_or_create(
        minute=cron_fields["minute"],
        hour=cron_fields["hour"],
        day_of_month=cron_fields["day_of_month"],
        month_of_year=cron_fields["month_of_year"],
        day_of_week=cron_fields["day_of_week"],
        timezone=schedule_trigger.timezone,
    )

    task_name = make_periodic_task_name(schedule_trigger.id)
    task_kwargs = json.dumps({"schedule_trigger_id": str(schedule_trigger.id)})

    PeriodicTask.objects.update_or_create(
        name=task_name,
        defaults={
            "task": "triggers.fire_scheduled_workflow",
            "crontab": crontab,
            "kwargs": task_kwargs,
            "enabled": schedule_trigger.is_active,
            "description": (
                f"Scheduled run for workflow {schedule_trigger.workflow_id} "
                f"node {schedule_trigger.node_id}"
            ),
        },
    )

    # Cache the task name on the model if not set yet.
    if not schedule_trigger.periodic_task_name:
        schedule_trigger.periodic_task_name = task_name
        schedule_trigger.save(update_fields=["periodic_task_name"])

    logger.info(
        "sync_beat_task: upserted PeriodicTask %r for schedule %s.",
        task_name,
        schedule_trigger.id,
    )


def delete_beat_task(periodic_task_name: str) -> None:
    """Delete the PeriodicTask row for a schedule trigger (if it exists)."""
    if not periodic_task_name:
        return
    try:
        from django_celery_beat.models import PeriodicTask
        deleted, _ = PeriodicTask.objects.filter(name=periodic_task_name).delete()
        if deleted:
            logger.info("delete_beat_task: deleted PeriodicTask %r.", periodic_task_name)
    except Exception:  # noqa: BLE001
        logger.exception(
            "delete_beat_task: failed to delete PeriodicTask %r.", periodic_task_name
        )


def disable_beat_task(periodic_task_name: str) -> None:
    """Disable (not delete) the PeriodicTask for a schedule trigger."""
    if not periodic_task_name:
        return
    try:
        from django_celery_beat.models import PeriodicTask
        PeriodicTask.objects.filter(name=periodic_task_name).update(enabled=False)
        logger.info("disable_beat_task: disabled PeriodicTask %r.", periodic_task_name)
    except Exception:  # noqa: BLE001
        logger.exception(
            "disable_beat_task: failed to disable PeriodicTask %r.", periodic_task_name
        )
