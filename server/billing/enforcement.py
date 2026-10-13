import datetime
from contextlib import contextmanager
from functools import wraps

from django.db import transaction
from rest_framework.exceptions import APIException
from rest_framework import status as drf_status

from billing.limits import (
    PLAN_DISPLAY,
    PLAN_LIMITS,
    get_limits,
    get_or_create_subscription,
    get_plan,
    month_start,
    script_executions_this_month,
    workflow_runs_this_month,
)

# (singular, plural, reset period) for each numeric limit key; period is
# 'month', 'day' or None (a standing cap that never resets).
_LIMIT_LABELS = {
    'max_workflows': ('workflow', 'workflows', None),
    'max_scripts': ('script', 'scripts', None),
    'max_script_executions_per_month': ('script execution', 'script executions', 'month'),
    'max_workflow_runs_per_month': ('workflow run', 'workflow runs', 'month'),
    'max_autobot_admin_messages_per_day': ('Autobot AI message', 'Autobot AI messages', 'day'),
    'max_autobot_threads': ('Autobot thread', 'Autobot threads', None),
    'max_http_triggers': ('HTTP trigger', 'HTTP triggers', None),
    'max_schedule_triggers': ('schedule trigger', 'schedule triggers', None),
    'max_vault_entries': ('vault entry', 'vault entries', None),
}


def limit_message(limit_key, cap, plan):
    """User-facing message for hitting ``limit_key`` on ``plan``.

    Plan-aware: Free users are told what Pro offers (numbers read from
    PLAN_LIMITS, so they can't drift); Pro users — who can't "upgrade to Pro" —
    are pointed to Enterprise. Monthly limits also say when they reset.
    """
    if limit_key == 'execution_mode':
        return "Execution mode requires a Pro plan or higher."

    on_free = plan == 'free'
    label = _LIMIT_LABELS.get(limit_key)
    if label is None:
        return (
            "Plan limit reached. Upgrade to Pro for higher limits." if on_free
            else "Plan limit reached. Contact us about an Enterprise plan for higher limits."
        )

    singular, plural, period = label
    plan_name = PLAN_DISPLAY.get(plan, {}).get('name') or str(plan).title()
    noun = singular if cap == 1 else plural
    message = f"You've reached your {plan_name} plan limit of {cap} {noun}"
    if period == 'month':
        next_month = (month_start().replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
        message += f" this month. It resets on {next_month:%B} 1."
    elif period == 'day':
        message += " today. It resets tomorrow."
    else:
        message += "."

    if on_free:
        pro_cap = PLAN_LIMITS['pro'].get(limit_key)
        if pro_cap is None:
            message += f" Upgrade to Pro for unlimited {plural}."
        elif period:
            message += f" Upgrade to Pro for {pro_cap} {plural}/{period}."
        else:
            message += f" Upgrade to Pro for up to {pro_cap} {plural}."
    else:
        message += " Contact us about an Enterprise plan for higher limits."
    return message


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
        self.detail = {
            'detail': limit_message(limit_key, cap, plan),
            'limit_key': limit_key,
            'current': current,
            'limit': cap,
            'plan': plan,
            'upgrade_required': plan == 'free',
        }



def enforce_limit(user, limit_key, count_fn):
    """Raise :class:`PlanLimitExceeded` if ``user`` is at/over ``limit_key``.

    Admins (is_staff) are exempt; an unlimited (None) cap never blocks. This is
    a plain read — use :func:`reserve_quota` where a row is about to be created,
    so concurrent requests can't both slip in under the cap.
    """
    if user.is_staff:
        return
    cap = get_limits(user).get(limit_key)
    if cap is None:
        return
    current = count_fn(user)
    if current >= cap:
        raise PlanLimitExceeded(limit_key, current, cap, get_plan(user))


@contextmanager
def reserve_quota(user, limit_key, count_fn):
    """Atomically check a quota and create the counted row inside the block.

        with reserve_quota(user, "max_workflow_runs_per_month", workflow_runs_this_month):
            WorkflowRun.objects.create(...)

    Count-then-insert is racy: parallel requests (e.g. a webhook fired
    concurrently) would all read ``cap - 1`` and all pass. Locking the user's
    Subscription row serialises quota checks per user, so the next request
    waits for this one to commit and then counts the new row. Unrelated users
    never contend. Raises :class:`PlanLimitExceeded` before the body runs.
    """
    if user.is_staff:
        yield
        return
    from billing.models import Subscription

    with transaction.atomic():
        sub = get_or_create_subscription(user)
        Subscription.objects.select_for_update().filter(pk=sub.pk).first()
        enforce_limit(user, limit_key, count_fn)
        yield


def reserve_workflow_run(user):
    """Quota slot for one workflow run — used by ``enqueue_workflow_run``, the
    single entry point for every trigger source."""
    return reserve_quota(user, 'max_workflow_runs_per_month', workflow_runs_this_month)


def reserve_script_execution(user):
    """Quota slot for one one-shot script execution."""
    return reserve_quota(
        user, 'max_script_executions_per_month', script_executions_this_month
    )


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
