import uuid

from django.db import models
from django.conf import settings


class HttpTrigger(models.Model):
    """A per-(workflow, node) public webhook receiver.

    Stores a URL-slug ``trigger_token`` (used in the path) and the bcrypt-style
    hash of a one-time-revealed secret (used in the ``X-Trigger-Secret`` header).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow = models.ForeignKey(
        'workflows.Workflow',
        on_delete=models.CASCADE,
        related_name='http_triggers',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='http_triggers',
        null=True,
        blank=True
    )
    is_active = models.BooleanField(default=True)
    node_id = models.CharField(max_length=255)
    trigger_token = models.CharField(max_length=64, unique=True, db_index=True)
    secret_hash = models.CharField(max_length=255)
    secret_last4 = models.CharField(max_length=4, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    rotated_at = models.DateTimeField(null=True, blank=True)
    last_triggered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [('workflow', 'node_id')]
        db_table = 'http_triggers'
        verbose_name = 'HTTP Trigger'
        verbose_name_plural = 'HTTP Triggers'

    def __str__(self) -> str:
        return f"HttpTrigger {self.trigger_token} (node {self.node_id})"


class HttpTriggerIdempotencyKey(models.Model):
    """Maps an inbound ``Idempotency-Key`` to the workflow run it produced.

    Repeat requests with the same key on the same trigger return the original
    run instead of queueing a duplicate.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trigger = models.ForeignKey(
        HttpTrigger,
        on_delete=models.CASCADE,
        related_name='idempotency_keys',
    )
    key = models.CharField(max_length=255)
    workflow_run = models.ForeignKey(
        'execution_engine.WorkflowRun',
        on_delete=models.CASCADE,
        related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('trigger', 'key')]
        indexes = [models.Index(fields=['created_at'], name='http_trig_idem_created_idx')]
        db_table = 'http_trigger_idempotency_keys'

    def __str__(self) -> str:
        return f"IdempotencyKey {self.key} (trigger {self.trigger_id})"


class ScheduleTrigger(models.Model):
    """Per-(workflow, node_id) cron schedule managed via Celery Beat.

    One record represents one scheduled trigger node. The linked
    ``periodic_task_name`` is used to find and update/delete the corresponding
    ``django_celery_beat.PeriodicTask`` without storing a FK that would couple the two apps at the DB level.

    v1 constraints (enforced in the API layer):
    - UTC only
    - 5-field cron expressions only (minute hour dom month dow)
    - no concurrent scheduled runs for the same workflow
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow = models.ForeignKey(
        'workflows.Workflow',
        on_delete=models.CASCADE,
        related_name='schedule_triggers',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='schedule_triggers',
        null=True,
        blank=True
    )
    node_id = models.CharField(max_length=255)
    cron_expression = models.CharField(max_length=255)
    # v1: UTC only — stored for future multi-TZ support
    timezone = models.CharField(max_length=64, default='UTC')
    is_active = models.BooleanField(default=True)

    # Deterministic Beat task name: "workflow-schedule:<id>"
    # Stored so we can update/delete the PeriodicTask without a FK.
    periodic_task_name = models.CharField(max_length=255, blank=True, db_index=True)

    # Observability fields
    last_triggered_at = models.DateTimeField(null=True, blank=True)
    last_run = models.ForeignKey(
        'execution_engine.WorkflowRun',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    last_error = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('workflow', 'node_id')]
        db_table = 'schedule_triggers'
        verbose_name = 'Schedule Trigger'
        verbose_name_plural = 'Schedule Triggers'

    def __str__(self) -> str:
        return (
            f"ScheduleTrigger [{self.cron_expression}] "
            f"(workflow {self.workflow_id}, node {self.node_id})"
        )
