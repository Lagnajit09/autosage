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
    pathname = models.CharField(max_length=1024, unique=True)
    
    # URLs
    blob_url = models.URLField()
    download_url = models.URLField(blank=True, null=True)

    # Ownership
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='scripts', null=True, blank=True)

    # Metadata
    content_type = models.CharField(max_length=100, default='text/javascript')
    file_size = models.PositiveIntegerField()  # bytes
    uploaded_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        indexes = [
            models.Index(fields=['owner', 'pathname']),
        ]
        ordering = ['-uploaded_at', '-updated_at']
        verbose_name = "Script"
        verbose_name_plural = "Scripts"
        db_table = "scripts"

    def __str__(self):
        return f"{self.name} (v{self.version})"
