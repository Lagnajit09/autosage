"""SageCode (sagex CLI) sign-in and sessions.

Sign-in is a device-authorization flow (after RFC 8628), so it also works over
SSH or on a server with no browser:

  1. CLI   POST auth/start/                  -> device_code (secret), user_code, URL
  2. User  opens /cli-auth?code=… in the web app (Clerk), checks the code matches
           the terminal and approves or denies it:
             GET  auth/requests/<user_code>/
             POST auth/requests/<user_code>/approve/   |   …/deny/
  3. CLI   POST auth/token/ {device_code}    polls: pending, then its new API key once

Sessions (one per API key):

  GET    sessions/            list, for the Profile page and dashboard    browser only
  DELETE sessions/<id>/       revoke                                       browser only
  POST   tokens/              create an access token for CI               browser only
  GET    sessions/current/    `sagex auth status`                         API key only
  DELETE sessions/current/    `sagex auth logout`                         API key only

"Browser only" means a Clerk session. An API key can never approve a sign-in,
mint another key or revoke other sessions, so a leaked key can't entrench itself.
"""

import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny, BasePermission

from server.rate_limiters import (
    CliAuthPollThrottle,
    CliAuthReviewThrottle,
    CliAuthStartThrottle,
    CliTokenCreateThrottle,
)
from server.utils import api_response

from . import cli_sessions
from .cli_sessions import clean_text, client_ip, live_keys, parse_user_agent
from .models import (
    ApiKey,
    CliLoginRequest,
    generate_user_code,
    hash_api_key,
    normalize_user_code,
)

logger = logging.getLogger(__name__)

# How long a `sagex auth login` waits for approval, and how often the CLI polls.
LOGIN_TTL = timedelta(minutes=10)
POLL_INTERVAL_SECONDS = 5

_CODE_NOT_FOUND = (
    "That code isn't valid or has expired. Check the code in your terminal, "
    "or run sagex auth login again."
)
_TOO_MANY_SESSIONS = (
    f"You already have {cli_sessions.MAX_ACTIVE_KEYS} active SageCode sessions. "
    "Revoke ones you no longer use on your Autosage profile page, then try again."
)


class IsBrowserUser(BasePermission):
    """Signed in with Clerk in the web app — not via an API key."""

    message = "Sign in to Autosage in your browser to do this."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and not isinstance(request.auth, ApiKey))


class IsApiKeyClient(BasePermission):
    """Authenticated with an API key (the CLI acting on its own session)."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and isinstance(request.auth, ApiKey))


# --- payloads -----------------------------------------------------------------

def _session_payload(api_key: ApiKey) -> dict:
    return {
        "id": str(api_key.id),
        "kind": api_key.kind,
        "name": api_key.name,
        "last4": api_key.last4,
        "client_os": api_key.client_os,
        "cli_version": api_key.cli_version,
        "last_ip": api_key.last_ip,
        "created_at": api_key.created_at,
        "last_used_at": api_key.last_used_at,
        "expires_at": cli_sessions.expires_at(api_key),
        "commands_run": api_key.commands_run,
        "runs_started": api_key.runs_started,
        "last_command": api_key.last_command,
    }


def _user_payload(user) -> dict:
    return {"email": user.email, "name": user.get_full_name().strip()}


def _login_payload(login: CliLoginRequest) -> dict:
    return {
        "user_code": login.user_code,
        "device_name": login.device_name,
        "client_os": login.client_os,
        "cli_version": login.cli_version,
        "request_ip": login.request_ip,
        "created_at": login.created_at,
        "expires_at": login.expires_at,
    }


def _error(status_code: int, code: str, message: str):
    return api_response(success=False, message=message, data=None,
                        errors={"code": code}, status_code=status_code)


def _body(request) -> dict:
    return request.data if isinstance(request.data, dict) else {}


def _at_session_cap(user, now) -> bool:
    return live_keys(ApiKey.objects.filter(user=user), now).count() >= cli_sessions.MAX_ACTIVE_KEYS


# --- sign-in: the CLI side (public) --------------------------------------------

def _unused_user_code(now) -> str:
    # 20^8 codes, so a clash with a live one is practically impossible; check anyway.
    for _ in range(5):
        code = generate_user_code()
        if not CliLoginRequest.objects.filter(user_code=code, expires_at__gt=now).exists():
            return code
    return code


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([CliAuthStartThrottle])
def cli_auth_start(request):
    """Start a sign-in. Returns the secret device_code (for the CLI only) and the
    user_code + URL to show the user."""
    body = _body(request)
    now = timezone.now()

    # Housekeeping: forget requests that expired more than a day ago.
    CliLoginRequest.objects.filter(expires_at__lt=now - timedelta(days=1)).delete()

    version, ua_os = parse_user_agent(request.headers.get('User-Agent'))
    device_code = secrets.token_urlsafe(32)
    login = CliLoginRequest.objects.create(
        # A high-entropy random token, so a fast hash is enough (as for API keys).
        device_code_hash=hash_api_key(device_code),
        user_code=_unused_user_code(now),
        device_name=clean_text(body.get('device_name'), 100),
        client_os=clean_text(body.get('os'), 100) or ua_os,
        cli_version=clean_text(body.get('cli_version'), 32) or version,
        request_ip=client_ip(request),
        expires_at=now + LOGIN_TTL,
    )

    verification_uri = f"{settings.FRONTEND_URL.rstrip('/')}/cli-auth"
    return api_response(
        success=True,
        message="Sign-in started. Approve it in your browser.",
        data={
            "device_code": device_code,
            "user_code": login.user_code,
            "verification_uri": verification_uri,
            "verification_uri_complete": f"{verification_uri}?code={login.user_code}",
            "expires_in": int(LOGIN_TTL.total_seconds()),
            "interval": POLL_INTERVAL_SECONDS,
        },
        status_code=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([CliAuthPollThrottle])
def cli_auth_token(request):
    """The CLI's poll. 202 while pending; once approved, mints the session's API
    key and returns it exactly once."""
    device_code = str(_body(request).get('device_code') or '').strip()
    if not device_code:
        return _error(400, "invalid_request", "device_code is required.")

    now = timezone.now()
    with transaction.atomic():
        # Row lock: two concurrent polls can't both collect a key.
        login = (
            CliLoginRequest.objects.select_for_update()
            .filter(device_code_hash=hash_api_key(device_code))
            .first()
        )
        if login is None:
            return _error(404, "invalid_code",
                          "This sign-in request doesn't exist. Run sagex auth login again.")
        if login.status == CliLoginRequest.Status.DENIED:
            return _error(403, "access_denied", "The sign-in was denied in the browser.")
        if login.status == CliLoginRequest.Status.COMPLETED:
            return _error(410, "already_used",
                          "This sign-in request was already used. Run sagex auth login again.")
        if now >= login.expires_at:
            return _error(410, "expired",
                          "This sign-in request expired. Run sagex auth login again.")
        if login.status == CliLoginRequest.Status.PENDING:
            return api_response(
                success=True,
                message="Waiting for approval in the browser.",
                data={"status": "pending", "interval": POLL_INTERVAL_SECONDS},
                status_code=status.HTTP_202_ACCEPTED,
            )

        # Approved: mint the key for the user who approved it.
        user = login.user
        if user is None or not user.is_active:
            return _error(403, "access_denied", "This account can't sign in right now.")
        if _at_session_cap(user, now):
            return _error(409, "too_many_sessions", _TOO_MANY_SESSIONS)

        api_key, plaintext = ApiKey.create_for_user(
            user,
            name=login.device_name or "SageCode",
            kind=ApiKey.Kind.DEVICE,
            client_os=login.client_os,
            cli_version=login.cli_version,
            last_ip=client_ip(request),
        )
        login.status = CliLoginRequest.Status.COMPLETED
        login.api_key = api_key
        login.save(update_fields=['status', 'api_key'])
        transaction.on_commit(lambda: _queue_new_device_email(api_key.id))

    return api_response(
        success=True,
        message="Signed in.",
        data={
            "status": "approved",
            "api_key": plaintext,
            "session": _session_payload(api_key),
            "user": _user_payload(user),
        },
    )


def _queue_new_device_email(api_key_id) -> None:
    """Hand the new-device email to Celery; never let it break a sign-in."""
    from .tasks import send_new_device_email

    try:
        send_new_device_email.delay(str(api_key_id))
    except Exception:  # noqa: BLE001 — broker down etc.; the sign-in already succeeded
        logger.exception("Couldn't queue the new-device email for session %s", api_key_id)


# --- sign-in: the browser side (Clerk) -----------------------------------------

def _pending_login(user_code: str, now, *, for_update: bool = False):
    code = normalize_user_code(user_code)
    if not code:
        return None
    queryset = CliLoginRequest.objects.filter(
        user_code=code, status=CliLoginRequest.Status.PENDING, expires_at__gt=now,
    )
    if for_update:
        queryset = queryset.select_for_update()
    return queryset.order_by('-created_at').first()


@api_view(['GET'])
@permission_classes([IsBrowserUser])
@throttle_classes([CliAuthReviewThrottle])
def cli_auth_request_detail(request, user_code):
    """What the approval page shows: the device asking to sign in."""
    login = _pending_login(user_code, timezone.now())
    if login is None:
        return _error(404, "not_found", _CODE_NOT_FOUND)
    return api_response(success=True, message="Sign-in request found.", data=_login_payload(login))


def _decide(request, user_code, approve: bool):
    now = timezone.now()
    with transaction.atomic():
        login = _pending_login(user_code, now, for_update=True)
        if login is None:
            return _error(404, "not_found", _CODE_NOT_FOUND)
        if approve and _at_session_cap(request.user, now):
            return _error(409, "too_many_sessions", _TOO_MANY_SESSIONS)
        login.status = CliLoginRequest.Status.APPROVED if approve else CliLoginRequest.Status.DENIED
        login.user = request.user
        login.decided_at = now
        login.save(update_fields=['status', 'user', 'decided_at'])

    logger.info("SageCode sign-in %s %s by %s", login.user_code,
                "approved" if approve else "denied", request.user.username)
    return api_response(
        success=True,
        message="SageCode is signed in. You can return to your terminal." if approve
        else "Sign-in denied.",
        data={"status": login.status},
    )


@api_view(['POST'])
@permission_classes([IsBrowserUser])
@throttle_classes([CliAuthReviewThrottle])
def cli_auth_approve(request, user_code):
    return _decide(request, user_code, approve=True)


@api_view(['POST'])
@permission_classes([IsBrowserUser])
@throttle_classes([CliAuthReviewThrottle])
def cli_auth_deny(request, user_code):
    return _decide(request, user_code, approve=False)


# --- sessions --------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsBrowserUser])
def cli_session_list(request):
    """The user's working sessions, most recently active first."""
    keys = live_keys(ApiKey.objects.filter(user=request.user)).order_by(
        Coalesce('last_used_at', 'created_at').desc(),
    )
    return api_response(
        success=True,
        message="SageCode sessions retrieved.",
        data={
            "sessions": [_session_payload(key) for key in keys],
            "idle_expiry_days": cli_sessions.IDLE_EXPIRY.days,
        },
    )


@api_view(['DELETE'])
@permission_classes([IsBrowserUser])
def cli_session_revoke(request, session_id):
    api_key = ApiKey.objects.filter(user=request.user, pk=session_id, is_active=True).first()
    if api_key is None:
        return _error(404, "not_found", "That session doesn't exist or was already revoked.")
    cli_sessions.revoke(api_key, ApiKey.RevokeReason.REVOKED)
    logger.info("SageCode session %s revoked by %s", api_key.id, request.user.username)
    return api_response(success=True, message="Session revoked.", data={})


@api_view(['POST'])
@permission_classes([IsBrowserUser])
@throttle_classes([CliTokenCreateThrottle])
def cli_token_create(request):
    """Create an access token for CI (`SAGEX_API_KEY`). Shown once."""
    name = clean_text(_body(request).get('name'), 100)
    if not name:
        return _error(400, "invalid_request", "Give the token a name, like “GitHub Actions”.")
    if _at_session_cap(request.user, timezone.now()):
        return _error(409, "too_many_sessions", _TOO_MANY_SESSIONS)

    api_key, plaintext = ApiKey.create_for_user(request.user, name=name, kind=ApiKey.Kind.TOKEN)
    return api_response(
        success=True,
        message="Token created. Copy it now: it won't be shown again.",
        data={"api_key": plaintext, "session": _session_payload(api_key)},
        status_code=status.HTTP_201_CREATED,
    )


@api_view(['GET', 'DELETE'])
@permission_classes([IsApiKeyClient])
def cli_session_current(request):
    """The calling CLI's own session: details for `auth status`, or sign out."""
    api_key = request.auth
    if request.method == 'DELETE':
        cli_sessions.revoke(api_key, ApiKey.RevokeReason.SIGNED_OUT)
        return api_response(success=True, message="Signed out.", data={})

    api_key.refresh_from_db()      # activity counters are updated in SQL, not on this instance
    return api_response(
        success=True,
        message="Current session retrieved.",
        data={"session": _session_payload(api_key), "user": _user_payload(request.user)},
    )
