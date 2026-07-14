from django.db import models
from django.utils import timezone
from django.conf import settings

class Script(models.Model):
    """
    Stored metadata for scripts in Vercel Blob.
    Actual file content lives at blob_url.
    """

    # Identifiers
    name = models.CharField(max_length=255)
    pathname = models.CharField(max_length=1024)
    
    # URLs
    blob_url = models.URLField()
    download_url = models.URLField(blank=True, null=True)

    # Ownership
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='scripts', null=True, blank=True)

    # Shared "scripts-library" flag. Library scripts are owned by a dedicated
    # system account and are readable/runnable by any authenticated user
    # (they back Library workflows/nodes). Regular user scripts stay private.
    is_library = models.BooleanField(default=False)

    # Metadata
    content_type = models.CharField(max_length=100, default='text/javascript')
    file_size = models.PositiveIntegerField()  # bytes
    uploaded_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ('owner', 'pathname')
        indexes = [
            models.Index(fields=['owner', 'pathname']),
        ]
        ordering = ['-uploaded_at', '-updated_at']
        verbose_name = "Script"
        verbose_name_plural = "Scripts"
        db_table = "scripts"

    def __str__(self):
        return f"{self.name} (v{self.version})"
