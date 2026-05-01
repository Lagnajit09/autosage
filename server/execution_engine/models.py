from django.db import models
from django.conf import settings
import uuid

class ScriptExecution(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('running', 'Running'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    script = models.ForeignKey('scripts.Script', on_delete=models.SET_NULL, related_name='executions', null=True, blank=True)
    vault = models.ForeignKey('vault.Vault', on_delete=models.SET_NULL, related_name='executions', null=True, blank=True)
    server = models.ForeignKey('vault.Server', on_delete=models.SET_NULL, related_name='executions', null=True, blank=True)
    credential = models.ForeignKey('vault.Credential', on_delete=models.SET_NULL, related_name='executions', null=True, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='script_executions', null=True, blank=True)
    inputs = models.JSONField(default=dict)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    stdout_log_url = models.URLField(blank=True, null=True)
    stderr_log_url = models.URLField(blank=True, null=True)
    exit_code = models.IntegerField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration = models.DurationField(null=True, blank=True)
    logs_url = models.URLField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['script', 'status']),
        ]
        verbose_name = "Script Execution"
        verbose_name_plural = "Script Executions"
        db_table = "script_executions"

    def __str__(self):
        return f"Execution {self.id} - {self.script.name} ({self.status})"


class WorkflowRun(models.Model):
    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('success', 'Success'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]

    TRIGGER_SOURCE_CHOICES = [
        ('manual', 'Manual'),
        ('http', 'HTTP'),
        ('schedule', 'Schedule'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow = models.ForeignKey('workflows.Workflow', on_delete=models.CASCADE, related_name='runs')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='workflow_runs')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='queued')

    # Celery task ID — used for revocation/cancellation
    celery_task_id = models.CharField(max_length=255, blank=True)

    # Global workflow-level input overrides
    inputs = models.JSONField(default=dict, blank=True)

    # Notification preferences captured at trigger time. The Celery task
    # honours these after the run terminates.
    send_email = models.BooleanField(default=False)
    notification_email = models.EmailField(blank=True)

    # Run-source metadata: allows distinguishing manual, HTTP, and scheduled
    # runs in history, admin, and future analytics without touching the node graph.
    trigger_source = models.CharField(
        max_length=20,
        choices=TRIGGER_SOURCE_CHOICES,
        default='manual',
    )
    trigger_node_id = models.CharField(max_length=255, blank=True)

    error_message = models.TextField(blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['workflow', 'status']),
            models.Index(fields=['trigger_source', 'created_at']),
        ]
        verbose_name = "Workflow Run"
        verbose_name_plural = "Workflow Runs"
        db_table = "workflow_runs"

    def __str__(self) -> str:
        return f"WorkflowRun {self.id} — Run by {self.user.username} ({self.status})"


class WorkflowNodeRun(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('running', 'Running'),
        ('success', 'Success'),
        ('failed', 'Failed'),
        ('skipped', 'Skipped'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow_run = models.ForeignKey(WorkflowRun, on_delete=models.CASCADE, related_name='node_runs')

    # node_id matches the `id` field on the node JSON object in Workflow.nodes
    node_id = models.CharField(max_length=255)
    node_label = models.CharField(max_length=255, blank=True)

    # Script bound to this node at execution time (nullable for input/output-only nodes)
    script_id = models.IntegerField(null=True, blank=True)

    # Snapshot of execution context for this specific node
    vault_id = models.UUIDField(null=True, blank=True)
    server_id = models.UUIDField(null=True, blank=True)
    credential_id = models.UUIDField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    # Position in topological execution order (0-indexed)
    execution_order = models.IntegerField()

    # GCS-backed log URLs populated after node completes
    stdout_log_url = models.URLField(blank=True)
    stderr_log_url = models.URLField(blank=True)
    logs_url = models.URLField(blank=True)

    exit_code = models.IntegerField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['execution_order']
        indexes = [
            models.Index(fields=['workflow_run', 'status']),
            models.Index(fields=['workflow_run', 'execution_order']),
            models.Index(fields=['script_id']),
            models.Index(fields=['vault_id']),
            models.Index(fields=['server_id']),
            models.Index(fields=['credential_id']),
        ]
        verbose_name = "Workflow Node Run"
        verbose_name_plural = "Workflow Node Runs"
        db_table = "workflow_node_runs"

    def __str__(self) -> str:
        return f"NodeRun {self.node_label or self.node_id} ({self.status}) — Run {self.workflow_run_id}"

