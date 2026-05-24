import uuid

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from vault.fields import EncryptedCharField


class LLMConfig(models.Model):
    """A user's BYO LLM provider configuration for Autobot.

    Lives in `autobot_api` (not `vault/`) because it's *settings that happen
    to contain a secret* rather than auth material for a workflow execution
    target. Vault's Credential model holds username/password/ssh_key/cert
    shaped data for SSH / WinRM / SMTP targets; LLMConfig holds structured
    per-provider chat configuration. The Fernet-encrypted `api_key` reuses
    `vault.fields.EncryptedCharField` so secret-at-rest behavior is uniform.

    `api_key` is intentionally NEVER returned by the standard list/retrieve
    serializer. The dedicated `POST .../reveal/` endpoint is the only path
    that hands back the plaintext, mirroring how `vault.Credential` works.
    """

    class Provider(models.TextChoices):
        GEMINI = 'gemini', _('Gemini')
        GROQ = 'groq', _('Groq')
        OPENROUTER = 'openrouter', _('OpenRouter')
        ANTHROPIC = 'anthropic', _('Anthropic')
        OPENAI = 'openai', _('OpenAI')
        AZURE_OPENAI = 'azure_openai', _('Azure OpenAI')
        CUSTOM = 'custom', _('Custom (LiteLLM-compatible)')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='llm_configs',
    )

    name = models.CharField(max_length=255)
    provider = models.CharField(max_length=32, choices=Provider.choices)

    # Encrypted at rest. Field type is identical to vault.Credential.password
    # so an admin who can read the DB sees ciphertext, not plaintext.
    api_key = EncryptedCharField(max_length=1024)

    # LiteLLM-style identifier: provider/model when not OpenAI-shaped,
    # e.g. "gemini/gemini-1.5-flash", "groq/llama-3.1-70b-versatile".
    model_name = models.CharField(max_length=255)

    # Azure OpenAI requires an API version; other providers ignore this.
    api_version = models.CharField(max_length=64, blank=True)

    # For OpenRouter / self-hosted / custom proxies. Leave blank for the
    # provider's own default endpoint.
    base_url = models.URLField(max_length=512, blank=True)

    # Per-config addendum to the global Autobot system prompt. Empty by
    # default; users can use this to specialize the assistant per config
    # ("respond in JSON", "concise answers only", etc.).
    system_instruction = models.TextField(blank=True)

    # At most one default per user — enforced in save() because a partial
    # unique index would be Postgres-specific and overkill for v1.
    is_default = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'name')
        ordering = ['-modified_at']
        indexes = [
            models.Index(fields=['user', 'is_default']),
        ]
        verbose_name = 'LLM Configuration'
        verbose_name_plural = 'LLM Configurations'
        db_table = 'llm_configs'

    def __str__(self) -> str:
        return f"{self.name} ({self.provider})"

    def save(self, *args, **kwargs):
        # If this row is being saved as default, demote every other default
        # for the same user. Keeps the "max one default per user" invariant
        # without needing a partial unique index or a separate constraint.
        if self.is_default:
            LLMConfig.objects.filter(
                user=self.user, is_default=True,
            ).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)
