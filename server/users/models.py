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

    Each key is also a SageCode *session*: the device it signed in from and a
    summary of what it has done (see users/cli_sessions.py), shown on the
    Profile page where the user can revoke it.
    """

    class Kind(models.TextChoices):
        DEVICE = 'device', 'Device sign-in'      # `sagex auth login` (browser approval)
        TOKEN = 'token', 'Access token'           # created on the Profile page, for CI
        ADMIN = 'admin', 'Issued key'             # manage.py create_api_key (v1 invite keys)

    class RevokeReason(models.TextChoices):
        SIGNED_OUT = 'signed_out', 'Signed out'   # `sagex auth logout`
        REVOKED = 'revoked', 'Revoked'            # from the Profile page
        EXPIRED = 'expired', 'Expired'            # unused for IDLE_EXPIRY

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='api_keys',
    )
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.ADMIN)
    name = models.CharField(max_length=100, blank=True)          # device hostname or token label
    key_hash = models.CharField(max_length=64, unique=True, db_index=True)   # sha256 hex
    last4 = models.CharField(max_length=4, blank=True)           # for display: sgx_…abcd
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoke_reason = models.CharField(max_length=12, choices=RevokeReason.choices, blank=True)

    # Client details, reported by the CLI (User-Agent) — display only, never trusted.
    client_os = models.CharField(max_length=100, blank=True)
    cli_version = models.CharField(max_length=32, blank=True)
    last_ip = models.GenericIPAddressField(null=True, blank=True)

    # Activity summary. A "command" is one CLI process (one `sagex …` invocation,
    # or one terminal-app session) that called the API at least once.
    commands_run = models.PositiveIntegerField(default=0)
    runs_started = models.PositiveIntegerField(default=0)
    last_command = models.CharField(max_length=64, blank=True)
    last_invocation = models.CharField(max_length=32, blank=True)

    class Meta:
        db_table = 'api_keys'
        verbose_name = 'API Key'
        verbose_name_plural = 'API Keys'
        indexes = [models.Index(fields=['user', 'is_active'], name='api_keys_user_active_idx')]

    def __str__(self) -> str:
        return f"ApiKey sgx_…{self.last4} ({self.user.username})"

    @classmethod
    def create_for_user(cls, user, name: str = "", **fields) -> tuple["ApiKey", str]:
        """Create a key for `user`; return (instance, plaintext_shown_once).

        Extra ``fields`` (kind, client_os, cli_version, last_ip) are set as given.
        """
        plaintext = generate_api_key()
        instance = cls.objects.create(
            user=user,
            name=name,
            key_hash=hash_api_key(plaintext),
            last4=plaintext[-4:],
            **fields,
        )
        return instance, plaintext


# --- `sagex auth login` (device authorization, after RFC 8628) ---------------

# No vowels (so codes never spell words) and no look-alikes like 0/O or 1/I.
USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ"


def generate_user_code() -> str:
    """Return a short code the user compares in the browser, like 'WDJB-MJHT'."""
    raw = "".join(secrets.choice(USER_CODE_ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


def normalize_user_code(value: str) -> str:
    """Canonical form of a typed code: 'wdjb mjht' / 'WDJBMJHT' -> 'WDJB-MJHT'."""
    letters = "".join(ch for ch in (value or "").upper() if ch.isalpha())
    return f"{letters[:4]}-{letters[4:]}" if len(letters) == 8 else ""


class CliLoginRequest(models.Model):
    """One `sagex auth login` attempt, waiting for the user to approve it.

    The CLI holds a secret ``device_code`` (only its hash is stored) and shows the
    user a short ``user_code``. The user opens the web app, signs in with Clerk,
    checks the code matches and approves; the CLI, polling with its device_code,
    then receives a brand-new API key exactly once.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'      # approved in the browser; key not collected yet
        DENIED = 'denied', 'Denied'
        COMPLETED = 'completed', 'Completed'   # the CLI collected its key

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device_code_hash = models.CharField(max_length=64, unique=True)    # sha256 hex
    user_code = models.CharField(max_length=9, db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='cli_login_requests',
    )
    api_key = models.ForeignKey(
        ApiKey,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    device_name = models.CharField(max_length=100, blank=True)
    client_os = models.CharField(max_length=100, blank=True)
    cli_version = models.CharField(max_length=32, blank=True)
    request_ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'cli_login_requests'
        indexes = [models.Index(fields=['expires_at'], name='cli_login_expires_idx')]

    def __str__(self) -> str:
        return f"CliLoginRequest {self.user_code} ({self.status})"
