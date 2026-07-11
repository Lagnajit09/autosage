from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
import logging

from workflows.models import Workflow
from scripts.models import Script
from execution_engine.models import ScriptExecution, WorkflowRun
from server.utils import api_response

logger = logging.getLogger(__name__)

def format_duration(duration_delta):
    if not duration_delta:
        return "0s"
    seconds = int(duration_delta.total_seconds())
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds / 60
    if minutes < 60:
        return f"{minutes:.1f}m"
    hours = minutes / 60
    return f"{hours:.1f}h"

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    """
    Get the total workflows, scripts, and executions (both script executions and workflow runs)
    owned by the current authenticated user, and retrieve the 3 most recent records of each.
    """
    from django.db.models import Count, Q
    from django.utils import timezone

    user = request.user
    now = timezone.now()
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # 1. Total counts (filtered by user/owner to ensure authorization checks)
    workflows_count = Workflow.objects.filter(user=user).count()
    scripts_count = Script.objects.filter(owner=user).count()
    script_execs_count = ScriptExecution.objects.filter(user=user).count()
    workflow_runs_count = WorkflowRun.objects.filter(user=user).count()
    total_executions = script_execs_count + workflow_runs_count

    # 1b. Current month counts
    workflows_current_month = Workflow.objects.filter(
        Q(user=user) & (Q(created_at__gte=start_of_month) | Q(modified_at__gte=start_of_month))
    ).distinct().count()

    scripts_current_month = Script.objects.filter(
        Q(owner=user) & (Q(uploaded_at__gte=start_of_month) | Q(updated_at__gte=start_of_month))
    ).distinct().count()

    script_execs_current_month = ScriptExecution.objects.filter(
        Q(user=user) & (Q(created_at__gte=start_of_month) | Q(updated_at__gte=start_of_month))
    ).distinct().count()

    workflow_runs_current_month = WorkflowRun.objects.filter(
        Q(user=user) & Q(created_at__gte=start_of_month)
    ).distinct().count()

    executions_current_month = script_execs_current_month + workflow_runs_current_month

    # 2. Recent 3 Workflows (by modified_at)
    recent_workflows_qs = Workflow.objects.filter(user=user).order_by('-modified_at')[:3]
    recent_workflows = []
    for wf in recent_workflows_qs:
        recent_workflows.append({
            'id': str(wf.id),
            'title': wf.name,
            'type': 'workflow',
            'date': wf.modified_at.isoformat(),
            'status': 'active',
            'total_nodes': len(wf.nodes) if isinstance(wf.nodes, list) else 0,
            'total_edges': len(wf.edges) if isinstance(wf.edges, list) else 0,
        })

    # 3. Recent 3 Scripts (by updated_at)
    recent_scripts_qs = Script.objects.filter(owner=user).order_by('-updated_at')[:3]
    recent_scripts = []
    for sc in recent_scripts_qs:
        recent_scripts.append({
            'title': sc.name,
            'type': 'script',
            'date': sc.updated_at.isoformat(),
        })

    # 4. Failure counts and success rate
    script_execs_failed = ScriptExecution.objects.filter(
        user=user, status__in=['failed', 'cancelled']
    ).count()
    workflow_runs_failed = WorkflowRun.objects.filter(
        user=user, status__in=['failed', 'cancelled']
    ).count()
    total_failed = script_execs_failed + workflow_runs_failed
    success_rate = round(
        ((total_executions - total_failed) / total_executions * 100), 1
    ) if total_executions > 0 else 100.0

    # 5. Top workflows by run count (up to 5)
    top_workflows_qs = (
        WorkflowRun.objects.filter(user=user)
        .values('workflow_id', 'workflow__name')
        .annotate(
            run_count=Count('id'),
            success_count=Count('id', filter=Q(status='success')),
        )
        .order_by('-run_count')[:3]
    )
    top_workflows = [
        {
            'id': str(item['workflow_id']),
            'name': item['workflow__name'] or 'Unnamed Workflow',
            'executions': item['run_count'],
            'successRate': round(
                (item['success_count'] / item['run_count']) * 100
            ) if item['run_count'] > 0 else 0,
        }
        for item in top_workflows_qs
    ]

    # 6. Recent 3 Executions (by created_at)
    latest_script_execs = ScriptExecution.objects.filter(user=user).order_by('-created_at')[:3]
    latest_workflow_runs = WorkflowRun.objects.filter(user=user).order_by('-created_at')[:3]

    combined_executions = []
    for se in latest_script_execs:
        combined_executions.append({
            'name': f"Script: {se.script.name}" if se.script else "Unknown Script",
            'status': 'success' if se.status == 'completed' else ('failed' if se.status in ['failed', 'cancelled'] else 'running'),
            'time': se.created_at.isoformat(),
            'duration': format_duration(se.duration) if se.duration else (format_duration(se.completed_at - se.started_at) if se.completed_at and se.started_at else '0s'),
            'timestamp': se.created_at
        })
    for wr in latest_workflow_runs:
        combined_executions.append({
            'name': f"Workflow: {wr.workflow.name}" if wr.workflow else "Unknown Workflow",
            'status': 'success' if wr.status == 'success' else ('failed' if wr.status in ['failed', 'cancelled'] else 'running'),
            'time': wr.created_at.isoformat(),
            'duration': format_duration(wr.finished_at - wr.started_at) if wr.finished_at and wr.started_at else '0s',
            'timestamp': wr.created_at
        })

    # Sort combined list by timestamp descending
    combined_executions.sort(key=lambda x: x['timestamp'], reverse=True)
    recent_executions = combined_executions[:3]

    # Clean up the internal timestamp key
    for exec_item in recent_executions:
        exec_item.pop('timestamp', None)

    data = {
        'stats': {
            'workflows': workflows_count,
            'workflows_current_month': workflows_current_month,
            'scripts': scripts_count,
            'scripts_current_month': scripts_current_month,
            'executions': total_executions,
            'executions_current_month': executions_current_month,
            'success_rate': success_rate,
        },
        'recentWorkflows': recent_workflows,
        'recentScripts': recent_scripts,
        'recentExecutions': recent_executions,
        'topWorkflows': top_workflows,
    }

    return api_response(
        success=True,
        message="Dashboard summary retrieved successfully.",
        data=data,
        status_code=status.HTTP_200_OK
    )

