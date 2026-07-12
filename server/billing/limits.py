from django.utils import timezone

_UNLIMITED = None

PLAN_LIMITS = {
    'free': {
        'max_workflows': 5,
        'max_scripts': 10,
        'max_script_executions_per_month': 50,
        'max_workflow_runs_per_month': 30,
        'max_autobot_admin_messages_per_day': 10,
        'max_autobot_threads': 10,
        'max_http_triggers': 1,
        'max_schedule_triggers': 1,
        'max_vault_entries': 5,
        'execution_mode': False,
    },
    'pro': {
        'max_workflows': 50,
        'max_scripts': 100,
        'max_script_executions_per_month': 500,
        'max_workflow_runs_per_month': 300,
        'max_autobot_admin_messages_per_day': 100,
        'max_autobot_threads': _UNLIMITED,
        'max_http_triggers': 20,
        'max_schedule_triggers': 20,
        'max_vault_entries': 50,
        'execution_mode': True,
    },
    'enterprise': {
        'max_workflows': _UNLIMITED,
        'max_scripts': _UNLIMITED,
        'max_script_executions_per_month': _UNLIMITED,
        'max_workflow_runs_per_month': _UNLIMITED,
        'max_autobot_admin_messages_per_day': _UNLIMITED,
        'max_autobot_threads': _UNLIMITED,
        'max_http_triggers': _UNLIMITED,
        'max_schedule_triggers': _UNLIMITED,
        'max_vault_entries': _UNLIMITED,
        'execution_mode': True,
    },
}

PLAN_DISPLAY = {
    'free': {'name': 'Free', 'price_monthly': 0, 'price_yearly': 0},
    'pro': {'name': 'Pro', 'price_monthly': 15, 'price_yearly': 120},
    'enterprise': {'name': 'Enterprise', 'price_monthly': None, 'price_yearly': None},
}


def get_plan(user) -> str:
    """Return the effective plan for a user. Admins always get enterprise."""
    if user.is_staff:
        return 'enterprise'
    try:
        sub = user.subscription
        if sub.status == sub.STATUS_ACTIVE:
            return sub.plan
    except Exception:
        pass
    return 'free'


def get_limits(user) -> dict:
    return PLAN_LIMITS[get_plan(user)]


def get_or_create_subscription(user):
    """Return the user's subscription, creating a free one if absent."""
    from billing.models import Subscription
    sub, _ = Subscription.objects.get_or_create(
        user=user,
        defaults={'plan': Subscription.PLAN_FREE, 'status': Subscription.STATUS_ACTIVE},
    )
    return sub


def get_usage(user) -> dict:
    """Compute current-period usage counts for the user."""
    from django.utils import timezone
    from workflows.models import Workflow
    from scripts.models import Script
    from execution_engine.models import ScriptExecution, WorkflowRun
    from autobot_api.models import Thread
    from triggers.models import HttpTrigger, ScheduleTrigger
    from vault.models import Vault, Credential, Server

    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    workflow_count = Workflow.objects.filter(user=user).count()
    script_count = Script.objects.filter(owner=user).count()
    script_exec_count = ScriptExecution.objects.filter(
        user=user, created_at__gte=month_start
    ).count()
    workflow_run_count = WorkflowRun.objects.filter(
        user=user, created_at__gte=month_start
    ).count()
    thread_count = Thread.objects.filter(user=user, is_archived=False).count()
    http_trigger_count = HttpTrigger.objects.filter(
        workflow__user=user, is_active=True
    ).count()
    schedule_trigger_count = ScheduleTrigger.objects.filter(
        workflow__user=user, is_active=True
    ).count()
    vault_entry_count = (
        Vault.objects.filter(owner=user).count()
        + Credential.objects.filter(vault__owner=user).count()
        + Server.objects.filter(vault__owner=user).count()
    )

    return {
        'workflows': workflow_count,
        'scripts': script_count,
        'script_executions_this_month': script_exec_count,
        'workflow_runs_this_month': workflow_run_count,
        'autobot_threads': thread_count,
        'http_triggers': http_trigger_count,
        'schedule_triggers': schedule_trigger_count,
        'vault_entries': vault_entry_count,
    }
