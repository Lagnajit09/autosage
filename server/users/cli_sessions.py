"""SageCode (sagex CLI) sessions: idle expiry and the activity summary.

Every API key is a session. Its activity is recorded from the requests it makes,
so the CLI never sends a separate telemetry call:

  User-Agent:          sagex/1.1.0 (Windows 11)   -> cli_version, client_os
  X-Sagex-Invocation:  <32 hex chars>             -> one id per CLI process; a new
                                                     id counts one command
  X-Sagex-Command:     run workflow               -> last_command

Writes are rare: at most one UPDATE per CLI command, plus the throttled
last_used_at stamp. Runs started are counted by ClerkAuthMiddleware once the
response is known (see RUN_URL_NAMES).

All of this is display data reported by the client; nothing here is used for an
authorization decision except the idle expiry, which only uses server-side times.
"""

import ipaddress
import re
from datetime import timedelta

from django.db.models import F, Q
from django.utils import timezone

# A session unused for this long stops working (the user just signs in again).
IDLE_EXPIRY = timedelta(days=90)

# Refresh last_used_at at most this often, instead of a write per request.
TOUCH_INTERVAL = timedelta(minutes=5)

# Cap on active sessions per user, so a script can't mint keys without bound.
MAX_ACTIVE_KEYS = 25

INVOCATION_HEADER = 'X-Sagex-Invocation'
COMMAND_HEADER = 'X-Sagex-Command'

# Successful responses from these routes mean a run was started.
RUN_URL_NAMES = frozenset({
    'execute-script',          # sagex run script (live)
    'execute-script-async',
    'workflow-run',            # sagex run workflow
    'workflow-run-rerun',
    'schedule-trigger-fire',   # sagex trigger fire <schedule>
})

_USER_AGENT_RE = re.compile(r'^sagex/(?P<version>[0-9A-Za-z.+-]{1,32})(?: \((?P<os>[^()]{1,100})\))?')
_INVOCATION_RE = re.compile(r'^[0-9a-f]{32}$')
_COMMAND_RE = re.compile(r'^[a-z][a-z -]{0,63}$')


def client_ip(request) -> str | None:
    """The caller's IP, for display and per-IP throttling.

    nginx sets X-Real-IP to the connecting address (overwriting anything the
    client sent); without nginx (local dev) REMOTE_ADDR is the client itself.
    """
    meta = request.META
    for candidate in (meta.get('HTTP_X_REAL_IP'), meta.get('REMOTE_ADDR')):
        try:
            return str(ipaddress.ip_address((candidate or '').strip()))
        except ValueError:
            continue
    return None


def parse_user_agent(value: str | None) -> tuple[str, str]:
    """('1.1.0', 'Windows 11') from 'sagex/1.1.0 (Windows 11)'; blanks if not sagex."""
    match = _USER_AGENT_RE.match(value or '')
    if not match:
        return '', ''
    return match.group('version'), (match.group('os') or '').strip()


def clean_text(value, max_length: int) -> str:
    """A client-supplied label, trimmed, single-line and length-capped."""
    text = ' '.join(str(value or '').split())
    return ''.join(ch for ch in text if ch.isprintable())[:max_length]


def last_active(api_key):
    return api_key.last_used_at or api_key.created_at


def expires_at(api_key):
    """When the session expires if it isn't used before then."""
    return last_active(api_key) + IDLE_EXPIRY


def is_expired(api_key, now=None) -> bool:
    return (now or timezone.now()) >= expires_at(api_key)


def live_keys(queryset, now=None):
    """Narrow an ApiKey queryset to sessions that still work (active, not idle-expired)."""
    cutoff = (now or timezone.now()) - IDLE_EXPIRY
    return queryset.filter(is_active=True).filter(
        Q(last_used_at__gt=cutoff) | Q(last_used_at__isnull=True, created_at__gt=cutoff)
    )


def revoke(api_key, reason: str, now=None) -> None:
    """Switch a session off for good. Idempotent."""
    now = now or timezone.now()
    type(api_key).objects.filter(pk=api_key.pk, is_active=True).update(
        is_active=False, revoked_at=now, revoke_reason=reason,
    )
    api_key.is_active = False
    api_key.revoked_at = now
    api_key.revoke_reason = reason


def record_request(api_key, request, now=None) -> None:
    """Fold one authenticated request into the session's activity summary."""
    now = now or timezone.now()
    updates = {}

    last = api_key.last_used_at
    if last is None or now - last > TOUCH_INTERVAL:
        updates['last_used_at'] = now

    invocation = (request.headers.get(INVOCATION_HEADER) or '').strip().lower()
    new_command = bool(_INVOCATION_RE.match(invocation)) and invocation != api_key.last_invocation
    if new_command:
        command = (request.headers.get(COMMAND_HEADER) or '').strip().lower()
        updates.update(
            commands_run=F('commands_run') + 1,
            last_invocation=invocation,
            last_command=command if _COMMAND_RE.match(command) else '',
            last_used_at=now,
        )

    if 'last_used_at' in updates:
        ip = client_ip(request)
        if ip and ip != api_key.last_ip:
            updates['last_ip'] = ip

    version, client_os = parse_user_agent(request.headers.get('User-Agent'))
    if version and version != api_key.cli_version:
        updates['cli_version'] = version
    if client_os and client_os != api_key.client_os:
        updates['client_os'] = client_os

    if not updates:
        return

    queryset = type(api_key).objects.filter(pk=api_key.pk)
    if new_command:
        # Requests from one CLI process can arrive concurrently; only the first
        # to land counts the command (the row lock makes the rest see the new id).
        queryset = queryset.exclude(last_invocation=invocation)
    queryset.update(**updates)


def record_run_started(api_key) -> None:
    type(api_key).objects.filter(pk=api_key.pk).update(runs_started=F('runs_started') + 1)


def inactive_message(api_key) -> str:
    """Why a known key no longer works, phrased for the CLI user."""
    reason = api_key.revoke_reason
    if reason == api_key.RevokeReason.EXPIRED:
        days = IDLE_EXPIRY.days
        return f'This SageCode session expired after {days} days without use. Sign in again: sagex auth login'
    if reason == api_key.RevokeReason.SIGNED_OUT:
        return 'This SageCode session was signed out. Sign in again: sagex auth login'
    return 'This SageCode session was revoked. Sign in again: sagex auth login'
