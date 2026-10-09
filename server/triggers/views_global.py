import logging
import re
import uuid

from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated

from execution_engine.models import WorkflowRun
from server.rate_limiters import (
    ExecutionBurstThrottle,
    ExecutionSustainedThrottle,
)
from server.utils import api_response
from triggers.models import HttpTrigger, HttpTriggerIdempotencyKey, ScheduleTrigger
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

_RUN_PREFIX_RE = re.compile(r"[0-9a-fA-F-]{4,36}")


class _Ambiguous(Exception):
    def __init__(self, kind: str, matches: list[dict]):
        self.kind, self.matches = kind, matches


def _as_uuid(value: str):
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def _trigger_by_ref(user, ref: str):
    """The caller's HTTP trigger named by a trigger id, workflow id or workflow name."""
    triggers = HttpTrigger.objects.filter(workflow__user=user).select_related("workflow")
    ref_uuid = _as_uuid(ref)
    if ref_uuid:
        hit = triggers.filter(Q(id=ref_uuid) | Q(workflow_id=ref_uuid)).first()
        if hit:
            return hit
    hits = list(triggers.filter(workflow__name__iexact=ref))
    if len(hits) > 1:
        raise _Ambiguous("workflow", [
            {"id": str(t.workflow_id), "name": t.workflow.name, "hint": f"trigger {t.id}"} for t in hits
        ])
    return hits[0] if hits else None


def _keys_for_run(keys, run_ref: str) -> list:
    """Idempotency-key rows (one per webhook run) whose run id is, or starts with, run_ref."""
    run_uuid = _as_uuid(run_ref)
    if run_uuid:
        return list(keys.filter(workflow_run_id=run_uuid)[:2])
    if not _RUN_PREFIX_RE.fullmatch(run_ref):
        return []
    rows = list(keys.filter(workflow_run__id__startswith=run_ref.lower())[:10])
    if len(rows) > 1:
        raise _Ambiguous("run", [
            {"id": str(k.workflow_run_id), "name": k.trigger.workflow.name,
             "hint": f"{k.workflow_run.status} · {k.workflow_run.created_at:%Y-%m-%d %H:%M}"} for k in rows
        ])
    return rows


def _slim_graph(workflow) -> dict:
    """Just what a status graph needs — never parameter values (they can hold secrets)."""
    nodes = []
    for n in workflow.nodes or []:
        data = n.get("data") if isinstance(n.get("data"), dict) else {}
        nodes.append({"id": n.get("id"), "type": n.get("type"),
                      "data": {"label": data.get("label"), "type": data.get("type")}})
    edges = [{"source": e.get("source"), "target": e.get("target"), "sourceHandle": e.get("sourceHandle")}
             for e in workflow.edges or []]
    return {"id": str(workflow.id), "name": workflow.name, "nodes": nodes, "edges": edges}


def _not_found(message: str, code: str):
    return api_response(success=False, message=message, errors={"code": code},
                        status_code=status.HTTP_404_NOT_FOUND)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def resolve_http_trigger_run(request):
    """GET /api/triggers/http/resolve/?ref=<…>[&run=<…>]

    Owner-only lookup (it reveals trigger tokens, so it must never be public) that
    turns a workflow name, trigger id or run id (or the start of one) into the HTTP
    trigger + run to poll, in one call:

      ref alone    a run → the trigger that started it; a trigger/workflow → its
                   most recent webhook run.
      ref + run    ref names the trigger/workflow, run the run (id or prefix).

    Runs are tied to a trigger by its idempotency-key records (one per webhook
    run), so the answer is exact. Returns the public polling path and a slim graph
    shape; 409 lists the candidates when a name or prefix matches several.
    """
    ref = (request.query_params.get("ref") or "").strip()
    run_ref = (request.query_params.get("run") or "").strip()
    if not ref:
        return api_response(success=False, message="Pass ?ref=<workflow name, trigger id or run id>.",
                            status_code=status.HTTP_400_BAD_REQUEST)

    user = request.user
    keys = (HttpTriggerIdempotencyKey.objects
            .filter(trigger__workflow__user=user)
            .select_related("trigger__workflow", "workflow_run"))
    try:
        trigger = _trigger_by_ref(user, ref)
        if trigger is not None:
            trigger_keys = keys.filter(trigger=trigger)
            if run_ref:
                rows = _keys_for_run(trigger_keys, run_ref)
                if not rows:
                    return _not_found(
                        f"No run '{run_ref}' was started by the HTTP trigger for '{trigger.workflow.name}'.",
                        "run_not_found")
            else:
                latest = trigger_keys.order_by("-created_at").first()
                if latest is None:
                    return _not_found(
                        f"The HTTP trigger for '{trigger.workflow.name}' hasn't started any runs yet.",
                        "no_runs_yet")
                rows = [latest]
        elif run_ref:
            return _not_found(f"No HTTP trigger or workflow matches '{ref}'.", "trigger_not_found")
        else:
            rows = _keys_for_run(keys, ref)
            if not rows:
                ref_uuid = _as_uuid(ref)
                own_run = WorkflowRun.objects.filter(user=user)
                exists = (own_run.filter(id=ref_uuid).exists() if ref_uuid
                          else bool(_RUN_PREFIX_RE.fullmatch(ref))
                          and own_run.filter(id__startswith=ref.lower()).exists())
                if exists:
                    return _not_found(f"Run '{ref}' wasn't started by a webhook.", "not_webhook_run")
                return _not_found(f"No HTTP trigger, workflow or webhook run matches '{ref}'.", "not_found")
    except _Ambiguous as amb:
        return api_response(success=False, message=f"Several {amb.kind}s match '{run_ref or ref}'.",
                            errors={"code": "ambiguous", "kind": amb.kind, "matches": amb.matches},
                            status_code=status.HTTP_409_CONFLICT)

    row = rows[0]
    trigger, run = row.trigger, row.workflow_run
    return api_response(
        success=True,
        message="Trigger run found.",
        data={
            "trigger": {
                "id": str(trigger.id),
                "workflow_id": str(trigger.workflow_id),
                "workflow_name": trigger.workflow.name,
                "node_id": trigger.node_id,
                "is_active": trigger.is_active,
                "secret_last4": trigger.secret_last4,
            },
            "run": {"id": str(run.id), "status": run.status, "created_at": run.created_at.isoformat()},
            "polling_path": f"/api/execution-engine/triggers/http/{trigger.trigger_token}/runs/{run.id}/",
            "workflow": _slim_graph(trigger.workflow),
        },
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
            status_code=status.HTTP_200_OK,
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
            status_code=status.HTTP_200_OK,
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
