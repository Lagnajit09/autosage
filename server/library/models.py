import uuid

from django.db import models


class LibraryItem(models.Model):
    """
    A curated, admin-managed catalog entry that users can browse and fork.

    Three item types are supported today (a fourth is reserved for future
    Ansible/Terraform modules). The shape of ``content`` depends on ``type``:

        workflow -> {"nodes": [...], "edges": [...]}   (references shared
                    library scripts; carries no vault credentials)
        node     -> <NodeData dict>                    (a single pre-configured
                    action node)
        script   -> {"script_id": <int>}               (points at a shared
                    "scripts-library" Script row)
    """

    class ItemType(models.TextChoices):
        WORKFLOW = "workflow", "Workflow"
        NODE = "node", "Node"
        SCRIPT = "script", "Script"
        MODULE = "module", "Module"  # reserved for ansible/terraform

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type = models.CharField(max_length=20, choices=ItemType.choices)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=100, blank=True)
    tags = models.JSONField(default=list, blank=True)
    content = models.JSONField(default=dict, blank=True)
    author = models.CharField(max_length=255, default="Autosage Team")
    version = models.CharField(max_length=20, default="1.0")
    downloads = models.PositiveIntegerField(default=0)
    is_verified = models.BooleanField(default=False)
    is_published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-modified_at"]
        indexes = [
            models.Index(fields=["type", "category"]),
            models.Index(fields=["is_published"]),
        ]
        verbose_name = "Library Item"
        verbose_name_plural = "Library Items"
        db_table = "library_items"

    def __str__(self):
        return f"{self.name} ({self.type})"
