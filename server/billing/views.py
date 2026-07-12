import hashlib
import hmac
import json
import logging

import razorpay
from django.conf import settings
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from billing.limits import (
    PLAN_DISPLAY,
    PLAN_LIMITS,
    get_limits,
    get_or_create_subscription,
    get_plan,
    get_usage,
)
from billing.models import Subscription
from server.utils import api_response

logger = logging.getLogger(__name__)

_rzp_client = None


def _get_rzp():
    global _rzp_client
    if _rzp_client is None:
        _rzp_client = razorpay.Client(
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
        )
    return _rzp_client


# ── GET /api/billing/subscription/ ───────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def subscription_detail(request):
    user = request.user
    sub = get_or_create_subscription(user)
    plan = get_plan(user)
    limits = get_limits(user)
    usage = get_usage(user)

    data = {
        'plan': plan,
        'plan_display': PLAN_DISPLAY[plan],
        'status': 'active' if user.is_staff else sub.status,
        'is_admin': user.is_staff,
        'billing_interval': sub.billing_interval or None,
        'current_period_end': sub.current_period_end.isoformat() if sub.current_period_end else None,
        'cancelled_at': sub.cancelled_at.isoformat() if sub.cancelled_at else None,
        'limits': {k: v for k, v in limits.items() if k != 'execution_mode'},
        'execution_mode': limits['execution_mode'],
        'usage': usage,
    }
    return api_response(success=True, message='Subscription retrieved.', data=data)


# ── POST /api/billing/checkout/ ──────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_checkout(request):
    """
    Creates a Razorpay subscription and returns the subscription_id + key_id
    so the frontend can open the Razorpay checkout modal.

    Body: { "interval": "monthly" | "yearly" }
    """
    user = request.user
    interval = request.data.get('interval', 'monthly')

    if interval == 'yearly':
        plan_id = settings.RAZORPAY_PRO_YEARLY_PLAN_ID
    else:
        plan_id = settings.RAZORPAY_PRO_MONTHLY_PLAN_ID
        interval = 'monthly'

    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        return api_response(success=False, message='Payment gateway not configured.', status_code=503)

    sub = get_or_create_subscription(user)

    # If already on pro and active, return existing subscription
    if sub.plan == Subscription.PLAN_PRO and sub.status == Subscription.STATUS_ACTIVE and sub.razorpay_subscription_id:
        return api_response(
            success=True,
            message='Already subscribed to Pro.',
            data={
                'already_subscribed': True,
                'subscription_id': sub.razorpay_subscription_id,
                'key_id': settings.RAZORPAY_KEY_ID,
            }
        )

    try:
        rzp_sub = _get_rzp().subscription.create({
            'plan_id': plan_id,
            'total_count': 12 if interval == 'monthly' else 5,
            'quantity': 1,
            'customer_notify': 1,
            'notes': {
                'user_id': str(user.id),
                'username': user.username,
                'interval': interval,
            },
        })
    except Exception as e:
        logger.exception('Razorpay subscription creation failed: %s', e)
        return api_response(
            success=False,
            message='Payment gateway error. Please try again.',
            status_code=status.HTTP_502_BAD_GATEWAY,
        )

    sub.razorpay_subscription_id = rzp_sub['id']
    sub.billing_interval = interval
    sub.save(update_fields=['razorpay_subscription_id', 'billing_interval', 'modified_at'])

    return api_response(
        success=True,
        message='Checkout session created.',
        data={
            'subscription_id': rzp_sub['id'],
            'key_id': settings.RAZORPAY_KEY_ID,
            'interval': interval,
        }
    )


# ── POST /api/billing/cancel/ ────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cancel_subscription(request):
    user = request.user
    sub = get_or_create_subscription(user)

    if sub.plan == Subscription.PLAN_FREE or not sub.razorpay_subscription_id:
        return api_response(
            success=False,
            message='No active paid subscription to cancel.',
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    try:
        # cancel_at_cycle_end=1 keeps access until period end
        _get_rzp().subscription.cancel(sub.razorpay_subscription_id, {'cancel_at_cycle_end': 1})
    except Exception as e:
        logger.exception('Razorpay cancellation failed: %s', e)
        return api_response(
            success=False,
            message='Cancellation failed. Please try again.',
            status_code=status.HTTP_502_BAD_GATEWAY,
        )

    sub.cancelled_at = timezone.now()
    sub.status = Subscription.STATUS_CANCELLED
    sub.save(update_fields=['cancelled_at', 'status', 'modified_at'])

    return api_response(
        success=True,
        message='Subscription cancelled. Access continues until the end of your billing period.',
        data={'cancelled_at': sub.cancelled_at.isoformat()},
    )


# ── GET /api/billing/invoices/ ───────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_invoices(request):
    user = request.user
    sub = get_or_create_subscription(user)

    if not sub.razorpay_subscription_id:
        return api_response(success=True, message='No invoices.', data=[])

    try:
        result = _get_rzp().invoice.all({'subscription_id': sub.razorpay_subscription_id, 'count': 20})
        invoices = result.get('items', [])
        data = [
            {
                'id': inv['id'],
                'invoice_number': inv.get('invoice_number', inv['id']),
                'amount': inv['amount'] / 100,
                'currency': inv.get('currency', 'USD').upper(),
                'status': inv['status'],
                'date': inv.get('date') or inv.get('created_at'),
                'description': inv.get('description', 'Pro Plan'),
            }
            for inv in invoices
        ]
    except Exception as e:
        logger.exception('Failed to fetch invoices: %s', e)
        return api_response(success=True, message='Could not load invoices.', data=[])

    return api_response(success=True, message='Invoices retrieved.', data=data)


# ── GET /api/billing/internal/plan/ ─────────────────────────────────────────
# Called by autobot FastAPI (X-Internal-Secret auth) to resolve a user's plan.

@api_view(['GET'])
@permission_classes([AllowAny])
def internal_plan(request):
    """Internal endpoint for autobot to look up a user's billing plan.

    Auth: X-Internal-Secret header (same secret as the docs RAG path).
    Returns the plan + admin_daily_limit for the user identified by their
    Clerk sub (passed as ?user_sub=<sub>).
    """
    secret = request.headers.get('X-Internal-Secret', '')
    if not secret or secret != settings.AUTOBOT_INTERNAL_SECRET:
        from django.http import JsonResponse
        return JsonResponse({'error': 'Forbidden'}, status=403)

    user_sub = request.query_params.get('user_sub', '')
    if not user_sub:
        from django.http import JsonResponse
        return JsonResponse({'error': 'user_sub required'}, status=400)

    from django.contrib.auth import get_user_model
    User = get_user_model()
    try:
        user = User.objects.get(username=user_sub)
    except User.DoesNotExist:
        # Unknown user → treat as free
        plan = 'free'
        limits = PLAN_LIMITS['free']
        is_admin = False
    else:
        is_admin = user.is_staff
        plan = get_plan(user)
        limits = get_limits(user)

    from django.http import JsonResponse
    return JsonResponse({
        'plan': plan,
        'is_admin': is_admin,
        'admin_daily_limit': limits.get('max_autobot_admin_messages_per_day') or 0,
        'execution_mode': limits.get('execution_mode', False),
    })


# ── GET /api/billing/plans/ ──────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def list_plans(request):
    plans = []
    for plan_key, display in PLAN_DISPLAY.items():
        plans.append({
            'key': plan_key,
            **display,
            'limits': PLAN_LIMITS[plan_key],
        })
    return api_response(success=True, message='Plans retrieved.', data=plans)


# ── POST /api/billing/webhook/ ───────────────────────────────────────────────

@csrf_exempt
def razorpay_webhook(request):
    if request.method != 'POST':
        from django.http import JsonResponse
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    webhook_secret = settings.RAZORPAY_WEBHOOK_SECRET
    signature = request.headers.get('X-Razorpay-Signature', '')
    body = request.body

    expected = hmac.new(
        webhook_secret.encode('utf-8'),
        body,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, signature):
        logger.warning('Razorpay webhook signature mismatch')
        from django.http import JsonResponse
        return JsonResponse({'error': 'Invalid signature'}, status=400)

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        from django.http import JsonResponse
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    event = payload.get('event', '')
    entity = payload.get('payload', {}).get('subscription', {}).get('entity', {})
    rzp_sub_id = entity.get('id', '')

    logger.info('Razorpay webhook: %s for subscription %s', event, rzp_sub_id)

    if not rzp_sub_id:
        from django.http import JsonResponse
        return JsonResponse({'status': 'ok'})

    try:
        sub = Subscription.objects.get(razorpay_subscription_id=rzp_sub_id)
    except Subscription.DoesNotExist:
        logger.warning('Webhook for unknown subscription: %s', rzp_sub_id)
        from django.http import JsonResponse
        return JsonResponse({'status': 'ok'})

    if event in ('subscription.activated', 'payment.captured'):
        sub.plan = Subscription.PLAN_PRO
        sub.status = Subscription.STATUS_ACTIVE
        sub.cancelled_at = None
        _set_period(sub, entity)
        sub.save()
        logger.info('Subscription %s activated (Pro)', rzp_sub_id)

    elif event == 'subscription.charged':
        sub.status = Subscription.STATUS_ACTIVE
        _set_period(sub, entity)
        sub.save()

    elif event == 'subscription.cancelled':
        sub.status = Subscription.STATUS_CANCELLED
        if not sub.cancelled_at:
            sub.cancelled_at = timezone.now()
        sub.save()

    elif event == 'subscription.completed':
        sub.plan = Subscription.PLAN_FREE
        sub.status = Subscription.STATUS_EXPIRED
        sub.razorpay_subscription_id = ''
        sub.billing_interval = ''
        sub.current_period_start = None
        sub.current_period_end = None
        sub.save()
        logger.info('Subscription %s expired — reverted to Free', rzp_sub_id)

    from django.http import JsonResponse
    return JsonResponse({'status': 'ok'})


# ── POST /api/billing/contact/ ──────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def contact_enterprise(request):
    contact_type = request.data.get('type', '').strip()
    name = request.data.get('name', '').strip()
    email = request.data.get('email', '').strip()
    description = request.data.get('description', '').strip()

    if not name or not email or not description:
        return api_response(success=False, message='Name, email, and description are required.', status_code=400)

    subject = f"[Enterprise Inquiry] {contact_type} — {name}"
    body = f"""New enterprise contact inquiry from Autosage Plans page.

Type: {contact_type}
Name: {name}
Email: {email}

Description:
{description}
"""
    try:
        from django.core.mail import send_mail
        from django.conf import settings as django_settings
        send_mail(
            subject=subject,
            message=body,
            from_email=django_settings.DEFAULT_FROM_EMAIL,
            recipient_list=['autosagex@gmail.com'],
            fail_silently=False,
        )
    except Exception as e:
        logger.exception('Failed to send enterprise contact email: %s', e)
        return api_response(success=False, message='Failed to send. Please try emailing us directly at autosagex@gmail.com.', status_code=500)

    return api_response(success=True, message='Received! Our team will reach out to you shortly.')


def _set_period(sub, entity):
    import datetime
    start_ts = entity.get('current_start')
    end_ts = entity.get('current_end')
    if start_ts:
        sub.current_period_start = datetime.datetime.fromtimestamp(start_ts, tz=timezone.utc)
    if end_ts:
        sub.current_period_end = datetime.datetime.fromtimestamp(end_ts, tz=timezone.utc)
