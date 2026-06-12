from django.urls import path
from execution_engine import views_script
from execution_engine import views_workflow

app_name = "executions"

urlpatterns = [
    # Main execution endpoint – streams SSE updates
    path("run/", views_script.execute_script, name="execute-script"),

    # Non-streaming sibling – enqueues + returns 202 (used by Autobot run_script)
    path("run/async/", views_script.run_script_async_view, name="execute-script-async"),

    # Polling fallback – returns current execution state as JSON
    path("<uuid:execution_id>/status/", views_script.execution_status, name="execution-status"),

    # Execution History endpoint
    path("history/", views_script.execution_history, name="execution-history"),

    # Unified executions history endpoint
    path("executions/all/", views_script.all_executions, name="all-executions"),

    # Stop execution endpoint
    path("<uuid:execution_id>/stop/", views_script.stop_execution, name="stop-execution"),

    # Workflow Execution Endpoints
    path("workflows/<uuid:workflow_id>/run/", views_workflow.trigger_workflow_run, name="workflow-run"),
    # Autobot secure side-channel (X17): mint a single-use run intent (no run
    # yet), then the browser fulfills it with the confirmed params.
    path("workflows/<uuid:workflow_id>/run/intent/", views_workflow.create_workflow_run_intent, name="workflow-run-intent"),
    path("workflows/runs/intents/<uuid:run_intent_id>/fulfill/", views_workflow.fulfill_workflow_run_intent, name="workflow-run-intent-fulfill"),
    path("workflows/runs/", views_workflow.list_workflow_runs, name="workflow-runs-list"),
    path("workflows/runs/<uuid:run_id>/", views_workflow.get_workflow_run, name="workflow-run-detail"),
    path("workflows/runs/<uuid:run_id>/nodes/", views_workflow.get_workflow_node_runs, name="workflow-run-nodes"),
    path("workflows/runs/<uuid:run_id>/cancel/", views_workflow.cancel_workflow_run, name="workflow-run-cancel"),
    path("workflows/runs/<uuid:run_id>/rerun/", views_workflow.rerun_workflow_run, name="workflow-run-rerun"),
    path("workflows/runs/<uuid:run_id>/stream/", views_workflow.stream_workflow_run, name="workflow-run-stream"),

    # Public HTTP trigger entry point (no Clerk auth — secret in X-Trigger-Secret header)
    path("triggers/http/<str:trigger_token>/", views_workflow.trigger_workflow_via_http, name="http-trigger-execute"),

    # Public run-status polling for HTTP-trigger callers (same X-Trigger-Secret auth)
    path(
        "triggers/http/<str:trigger_token>/runs/<uuid:run_id>/",
        views_workflow.get_workflow_run_via_http_trigger,
        name="http-trigger-run-status",
    ),

    path("health/", views_script.health_check, name="exec-worker-health-check"),

]