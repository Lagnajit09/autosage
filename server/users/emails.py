"""Account emails for the users app.

``send_new_device_email`` tells a user that SageCode (the sagex CLI) was signed
in to their account on a device it hasn't seen before, with a link to review and
revoke their sessions. Like the workflow-completion email it never raises: a
failed email must not affect the sign-in that triggered it.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from users.models import ApiKey

logger = logging.getLogger(__name__)


def _format_dt(value) -> str:
    return value.strftime("%Y-%m-%d %H:%M UTC") if value else "—"


def send_new_device_email(api_key_id: str) -> bool:
    """Send the new-device notice for a fresh device session. Returns True if sent."""
    api_key = ApiKey.objects.select_related("user").filter(pk=api_key_id).first()
    if api_key is None or api_key.kind != ApiKey.Kind.DEVICE:
        return False

    user = api_key.user
    if not user.email:
        logger.info("send_new_device_email: user %s has no email; skipping", user.username)
        return False
    if not settings.EMAIL_HOST_USER or not settings.EMAIL_HOST_PASSWORD:
        logger.warning("send_new_device_email: SMTP credentials not configured; skipping")
        return False

    # Signing in again on a known machine (same name and OS) isn't news.
    seen_before = ApiKey.objects.filter(
        user=user,
        kind=ApiKey.Kind.DEVICE,
        name=api_key.name,
        client_os=api_key.client_os,
        created_at__lt=api_key.created_at,
    ).exists()
    if seen_before:
        return False

    device = api_key.name or "Unknown device"
    sessions_url = f"{settings.FRONTEND_URL.rstrip('/')}/profile#sagecode"
    details = "\n".join([
        f"Device   : {device}",
        f"System   : {api_key.client_os or '—'}",
        f"SageCode : {api_key.cli_version or '—'}",
        f"IP       : {api_key.last_ip or '—'}",
        f"Time     : {_format_dt(api_key.created_at)}",
    ])
    context = {"device": device, "details": details, "sessions_url": sessions_url}

    subject = f"[Autosage] New SageCode sign-in on {device}"
    text_body = (
        "SageCode was just signed in to your Autosage account on a new device.\n\n"
        f"{details}\n\n"
        "If this was you, there's nothing to do.\n"
        "If it wasn't, revoke the session now and check your account: "
        f"{sessions_url}\n"
    )
    html_body = render_to_string("email/sagecode_new_device.html", context)

    try:
        message = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        )
        message.attach_alternative(html_body, "text/html")
        message.send(fail_silently=False)
        logger.info("Sent new-device email for session %s", api_key.id)
        return True
    except Exception:  # noqa: BLE001
        logger.exception("Failed to send new-device email for session %s", api_key.id)
        return False
