import uuid
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from .fields import EncryptedCharField, EncryptedTextField


# TODO: (Future Implementation) Sharing Team Access, Read-Only/Edit access, Many-to-Many Relation
class Vault(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='vaults', null=True, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('owner', 'name')
        ordering = ["-modified_at"]
        verbose_name = "Vault"
        verbose_name_plural = "Vaults"
        db_table = "vaults"

    def __str__(self):
        return f"{self.name} ({self.owner})"

class Credential(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    class Type(models.TextChoices):
        USERNAME_PASSWORD = 'username_password', _('Username/Password')
        SSH_KEY = 'ssh_key', _('SSH Key')
        CERTIFICATE = 'certificate', _('Certificate')

    vault = models.ForeignKey(Vault, on_delete=models.CASCADE, related_name='credentials')
    name = models.CharField(max_length=255)
    credential_type = models.CharField(max_length=50, choices=Type.choices)
    
    username = models.CharField(max_length=255, blank=True, null=True)
    password = EncryptedCharField(max_length=1024, blank=True, null=True) 
    ssh_key = EncryptedTextField(blank=True, null=True)
    key_passphrase = EncryptedCharField(max_length=1024, blank=True, null=True)
    cert_pem = EncryptedTextField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('vault', 'name')
        ordering = ["-modified_at"]
        verbose_name = "Credential"
        verbose_name_plural = "Credentials"
        db_table = "credentials"

    def __str__(self):
        return f"{self.name} ({self.get_credential_type_display()})"

class Server(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    class ConnectionMethod(models.TextChoices):
        WINRM = 'winrm', _('WinRM (Windows)')
        SSH = 'ssh', _('SSH (Linux/Unix)')
    
    vault = models.ForeignKey(Vault, on_delete=models.CASCADE, related_name='servers')
    name = models.CharField(max_length=255)
    host = models.CharField(max_length=255)
    port = models.IntegerField(
        help_text=_("Override default port if needed. Default: 5985 for WinRM, 22 for SSH"),
        blank=True, 
        null=True
    )
    connection_method = models.CharField(max_length=50, choices=ConnectionMethod.choices)
    credential = models.ForeignKey(
        Credential, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='servers'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('vault', 'name')
        ordering = ["-modified_at"]
        verbose_name = "Server"
        verbose_name_plural = "Servers"
        db_table = "servers"

    def __str__(self):
        return f"{self.name} ({self.host})"
