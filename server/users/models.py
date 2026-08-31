import hashlib
import secrets
import uuid

from django.db import models
from django.conf import settings


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile'
    )
    display_name = models.CharField(max_length=150, blank=True)
    bio = models.TextField(max_length=500, blank=True)
    timezone = models.CharField(max_length=64, default='UTC')
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_profiles'

    def __str__(self):
        return f"Profile({self.user.username})"


class UserNotificationSettings(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notification_settings'
    )
    email_notifications = models.BooleanField(default=True)
    push_notifications = models.BooleanField(default=False)
    marketing_emails = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_notification_settings'

    def __str__(self):
        return f"NotificationSettings({self.user.username})"


# --- API keys (for the sagex CLI and other non-browser clients) --------------

_KEY_PREFIX = "sgx_"


def generate_api_key() -> str:
    """Return a new plaintext API key like 'sgx_<43 url-safe chars>'."""
    return _KEY_PREFIX + secrets.token_urlsafe(32)


def hash_api_key(plaintext: str) -> str:
    """SHA-256 hex digest of a key, used for indexed lookup.

    API keys are high-entropy random tokens (not guessable passwords), so a fast
    hash is appropriate — and, unlike bcrypt, it lets us look a key up directly by
    `WHERE key_hash = ...`, since the client sends only the key with no other id.
    """
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


class ApiKey(models.Model):
    """A personal API key authenticating a client (e.g. the sagex CLI) as a user.

    Only the SHA-256 hash and last 4 chars are stored; the plaintext (`sgx_...`)
    is shown exactly once at creation. On a request, the presented key is hashed
    and looked up here, and its `user` becomes `request.user` — so all existing
    per-user scoping applies with no view changes.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='api_keys',
    )
    name = models.CharField(max_length=100, blank=True)          # user label, e.g. "cli on laptop"
    key_hash = models.CharField(max_length=64, unique=True, db_index=True)   # sha256 hex
    last4 = models.CharField(max_length=4, blank=True)           # for display: sgx_…abcd
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'api_keys'
        verbose_name = 'API Key'
        verbose_name_plural = 'API Keys'
        indexes = [models.Index(fields=['user', 'is_active'], name='api_keys_user_active_idx')]

    def __str__(self) -> str:
        return f"ApiKey sgx_…{self.last4} ({self.user.username})"

    @classmethod
    def create_for_user(cls, user, name: str = "") -> tuple["ApiKey", str]:
        """Create a key for `user`; return (instance, plaintext_shown_once)."""
        plaintext = generate_api_key()
        instance = cls.objects.create(
            user=user,
            name=name,
            key_hash=hash_api_key(plaintext),
            last4=plaintext[-4:],
        )
        return instance, plaintext
