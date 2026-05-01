import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated

from server.rate_limiters import (
    ExecutionBurstThrottle,
    ExecutionSustainedThrottle,
)
from server.utils import api_response
from triggers.models import HttpTrigger, ScheduleTrigger
from triggers.serializers import (
    HttpTriggerCreateSerializer,
    ScheduleTriggerUpsertSerializer,
    ScheduleTriggerResponseSerializer,
)
from triggers.utils import (
    delete_beat_task,
    generate_secret,
    generate_trigger_token,
    hash_secret,
    secret_last4,
    sync_beat_task,
)
from workflows.models import Workflow

logger = logging.getLogger(__name__)


# ── HTTP trigger helpers ──────────────────────────────────────────────────────

def _build_trigger_url(request, trigger_token: str) -> str:
    return request.build_absolute_uri(
        f"/api/execution-engine/triggers/http/{trigger_token}/"
    )


def _trigger_payload(request, trigger: HttpTrigger, *, plain_secret: str | None = None) -> dict:
    payload = {
        "node_id": trigger.node_id,
        "trigger_url": _build_trigger_url(request, trigger.trigger_token),
        "secret_last4": trigger.secret_last4,
        "created_at": trigger.created_at.isoformat(),
        "rotated_at": trigger.rotated_at.isoformat() if trigger.rotated_at else None,
        "last_triggered_at": (
            trigger.last_triggered_at.isoformat() if trigger.last_triggered_at else None
        ),
    }
    if plain_secret is not None:
        payload["secret"] = plain_secret
    return payload


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def create_http_trigger(request, workflow_id):
    """Create or rotate the HTTP trigger for a given node.

    The plaintext secret is returned in the response body and is the **only**
    chance the caller has to read it — only its hash is stored.
    """
    try:
        workflow = Workflow.objects.get(id=workflow_id, user=request.user)
    except Workflow.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow not found or access denied.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    serializer = HttpTriggerCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return api_response(
            success=False,
            message="Invalid request data.",
            errors=serializer.errors,
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    node_id = serializer.validated_data["node_id"]
    plain_secret = generate_secret()
    new_token = generate_trigger_token()

    existed = HttpTrigger.objects.filter(workflow=workflow, node_id=node_id).exists()

    trigger, created = HttpTrigger.objects.update_or_create(
        workflow=workflow,
        node_id=node_id,
        defaults={
            "user": request.user,
            "trigger_token": new_token,
            "secret_hash": hash_secret(plain_secret),
            "secret_last4": secret_last4(plain_secret),
            "rotated_at": timezone.now() if existed else None,
            "is_active": True,
        },
    )

    return api_response(
        success=True,
        message="HTTP trigger created." if created else "HTTP trigger rotated.",
        data=_trigger_payload(request, trigger, plain_secret=plain_secret),
        status_code=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["GET", "DELETE"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def http_trigger_detail(request, workflow_id, node_id):
    try:
        workflow = Workflow.objects.get(id=workflow_id, user=request.user)
    except Workflow.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow not found or access denied.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        try:
            trigger = HttpTrigger.objects.get(workflow=workflow, node_id=node_id)
        except HttpTrigger.DoesNotExist:
            return api_response(
                success=False,
                message="HTTP trigger not found for this node.",
                status_code=status.HTTP_404_NOT_FOUND,
            )
        return api_response(
            success=True,
            message="HTTP trigger metadata.",
            data=_trigger_payload(request, trigger),
        )

    # DELETE
    deleted, _ = HttpTrigger.objects.filter(workflow=workflow, node_id=node_id).delete()
    if not deleted:
        return api_response(
            success=False,
            message="HTTP trigger not found for this node.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    return api_response(
        success=True,
        message="HTTP trigger deleted.",
        status_code=status.HTTP_204_NO_CONTENT,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def regenerate_http_trigger_secret(request, workflow_id, node_id):
    """Replace the stored secret hash with a fresh one and return the plaintext."""
    try:
        workflow = Workflow.objects.get(id=workflow_id, user=request.user)
    except Workflow.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow not found or access denied.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    try:
        trigger = HttpTrigger.objects.get(workflow=workflow, node_id=node_id)
    except HttpTrigger.DoesNotExist:
        return api_response(
            success=False,
            message="HTTP trigger not found for this node.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    plain_secret = generate_secret()
    trigger.secret_hash = hash_secret(plain_secret)
    trigger.secret_last4 = secret_last4(plain_secret)
    trigger.rotated_at = timezone.now()
    trigger.save(update_fields=["secret_hash", "secret_last4", "rotated_at"])

    return api_response(
        success=True,
        message="HTTP trigger secret regenerated.",
        data=_trigger_payload(request, trigger, plain_secret=plain_secret),
    )


# ── Schedule trigger views ────────────────────────────────────────────────────

def _schedule_payload(schedule: ScheduleTrigger) -> dict:
    """Build the standard response dict for a ScheduleTrigger."""
    return {
        "node_id": schedule.node_id,
        "cron_expression": schedule.cron_expression,
        "timezone": schedule.timezone,
        "is_active": schedule.is_active,
        "created_at": schedule.created_at.isoformat(),
        "last_triggered_at": (
            schedule.last_triggered_at.isoformat() if schedule.last_triggered_at else None
        ),
        "last_run_id": str(schedule.last_run_id) if schedule.last_run_id else None,
        "last_error": schedule.last_error,
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def upsert_schedule_trigger(request, workflow_id):
    """POST /api/workflows/<workflow_id>/triggers/schedule/

    Create or update (upsert) the schedule trigger for a given node.
    Accepts ``node_id`` and ``cron_expression`` in the request body.
    Creates/updates the linked Celery Beat PeriodicTask atomically.
    """
    try:
        workflow = Workflow.objects.get(id=workflow_id, user=request.user)
    except Workflow.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow not found or access denied.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    serializer = ScheduleTriggerUpsertSerializer(data=request.data)
    if not serializer.is_valid():
        return api_response(
            success=False,
            message="Invalid request data.",
            errors=serializer.errors,
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    node_id = serializer.validated_data["node_id"]
    cron_expression = serializer.validated_data["cron_expression"]

    existed = ScheduleTrigger.objects.filter(workflow=workflow, node_id=node_id).exists()

    schedule, created = ScheduleTrigger.objects.update_or_create(
        workflow=workflow,
        node_id=node_id,
        defaults={
            "user": request.user,
            "cron_expression": cron_expression,
            "is_active": True,
        },
    )

    try:
        sync_beat_task(schedule)
    except Exception as exc:
        logger.error(
            "upsert_schedule_trigger: failed to sync Beat task for schedule %s: %s",
            schedule.id,
            exc,
        )
        return api_response(
            success=False,
            message="Schedule record saved but Beat task sync failed.",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return api_response(
        success=True,
        message="Schedule trigger created." if created else "Schedule trigger updated.",
        data=_schedule_payload(schedule),
        status_code=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["GET", "DELETE"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def schedule_trigger_detail(request, workflow_id, node_id):
    """GET / DELETE /api/workflows/<workflow_id>/triggers/schedule/<node_id>/"""
    try:
        workflow = Workflow.objects.get(id=workflow_id, user=request.user)
    except Workflow.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow not found or access denied.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        try:
            schedule = ScheduleTrigger.objects.get(workflow=workflow, node_id=node_id)
        except ScheduleTrigger.DoesNotExist:
            return api_response(
                success=False,
                message="Schedule trigger not found for this node.",
                status_code=status.HTTP_404_NOT_FOUND,
            )
        return api_response(
            success=True,
            message="Schedule trigger metadata.",
            data=_schedule_payload(schedule),
        )

    # DELETE — remove ScheduleTrigger and the linked Beat PeriodicTask.
    try:
        schedule = ScheduleTrigger.objects.get(workflow=workflow, node_id=node_id)
    except ScheduleTrigger.DoesNotExist:
        return api_response(
            success=False,
            message="Schedule trigger not found for this node.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    task_name = schedule.periodic_task_name
    schedule.delete()
    delete_beat_task(task_name)

    return api_response(
        success=True,
        message="Schedule trigger deleted.",
        status_code=status.HTTP_204_NO_CONTENT,
    )
