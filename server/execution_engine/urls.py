from django.urls import path
from execution_engine import views_script
from execution_engine import views_workflow

app_name = "executions"

urlpatterns = [
    # Main execution endpoint – streams SSE updates
    path("run/", views_script.execute_script, name="execute-script"),

    # Polling fallback – returns current execution state as JSON
    path("<uuid:execution_id>/status/", views_script.execution_status, name="execution-status"),

    # Execution History endpoint
    path("history/", views_script.execution_history, name="execution-history"),

    # Stop execution endpoint
    path("<uuid:execution_id>/stop/", views_script.stop_execution, name="stop-execution"),

    # Workflow Execution Endpoints
    path("workflows/<uuid:workflow_id>/run/", views_workflow.trigger_workflow_run, name="workflow-run"),
    path("workflows/runs/", views_workflow.list_workflow_runs, name="workflow-runs-list"),
    path("workflows/runs/<uuid:run_id>/", views_workflow.get_workflow_run, name="workflow-run-detail"),
    path("workflows/runs/<uuid:run_id>/nodes/", views_workflow.get_workflow_node_runs, name="workflow-run-nodes"),
    path("workflows/runs/<uuid:run_id>/cancel/", views_workflow.cancel_workflow_run, name="workflow-run-cancel"),
    path("workflows/runs/<uuid:run_id>/stream/", views_workflow.stream_workflow_run, name="workflow-run-stream"),

    path("health/", views_script.health_check, name="exec-worker-health-check"),

]