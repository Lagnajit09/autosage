from functools import wraps

from rest_framework.exceptions import APIException
from rest_framework import status as drf_status

from billing.limits import get_limits, get_plan

LIMIT_MESSAGES = {
    'max_workflows': "You've reached the workflow limit on your Free plan. Upgrade to Pro for up to 50 workflows.",
    'max_scripts': "You've reached the script limit on your Free plan. Upgrade to Pro for up to 100 scripts.",
    'max_script_executions_per_month': "You've reached your monthly script execution limit. Upgrade to Pro for 500 executions/month.",
    'max_workflow_runs_per_month': "You've reached your monthly workflow run limit. Upgrade to Pro for 300 runs/month.",
    'max_autobot_threads': "You've reached the Autobot thread limit on your Free plan. Upgrade to Pro for unlimited threads.",
    'max_http_triggers': "You've reached the HTTP trigger limit on your Free plan. Upgrade to Pro for up to 20 triggers.",
    'max_schedule_triggers': "You've reached the schedule trigger limit on your Free plan. Upgrade to Pro for up to 20 triggers.",
    'max_vault_entries': "You've reached the vault entry limit on your Free plan. Upgrade to Pro for up to 50 entries.",
    'execution_mode': "Execution mode requires a Pro plan or higher.",
}


class PlanLimitExceeded(APIException):
    """
    Raised when a user hits their plan's resource cap.
    Returns HTTP 403 with a flat JSON body that includes limit_key,
    current count, cap, and upgrade_required so the frontend can
    show a contextual upgrade prompt.
    """
    status_code = drf_status.HTTP_403_FORBIDDEN
    default_code = 'plan_limit_exceeded'

    def __init__(self, limit_key, current, cap, plan):
        message = LIMIT_MESSAGES.get(limit_key, 'Plan limit reached. Upgrade to Pro for higher limits.')
        self.detail = {
            'detail': message,
            'limit_key': limit_key,
            'current': current,
            'limit': cap,
            'plan': plan,
            'upgrade_required': plan == 'free',
        }



def check_plan_limit(limit_key, count_fn):
    """
    DRF view method decorator that enforces a plan limit before the view runs.
    Completely skipped for admin users (is_staff=True).

    Usage:
        @check_plan_limit('max_workflows', lambda user: Workflow.objects.filter(user=user).count())
        def perform_create(self, serializer): ...
    """
    def decorator(view_method):
        @wraps(view_method)
        def wrapper(self, *args, **kwargs):
            request = self.request
            user = request.user

            if user.is_staff:
                return view_method(self, *args, **kwargs)

            limits = get_limits(user)
            cap = limits.get(limit_key)

            if cap is not None:
                current = count_fn(user)
                if current >= cap:
                    plan = get_plan(user)
                    raise PlanLimitExceeded(limit_key, current, cap, plan)

            return view_method(self, *args, **kwargs)
        return wrapper
    return decorator


def check_plan_limit_view(limit_key, count_fn):
    """
    Same as check_plan_limit but for @api_view function-based views.
    Wraps the entire view function instead of a method.
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            user = request.user

            if user.is_staff:
                return view_func(request, *args, **kwargs)

            limits = get_limits(user)
            cap = limits.get(limit_key)

            if cap is not None:
                current = count_fn(user)
                if current >= cap:
                    plan = get_plan(user)
                    raise PlanLimitExceeded(limit_key, current, cap, plan)

            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator
