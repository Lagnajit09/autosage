from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
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

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_user(request):
    """
    Update the current authenticated user's profile information.
    Expected payload: { first_name?: string, last_name?: string, email?: string }
    """
    user = request.user
    data = request.data

    first_name = data.get('first_name')
    last_name = data.get('last_name')
    email = data.get('email')

    updated_fields = []

    if first_name is not None:
        user.first_name = first_name
        updated_fields.append('first_name')
    
    if last_name is not None:
        user.last_name = last_name
        updated_fields.append('last_name')
    
    if email is not None:
        user.email = email
        updated_fields.append('email')

    if updated_fields:
        user.save(update_fields=updated_fields)
        logger.info(f"User {user.username} updated fields: {', '.join(updated_fields)}")
        return Response({
            "message": "User updated successfully",
            "updated_fields": updated_fields
        }, status=status.HTTP_200_OK)
    
    return Response({
        "message": "No fields provided to update"
    }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    """
    Get the total workflows, scripts, and executions (both script executions and workflow runs)
    owned by the current authenticated user, and retrieve the 3 most recent records of each.
    """
    from django.db.models import Q
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

    # 4. Recent 3 Executions (by created_at)
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
        },
        'recentWorkflows': recent_workflows,
        'recentScripts': recent_scripts,
        'recentExecutions': recent_executions,
    }

    return api_response(
        success=True,
        message="Dashboard summary retrieved successfully.",
        data=data,
        status_code=status.HTTP_200_OK
    )

