import logging

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
    HttpTriggerListSerializer,
    ScheduleTriggerListSerializer,
)
from triggers.utils import delete_beat_task, sync_beat_task

logger = logging.getLogger(__name__)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def list_all_triggers(request):
    """List all HTTP and Schedule triggers for the authenticated user."""
    http_triggers = HttpTrigger.objects.filter(user=request.user).select_related('workflow')
    schedule_triggers = ScheduleTrigger.objects.filter(user=request.user).select_related('workflow')

    http_data = HttpTriggerListSerializer(http_triggers, many=True, context={'request': request}).data
    schedule_data = ScheduleTriggerListSerializer(schedule_triggers, many=True).data

    return api_response(
        success=True,
        message="Triggers retrieved successfully.",
        data={
            "http_triggers": http_data,
            "schedule_triggers": schedule_data,
        }
    )

@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def manage_http_trigger(request, trigger_id):
    try:
        trigger = HttpTrigger.objects.get(id=trigger_id, user=request.user)
    except HttpTrigger.DoesNotExist:
        return api_response(
            success=False,
            message="HTTP Trigger not found.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "DELETE":
        trigger.delete()
        return api_response(
            success=True,
            message="HTTP trigger deleted.",
            status_code=status.HTTP_204_NO_CONTENT,
        )
    
    # PATCH
    is_active = request.data.get("is_active")
    if is_active is not None:
        trigger.is_active = bool(is_active)
        trigger.save(update_fields=['is_active'])

    return api_response(
        success=True,
        message="HTTP trigger updated.",
    )

@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def manage_schedule_trigger(request, trigger_id):
    try:
        trigger = ScheduleTrigger.objects.get(id=trigger_id, user=request.user)
    except ScheduleTrigger.DoesNotExist:
        return api_response(
            success=False,
            message="Schedule Trigger not found.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "DELETE":
        task_name = trigger.periodic_task_name
        trigger.delete()
        delete_beat_task(task_name)
        return api_response(
            success=True,
            message="Schedule trigger deleted.",
            status_code=status.HTTP_204_NO_CONTENT,
        )
    
    # PATCH
    is_active = request.data.get("is_active")
    if is_active is not None:
        trigger.is_active = bool(is_active)
        trigger.save(update_fields=['is_active'])
        sync_beat_task(trigger)

    return api_response(
        success=True,
        message="Schedule trigger updated.",
    )
