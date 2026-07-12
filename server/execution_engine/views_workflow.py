import json
import logging
from django.db import IntegrityError
from django.utils import timezone
from django.http import StreamingHttpResponse
from django.contrib.auth.models import AnonymousUser
from django.views.decorators.csrf import csrf_exempt
from asgiref.sync import sync_to_async
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework import status

from server.utils import api_response
from server.rate_limiters import (
    ExecutionBurstThrottle,
    ExecutionSustainedThrottle,
    HttpTriggerThrottle,
)
from billing.limits import get_limits, get_plan
from workflows.models import Workflow
from execution_engine.models import (
    WorkflowRun,
    WorkflowNodeRun,
    WorkflowRunIdempotencyKey,
)
from scripts.models import Script
from vault.models import Vault, Server, Credential
from execution_engine.serializers import (
    WorkflowRunRequestSerializer,
    WorkflowRunSerializer,
    WorkflowNodeRunSerializer,
)
from execution_engine.helpers.graph import (
    build_dag,
    topological_order,
    validate_executable_nodes,
    NODE_TYPE_ACTION,
)
from execution_engine.helpers.run_builder import RunBuildError, enqueue_workflow_run
from execution_engine.helpers.params import build_needs_params
from execution_engine.helpers.run_intents import create_intent, consume_intent
from execution_engine.tasks import execute_workflow
from execution_engine.helpers.redis_pubsub import subscribe_workflow_logs
from execution_engine.helpers.script_execution.utils import sse_event, json_response, check_throttle

logger = logging.getLogger(__name__)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def trigger_workflow_run(request, workflow_id):
    logger.info(f"Triggering workflow run for ID: {workflow_id}")

    if not request.user.is_staff:
        from django.utils import timezone as tz
        limits = get_limits(request.user)
        cap = limits.get('max_workflow_runs_per_month')
        if cap is not None:
            month_start = tz.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            count = WorkflowRun.objects.filter(user=request.user, created_at__gte=month_start).count()
            if count >= cap:
                from billing.enforcement import PlanLimitExceeded
                raise PlanLimitExceeded('max_workflow_runs_per_month', count, cap, get_plan(request.user))

    try:
        workflow = Workflow.objects.get(id=workflow_id, user=request.user)
    except Workflow.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow not found or access denied.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    serializer = WorkflowRunRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return api_response(
            success=False,
            message="Invalid request data.",
            errors=serializer.errors,
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    inputs = serializer.validated_data.get("inputs", {})
    send_email = serializer.validated_data.get("send_email", False)
    user_email = serializer.validated_data.get("user_email", "") or ""
    # Restricted to {"manual", "autobot"} by the serializer — a client can't
    # forge "http"/"schedule" to disguise a chat-initiated run as a webhook/cron.
    trigger_source = serializer.validated_data.get("trigger_source", "manual")

    # Optional idempotency. The builder Run button sends no key and behaves as
    # before (every click enqueues). Autobot's run/rerun tools always send the
    # per-tool-call id, so a double-call in one LLM turn collapses to one run.
    # Keyed on (user, workflow, key) — see WorkflowRunIdempotencyKey. Webhook /
    # schedule paths keep their own dedup; this only covers manual + autobot.
    idempotency_key = (request.headers.get("Idempotency-Key") or "").strip()
    if len(idempotency_key) > 255:
        return api_response(
            success=False,
            message="Idempotency-Key header exceeds 255 characters.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if idempotency_key:
        # Fast-path replay check.
        existing = (
            WorkflowRunIdempotencyKey.objects
            .select_related("workflow_run")
            .filter(user=request.user, workflow=workflow, key=idempotency_key)
            .first()
        )
        if existing is not None:
            return api_response(
                success=True,
                message="Duplicate request — returning prior workflow run.",
                data={
                    "workflow_run_id": str(existing.workflow_run_id),
                    "status": existing.workflow_run.status,
                    "idempotent": True,
                },
                status_code=status.HTTP_200_OK,
            )

    try:
        workflow_run = enqueue_workflow_run(
            workflow=workflow,
            user=request.user,
            inputs=inputs,
            send_email=send_email,
            user_email=user_email,
            trigger_source=trigger_source,
        )
    except RunBuildError as exc:
        return api_response(
            success=False,
            message=exc.message,
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if idempotency_key:
        # Race-safe insert. If a concurrent request beat us to the same key,
        # surface their run id and accept the orphan we just queued — the unique
        # constraint is the source of truth (mirrors the webhook flow).
        try:
            WorkflowRunIdempotencyKey.objects.create(
                user=request.user,
                workflow=workflow,
                key=idempotency_key,
                workflow_run=workflow_run,
            )
        except IntegrityError:
            existing = (
                WorkflowRunIdempotencyKey.objects
                .select_related("workflow_run")
                .get(user=request.user, workflow=workflow, key=idempotency_key)
            )
            logger.warning(
                "Workflow %s idempotency race: orphan run %s replaced by %s",
                workflow.id, workflow_run.id, existing.workflow_run_id,
            )
            return api_response(
                success=True,
                message="Duplicate request — returning prior workflow run.",
                data={
                    "workflow_run_id": str(existing.workflow_run_id),
                    "status": existing.workflow_run.status,
                    "idempotent": True,
                },
                status_code=status.HTTP_200_OK,
            )

    return api_response(
        success=True,
        message="Workflow execution queued successfully.",
        data={
            "workflow_run_id": str(workflow_run.id),
            "status": "queued",
            "idempotent": False,
        },
        status_code=status.HTTP_202_ACCEPTED,
    )


def _password_param_ids(workflow) -> set[str]:
    """Set of password-typed parameter ids on a workflow (mirrors run_builder)."""
    ids: set[str] = set()
    for node in workflow.nodes:
        for p in (node.get("data", {}).get("parameters") or []):
            if p.get("type") == "password" and p.get("id"):
                ids.add(p["id"])
    return ids


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def create_workflow_run_intent(request, workflow_id):
    """Mint a single-use run intent for the Autobot secure side-channel.

    Autobot calls this (trigger_source must be ``autobot``) instead of
    enqueuing directly when a workflow has run-time parameters. No WorkflowRun
    is created here — the user's browser later POSTs the confirmed params to
    ``fulfill_workflow_run_intent``, which enqueues on the manual path so the
    autobot password drop does not fire.

    The intent stores only the model-proposed non-secret inputs; any
    password-typed input is stripped here too (defense in depth — the model
    should never be sending one). Returns ``{run_intent_id, needs_params}``.
    """
    try:
        workflow = Workflow.objects.get(id=workflow_id, user=request.user)
    except Workflow.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow not found or access denied.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    serializer = WorkflowRunRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return api_response(
            success=False,
            message="Invalid request data.",
            errors=serializer.errors,
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # This endpoint exists ONLY for the autobot side-channel. A manual run
    # never needs an intent (its secrets already come from the browser).
    if serializer.validated_data.get("trigger_source") != "autobot":
        return api_response(
            success=False,
            message="Run intents are only available on the autobot path.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    inputs = dict(serializer.validated_data.get("inputs", {}) or {})
    send_email = serializer.validated_data.get("send_email", False)
    user_email = serializer.validated_data.get("user_email", "") or ""

    # Defense in depth: drop any password-typed input the model shouldn't have
    # sent (mirrors the enqueue_workflow_run autobot scan). The secret only
    # ever arrives later, on the browser fulfill path.
    pwd_ids = _password_param_ids(workflow)
    dropped = [pid for pid in pwd_ids if inputs.get(pid)]
    if dropped:
        inputs = {k: v for k, v in inputs.items() if k not in pwd_ids}
        logger.warning(
            "Dropped %d password-typed input(s) from run-intent for workflow %s: %s",
            len(dropped), workflow.id, sorted(dropped),
        )

    intent_id = create_intent(
        user_id=request.user.id,
        workflow_id=workflow.id,
        inputs=inputs,
        send_email=send_email,
        notification_email=user_email if send_email else "",
    )

    return api_response(
        success=True,
        message="Run intent created.",
        data={
            "run_intent_id": intent_id,
            "needs_params": build_needs_params(workflow.nodes),
        },
        status_code=status.HTTP_202_ACCEPTED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def fulfill_workflow_run_intent(request, run_intent_id):
    """Enqueue the run a prior intent prepared, carrying the browser's params.

    The browser POSTs ``{"params": {<param_id>: <value>, ...}}`` — the full
    confirmed set including any secrets the user typed. We atomically consume
    the intent (single-use), overlay the browser params onto the intent's
    non-secret inputs (browser is authoritative), and enqueue with
    ``trigger_source="manual"``: the secret came from the user's browser over
    TLS, so the autobot password drop must NOT fire. Persist-time masking
    (run_builder) still masks it on the stored row.
    """
    # Atomic fetch-and-delete: a double-submit / expired intent yields None.
    intent = consume_intent(str(run_intent_id))
    if intent is None:
        return api_response(
            success=False,
            message="This run request expired or was already used — ask to run it again.",
            status_code=status.HTTP_410_GONE,
        )

    # Owner check (defense in depth — the id is an unguessable uuid handed only
    # to the owner's browser). The intent is already consumed at this point.
    if str(intent.get("user_id")) != str(request.user.id):
        return api_response(
            success=False,
            message="Run intent does not belong to the current user.",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    try:
        workflow = Workflow.objects.get(id=intent.get("workflow_id"), user=request.user)
    except Workflow.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow not found or access denied.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    params = request.data.get("params")
    if params is not None and not isinstance(params, dict):
        return api_response(
            success=False,
            message="'params' must be an object of {param_id: value}.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # Intent's non-secret inputs, overlaid by the authoritative browser params
    # (secrets + any user edits).
    merged = {**(intent.get("inputs") or {}), **(params or {})}

    try:
        workflow_run = enqueue_workflow_run(
            workflow=workflow,
            user=request.user,
            inputs=merged,
            send_email=bool(intent.get("send_email")),
            user_email=intent.get("notification_email") or "",
            trigger_source="manual",
        )
    except RunBuildError as exc:
        return api_response(
            success=False,
            message=exc.message,
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    return api_response(
        success=True,
        message="Workflow execution queued successfully.",
        data={
            "workflow_run_id": str(workflow_run.id),
            "status": "queued",
        },
        status_code=status.HTTP_202_ACCEPTED,
    )


def _build_polling_url(request, trigger_token: str, run_id) -> str:
    """Absolute URL the caller can GET (with X-Trigger-Secret) to poll status."""
    return request.build_absolute_uri(
        f"/api/execution-engine/triggers/http/{trigger_token}/runs/{run_id}/"
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([HttpTriggerThrottle])
def trigger_workflow_via_http(request, trigger_token):
    """Public webhook entry point for HTTP-trigger nodes.

    Auth: ``X-Trigger-Secret`` header verified against the stored hash.
    Idempotency: ``Idempotency-Key`` header required. Repeat requests with
    the same key on the same trigger return the original run instead of
    queueing a duplicate.

    Returns 202 Accepted on first call, 200 OK on idempotent replay.
    Body shape: ``{"inputs": {...}}`` (forwarded to the Celery task).
    The response includes a ``polling_url`` the caller can GET (with the
    same ``X-Trigger-Secret``) to retrieve run status without logging in.
    """
    # Imported lazily so the views_workflow module doesn't depend on the
    # triggers app at import time (which would create a circular reference
    # during INSTALLED_APPS resolution).
    from triggers.models import HttpTrigger, HttpTriggerIdempotencyKey
    from triggers.utils import verify_secret

    try:
        trigger = HttpTrigger.objects.select_related("workflow", "workflow__user").get(
            trigger_token=trigger_token
        )
    except HttpTrigger.DoesNotExist:
        return api_response(
            success=False,
            message="Trigger not found.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if not trigger.is_active:
        return api_response(
            success=False,
            message="Trigger is disabled.",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    presented_secret = request.headers.get("X-Trigger-Secret", "")
    if not presented_secret or not verify_secret(presented_secret, trigger.secret_hash):
        return api_response(
            success=False,
            message="Invalid trigger secret.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    idempotency_key = (request.headers.get("Idempotency-Key") or "").strip()
    if not idempotency_key:
        return api_response(
            success=False,
            message="Idempotency-Key header is required.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    if len(idempotency_key) > 255:
        return api_response(
            success=False,
            message="Idempotency-Key header exceeds 255 characters.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # Fast-path replay check
    existing = (
        HttpTriggerIdempotencyKey.objects
        .select_related("workflow_run")
        .filter(trigger=trigger, key=idempotency_key)
        .first()
    )
    if existing is not None:
        return api_response(
            success=True,
            message="Duplicate request — returning prior workflow run.",
            data={
                "workflow_run_id": str(existing.workflow_run_id),
                "status": existing.workflow_run.status,
                "idempotent": True,
                "polling_url": _build_polling_url(request, trigger_token, existing.workflow_run_id),
            },
            status_code=status.HTTP_200_OK,
        )

    raw_inputs = request.data.get("inputs", {}) if isinstance(request.data, dict) else {}
    if not isinstance(raw_inputs, dict):
        return api_response(
            success=False,
            message="Request body 'inputs' must be a JSON object.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    workflow = trigger.workflow
    if workflow.user is None:
        return api_response(
            success=False,
            message="Workflow has no owner — cannot run.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    try:
        workflow_run = enqueue_workflow_run(
            workflow=workflow,
            user=workflow.user,
            inputs=raw_inputs,
            send_email=False,
            user_email="",
        )
    except RunBuildError as exc:
        return api_response(
            success=False,
            message=exc.message,
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # Race-safe insert. If another request beat us to it for the same
    # idempotency key, surface their run id (and accept the orphan run we
    # just queued — the unique constraint is the source of truth).
    try:
        HttpTriggerIdempotencyKey.objects.create(
            trigger=trigger,
            key=idempotency_key,
            workflow_run=workflow_run,
        )
    except IntegrityError:
        existing = (
            HttpTriggerIdempotencyKey.objects
            .select_related("workflow_run")
            .get(trigger=trigger, key=idempotency_key)
        )
        logger.warning(
            "HTTP trigger %s race: orphan run %s replaced by %s",
            trigger.id, workflow_run.id, existing.workflow_run_id,
        )
        return api_response(
            success=True,
            message="Duplicate request — returning prior workflow run.",
            data={
                "workflow_run_id": str(existing.workflow_run_id),
                "status": existing.workflow_run.status,
                "idempotent": True,
                "polling_url": _build_polling_url(request, trigger_token, existing.workflow_run_id),
            },
            status_code=status.HTTP_200_OK,
        )

    HttpTrigger.objects.filter(pk=trigger.pk).update(last_triggered_at=timezone.now())

    return api_response(
        success=True,
        message="Workflow execution queued successfully.",
        data={
            "workflow_run_id": str(workflow_run.id),
            "status": "queued",
            "idempotent": False,
            "polling_url": _build_polling_url(request, trigger_token, workflow_run.id),
        },
        status_code=status.HTTP_202_ACCEPTED,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([HttpTriggerThrottle])
def get_workflow_run_via_http_trigger(request, trigger_token, run_id):
    """Public run-status polling endpoint for HTTP-trigger callers.

    Auth: ``X-Trigger-Secret`` header against the same trigger that
    created the run. Visibility is scoped to runs this trigger started
    (looked up via the idempotency-key map) — runs from the manual
    trigger or other HTTP triggers on the same workflow are not exposed
    through this endpoint.

    The response contains run-level status plus a per-node summary.
    Raw stdout/stderr log URLs are intentionally omitted; those remain
    behind Clerk auth in the Autosage UI.
    """
    from triggers.models import HttpTrigger, HttpTriggerIdempotencyKey
    from triggers.utils import verify_secret

    try:
        trigger = HttpTrigger.objects.get(trigger_token=trigger_token)
    except HttpTrigger.DoesNotExist:
        return api_response(
            success=False,
            message="Trigger not found.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if not trigger.is_active:
        return api_response(
            success=False,
            message="Trigger is disabled.",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    presented_secret = request.headers.get("X-Trigger-Secret", "")
    if not presented_secret or not verify_secret(presented_secret, trigger.secret_hash):
        return api_response(
            success=False,
            message="Invalid trigger secret.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    # Run must have been created by THIS trigger (idempotency-key linkage).
    if not HttpTriggerIdempotencyKey.objects.filter(
        trigger=trigger, workflow_run_id=run_id
    ).exists():
        return api_response(
            success=False,
            message="Workflow run not found for this trigger.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    try:
        run = WorkflowRun.objects.get(id=run_id)
    except WorkflowRun.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow run not found for this trigger.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    nodes = [
        {
            "node_id": nr.node_id,
            "node_label": nr.node_label,
            "status": nr.status,
            "execution_order": nr.execution_order,
            "exit_code": nr.exit_code,
            "error_message": nr.error_message,
            "started_at": nr.started_at.isoformat() if nr.started_at else None,
            "finished_at": nr.finished_at.isoformat() if nr.finished_at else None,
        }
        for nr in run.node_runs.all().order_by("execution_order")
    ]

    return api_response(
        success=True,
        message="Workflow run status.",
        data={
            "workflow_run_id": str(run.id),
            "status": run.status,
            "error_message": run.error_message,
            "created_at": run.created_at.isoformat(),
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "nodes": nodes,
        },
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def list_workflow_runs(request):
    """GET /api/execution-engine/workflows/runs/"""
    workflow_id = request.query_params.get('workflow_id')
    runs = WorkflowRun.objects.filter(user=request.user)
    
    if workflow_id:
        runs = runs.filter(workflow_id=workflow_id)
        
    runs = runs.order_by('-created_at')
    serializer = WorkflowRunSerializer(runs, many=True)
    return api_response(
        success=True,
        message="Workflow runs retrieved successfully.",
        data=serializer.data
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def get_workflow_run(request, run_id):
    """GET /api/execution-engine/workflows/runs/<run_id>/"""
    try:
        run = WorkflowRun.objects.get(id=run_id, user=request.user)
    except WorkflowRun.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow run not found.",
            status_code=status.HTTP_404_NOT_FOUND
        )

    serializer = WorkflowRunSerializer(run)
    return api_response(
        success=True,
        message="Workflow run retrieved successfully.",
        data=serializer.data
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def get_workflow_node_runs(request, run_id):
    """GET /api/execution-engine/workflows/runs/<run_id>/nodes/"""
    try:
        run = WorkflowRun.objects.get(id=run_id, user=request.user)
    except WorkflowRun.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow run not found.",
            status_code=status.HTTP_404_NOT_FOUND
        )

    node_runs = WorkflowNodeRun.objects.filter(workflow_run=run).order_by('execution_order')
    serializer = WorkflowNodeRunSerializer(node_runs, many=True)
    return api_response(
        success=True,
        message="Node runs retrieved successfully.",
        data=serializer.data
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def cancel_workflow_run(request, run_id):
    """POST /api/execution-engine/workflows/runs/<run_id>/cancel/"""
    from server.celery import app as celery_app
    
    try:
        run = WorkflowRun.objects.get(id=run_id, user=request.user)
    except WorkflowRun.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow run not found.",
            status_code=status.HTTP_404_NOT_FOUND
        )

    if run.status not in ["queued", "running"]:
        return api_response(
            success=False,
            message=f"Cannot cancel run in '{run.status}' state.",
            status_code=status.HTTP_400_BAD_REQUEST
        )

    if run.celery_task_id:
        celery_app.control.revoke(run.celery_task_id, terminate=True)
        logger.info(f"Revoked Celery task {run.celery_task_id} for WorkflowRun {run.id}")

    # Mark as cancelled
    run.status = "cancelled"
    run.finished_at = timezone.now()
    run.save(update_fields=['status', 'finished_at'])
    
    # Mark running/pending nodes as cancelled
    WorkflowNodeRun.objects.filter(workflow_run=run, status__in=['pending', 'running']).update(
        status='cancelled', 
        finished_at=timezone.now()
    )

    WorkflowRun.objects.filter(id=run_id).update(
        status='cancelled', 
        finished_at=timezone.now()
    )

    return api_response(
        success=True,
        message="Workflow execution cancelled successfully."
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ExecutionBurstThrottle, ExecutionSustainedThrottle])
def rerun_workflow_run(request, run_id):
    """POST /api/execution-engine/workflows/runs/<run_id>/rerun/

    Re-enqueue a prior run's workflow as a fresh run (whole-workflow only —
    there is no resume-from-failed-node). Used by Autobot's investigate →
    fix → rerun loop, but available to any owner. Goes through the single
    ``enqueue_workflow_run`` convergence point with ``trigger_source="autobot"``.

    Body (optional): ``{"inputs": {...}}`` to override the prior run's inputs;
    omitted → reuse the prior run's inputs.
    Header (optional): ``Idempotency-Key`` — same guard as the manual-run view,
    so a double rerun collapses to one new run.
    """
    try:
        prior = WorkflowRun.objects.select_related("workflow").get(
            id=run_id, user=request.user
        )
    except WorkflowRun.DoesNotExist:
        return api_response(
            success=False,
            message="Workflow run not found.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    workflow = prior.workflow

    # Inputs: explicit override wins, else reuse the prior run's inputs.
    override = request.data.get("inputs") if isinstance(request.data, dict) else None
    if override is not None and not isinstance(override, dict):
        return api_response(
            success=False,
            message="Request body 'inputs' must be a JSON object.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    inputs = override if override is not None else (prior.inputs or {})

    # Optional idempotency — shared guard with trigger_workflow_run (X01b).
    idempotency_key = (request.headers.get("Idempotency-Key") or "").strip()
    if len(idempotency_key) > 255:
        return api_response(
            success=False,
            message="Idempotency-Key header exceeds 255 characters.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if idempotency_key:
        existing = (
            WorkflowRunIdempotencyKey.objects
            .select_related("workflow_run")
            .filter(user=request.user, workflow=workflow, key=idempotency_key)
            .first()
        )
        if existing is not None:
            return api_response(
                success=True,
                message="Duplicate request — returning prior workflow run.",
                data={
                    "workflow_run_id": str(existing.workflow_run_id),
                    "status": existing.workflow_run.status,
                    "idempotent": True,
                },
                status_code=status.HTTP_200_OK,
            )

    try:
        workflow_run = enqueue_workflow_run(
            workflow=workflow,
            user=request.user,
            inputs=inputs,
            send_email=prior.send_email,
            user_email=prior.notification_email or "",
            trigger_source="autobot",
        )
    except RunBuildError as exc:
        return api_response(
            success=False,
            message=exc.message,
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if idempotency_key:
        try:
            WorkflowRunIdempotencyKey.objects.create(
                user=request.user,
                workflow=workflow,
                key=idempotency_key,
                workflow_run=workflow_run,
            )
        except IntegrityError:
            existing = (
                WorkflowRunIdempotencyKey.objects
                .select_related("workflow_run")
                .get(user=request.user, workflow=workflow, key=idempotency_key)
            )
            logger.warning(
                "Workflow %s rerun idempotency race: orphan run %s replaced by %s",
                workflow.id, workflow_run.id, existing.workflow_run_id,
            )
            return api_response(
                success=True,
                message="Duplicate request — returning prior workflow run.",
                data={
                    "workflow_run_id": str(existing.workflow_run_id),
                    "status": existing.workflow_run.status,
                    "idempotent": True,
                },
                status_code=status.HTTP_200_OK,
            )

    return api_response(
        success=True,
        message="Workflow re-run queued successfully.",
        data={
            "workflow_run_id": str(workflow_run.id),
            "status": "queued",
            "idempotent": False,
        },
        status_code=status.HTTP_202_ACCEPTED,
    )


# ── Real-time SSE streaming endpoint ─────────────────────────────────────────

@csrf_exempt
async def stream_workflow_run(request, run_id):
    """
    GET /api/execution-engine/workflows/runs/<run_id>/stream/

    Native async Django view that subscribes to the Redis Pub/Sub channel
    for the given workflow run and relays log events as Server-Sent Events.

    The Celery task publishes events to the channel as it processes each
    node. This view yields them in real-time until a ``done`` event is
    received or the connection is closed.

    SSE event types emitted:
        status       – workflow-level status changes (running, success, failed)
        node_start   – a node has started executing
        node_complete– a node has finished (success/failed/skipped)
        stdout       – standard output line from a script node
        stderr       – standard error line from a script node
        exit_code    – exit code from a script node
        log          – generic log line
        done         – workflow execution is complete
    """
    if request.method != "GET":
        return json_response(False, "Method not allowed.", status_code=405)

    # ── Auth check ────────────────────────────────────────────────────────
    user = getattr(request, "user", None)
    if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
        return json_response(False, "Authentication required.", status_code=401)

    # ── Throttling ────────────────────────────────────────────────────────
    check_burst = sync_to_async(check_throttle)
    check_sustained = sync_to_async(check_throttle)

    if not await check_burst(request, ExecutionBurstThrottle):
        return json_response(False, "Rate limit exceeded.", status_code=429)
    if not await check_sustained(request, ExecutionSustainedThrottle):
        return json_response(False, "Rate limit exceeded.", status_code=429)

    # ── Verify the run exists and belongs to the user ─────────────────────
    get_run = sync_to_async(WorkflowRun.objects.get)
    try:
        run = await get_run(id=run_id, user=user)
    except WorkflowRun.DoesNotExist:
        return json_response(False, "Workflow run not found.", status_code=404)

    # If run is already finished, return its final status immediately
    if run.status in ('success', 'failed', 'cancelled'):
        async def finished_stream():
            yield sse_event('status', {
                'workflow_run_id': str(run_id),
                'status': run.status,
                'error_message': run.error_message or '',
            })
            yield sse_event('done', {
                'workflow_run_id': str(run_id),
                'status': run.status,
            })

        response = StreamingHttpResponse(
            finished_stream(),
            content_type='text/event-stream',
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response

    # ── Stream from Redis Pub/Sub ─────────────────────────────────────────
    async def log_stream():
        try:
            async for payload in subscribe_workflow_logs(str(run_id)):
                event_name = payload.get('event', 'log')
                event_data = payload.get('data', {})
                yield sse_event(event_name, event_data)
        except Exception as exc:
            logger.exception("SSE stream error for run %s: %s", run_id, exc)
            yield sse_event('error', {'message': f'Stream error: {str(exc)}'})
            yield sse_event('done', {'workflow_run_id': str(run_id), 'status': 'error'})

    response = StreamingHttpResponse(
        log_stream(),
        content_type='text/event-stream',
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    response['X-Workflow-Run-Id'] = str(run_id)
    return response
