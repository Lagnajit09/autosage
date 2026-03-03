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
    script = models.ForeignKey('scripts.Script', on_delete=models.CASCADE, related_name='executions')
    vault = models.ForeignKey('vault.Vault', on_delete=models.CASCADE, related_name='executions')
    server = models.ForeignKey('vault.Server', on_delete=models.CASCADE, related_name='executions')
    credential = models.ForeignKey('vault.Credential', on_delete=models.CASCADE, related_name='executions')
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
