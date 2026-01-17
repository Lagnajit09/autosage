from django.db import models
from django.conf import settings
import uuid


class Workflow(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='workflows', null=True, blank=True)
    name = models.CharField(max_length=255)
    nodes = models.JSONField(default=list, blank=True)
    edges = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-modified_at"]
        verbose_name = "Workflow"
        verbose_name_plural = "Workflows"
        db_table = "workflows"

    def __str__(self) -> str:
        return self.name
