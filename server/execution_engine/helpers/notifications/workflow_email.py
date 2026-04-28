"""
Send a workflow-completion email to the user who triggered the run.

Triggered from the Celery task at the end of ``execute_workflow`` when the
``WorkflowRun`` was created with ``send_email=True``. Uses Django's standard
SMTP backend (configured via ``GMAIL_USERNAME`` / ``GMAIL_APP_PASSWORD``).

The email contains:
  • A status pill (success / failed / cancelled).
  • An execution-metadata code block (run id, workflow, started/finished
    timestamps, total duration, per-status node counts).
  • A CTA linking back to the workflow's execution page in the frontend so
    the user can read the full logs.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone as dj_timezone

from execution_engine.models import WorkflowRun, WorkflowNodeRun

logger = logging.getLogger(__name__)


# ── Status colour palette (light mode; dark mode is handled in template CSS) ─
_STATUS_PALETTE = {
    "success":   ("Success",   "#dcfce7", "#166534"),
    "failed":    ("Failed",    "#fee2e2", "#991b1b"),
    "cancelled": ("Cancelled", "#ffedd5", "#9a3412"),
}


def _format_dt(value: datetime | None) -> str:
    if not value:
        return "—"
    if dj_timezone.is_naive(value):
        value = dj_timezone.make_aware(value, timezone=dj_timezone.utc)
    return value.strftime("%Y-%m-%d %H:%M:%S UTC")


def _format_duration(start: datetime | None, end: datetime | None) -> str:
    if not start or not end:
        return "—"
    seconds = (end - start).total_seconds()
    if seconds < 0:
        return "—"
    if seconds < 60:
        return f"{seconds:.2f}s"
    mins, secs = divmod(int(seconds), 60)
    return f"{mins}m {secs}s"


def _build_metadata_block(run: WorkflowRun, node_counts: dict[str, int]) -> str:
    """Render the metadata code block as plain text (escaped by template)."""
    workflow_name = getattr(run.workflow, "name", "(unnamed)")
    counts_summary = ", ".join(
        f"{n} {label}"
        for label, n in node_counts.items() if n
    ) or "no node runs recorded"

    lines = [
        f"Workflow      : {workflow_name}",
        f"Run ID        : {run.id}",
        f"Status        : {run.status}",
        f"Started       : {_format_dt(run.started_at)}",
        f"Finished      : {_format_dt(run.finished_at)}",
        f"Duration      : {_format_duration(run.started_at, run.finished_at)}",
        f"Triggered by  : {getattr(run.user, 'username', '') or getattr(run.user, 'email', '')}",
        f"Nodes         : {counts_summary}",
    ]
    return "\n".join(lines)


def _build_execution_url(run: WorkflowRun) -> str:
    base = (getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
    return f"{base}/workflow/execution/{run.workflow_id}"


def send_workflow_completion_email(workflow_run_id: str) -> bool:
    """
    Send the completion email for a finished WorkflowRun.

    Returns True on a successful send, False otherwise (errors are logged but
    never raised — a failed email must NOT fail the workflow run).
    """
    try:
        run = (
            WorkflowRun.objects
            .select_related("workflow", "user")
            .get(id=workflow_run_id)
        )
    except WorkflowRun.DoesNotExist:
        logger.warning("send_workflow_completion_email: run %s missing", workflow_run_id)
        return False

    if not run.send_email or not run.notification_email:
        return False

    if not getattr(settings, "EMAIL_HOST_USER", "") or not getattr(
        settings, "EMAIL_HOST_PASSWORD", ""
    ):
        logger.warning(
            "send_workflow_completion_email: SMTP credentials not configured; skipping run %s",
            workflow_run_id,
        )
        return False

    # Aggregate node-status counts (success / failed / skipped / cancelled / running).
    counts: dict[str, int] = {}
    for status in ("success", "failed", "skipped", "cancelled", "running", "pending"):
        n = WorkflowNodeRun.objects.filter(workflow_run=run, status=status).count()
        if n:
            counts[status] = n

    status_label, status_bg, status_fg = _STATUS_PALETTE.get(
        run.status, (run.status.title(), "#e4e4e7", "#27272a"),
    )

    context: dict[str, Any] = {
        "workflow_name": getattr(run.workflow, "name", "(unnamed workflow)"),
        "status": run.status,
        "status_label": status_label,
        "status_bg": status_bg,
        "status_fg": status_fg,
        "metadata_block": _build_metadata_block(run, counts),
        "error_message": run.error_message or "",
        "execution_url": _build_execution_url(run),
        "run_id_short": str(run.id)[:8],
    }

    subject = (
        f"[Autosage] {context['workflow_name']} — {status_label}"
    )

    html_body = render_to_string("email/workflow_execution_details.html", context)
    text_body = (
        f"Your '{context['workflow_name']}' workflow finished with status "
        f"{run.status}.\n\n"
        f"{context['metadata_block']}\n\n"
        + (f"Error:\n{run.error_message}\n\n" if run.error_message else "")
        + f"View full logs: {context['execution_url']}\n"
    )

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[run.notification_email],
        )
        msg.attach_alternative(html_body, "text/html")
        msg.send(fail_silently=False)
        logger.info(
            "Sent workflow completion email for run %s to %s",
            workflow_run_id, run.notification_email,
        )
        return True
    except Exception:
        logger.exception(
            "Failed to send workflow completion email for run %s", workflow_run_id,
        )
        return False
