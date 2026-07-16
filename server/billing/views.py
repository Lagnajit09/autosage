import datetime
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

    credits_available, next_at = _credits_availability(user, sub)

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
        'day_pass': {
            'active': sub.has_active_day_pass,
            'expires_at': sub.credits_pass_expires_at.isoformat() if sub.credits_pass_expires_at else None,
            'available': credits_available,
            'next_available_at': next_at.isoformat() if next_at else None,
            'amount': settings.RAZORPAY_PRO_CREDITS,
            'currency': settings.RAZORPAY_PRO_CREDITS_CURRENCY,
        },
    }
    return api_response(success=True, message='Subscription retrieved.', data=data)


def _credits_availability(user, sub):
    """Return (available: bool, next_available_at: datetime|None).

    The Day Pass is unavailable to admins, to users already on a paid plan,
    while a pass is currently active, or during the 7-day cooldown.
    """
    if user.is_staff:
        return False, None
    if sub.plan != Subscription.PLAN_FREE:
        return False, None
    if sub.has_active_day_pass:
        return False, sub.credits_pass_expires_at
    if sub.last_credits_purchase_at:
        cooldown = datetime.timedelta(days=settings.RAZORPAY_PRO_CREDITS_COOLDOWN_DAYS)
        next_at = sub.last_credits_purchase_at + cooldown
        if timezone.now() < next_at:
            return False, next_at
    return True, None


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


# ── POST /api/billing/credits/checkout/ ──────────────────────────────────────
# Creates a one-time Razorpay Order for the ₹99 "Pro Day Pass".

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_credits_checkout(request):
    user = request.user

    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        return api_response(success=False, message='Payment gateway not configured.', status_code=503)

    sub = get_or_create_subscription(user)
    available, next_at = _credits_availability(user, sub)
    if not available:
        if sub.has_active_day_pass:
            msg = 'You already have an active Pro Day Pass.'
        elif sub.plan != Subscription.PLAN_FREE:
            msg = 'The Day Pass is only for Free-plan users.'
        else:
            msg = 'You can buy the Day Pass again once per week. Please try later.'
        return api_response(
            success=False,
            message=msg,
            data={'next_available_at': next_at.isoformat() if next_at else None},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    try:
        order = _get_rzp().order.create({
            'amount': settings.RAZORPAY_PRO_CREDITS,
            'currency': settings.RAZORPAY_PRO_CREDITS_CURRENCY,
            'payment_capture': 1,
            'notes': {
                'user_id': str(user.id),
                'username': user.username,
                'kind': 'pro_day_pass',
            },
        })
    except Exception as e:
        logger.exception('Razorpay order creation failed: %s', e)
        return api_response(
            success=False,
            message='Payment gateway error. Please try again.',
            status_code=status.HTTP_502_BAD_GATEWAY,
        )

    sub.credits_order_id = order['id']
    sub.save(update_fields=['credits_order_id', 'modified_at'])

    return api_response(
        success=True,
        message='Day Pass checkout created.',
        data={
            'order_id': order['id'],
            'amount': order['amount'],
            'currency': order['currency'],
            'key_id': settings.RAZORPAY_KEY_ID,
        }
    )


# ── POST /api/billing/credits/verify/ ────────────────────────────────────────
# Verifies the one-time payment signature and grants 1 day of Pro.

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_credits_payment(request):
    user = request.user
    sub = get_or_create_subscription(user)

    order_id = request.data.get('razorpay_order_id', '')
    payment_id = request.data.get('razorpay_payment_id', '')
    signature = request.data.get('razorpay_signature', '')

    if not order_id or not payment_id or not signature:
        return api_response(success=False, message='Missing payment details.', status_code=400)

    # Idempotency / race with the order.paid webhook: the webhook may have
    # already granted this pass and cleared credits_order_id before this
    # synchronous verify call ran. If the pass is now active, treat verify as a
    # success rather than surfacing a spurious "expired order" error.
    if sub.has_active_day_pass and not sub.credits_order_id:
        return api_response(
            success=True,
            message='Pro Day Pass activated! Enjoy Pro features for the next 24 hours.',
            data={'expires_at': sub.credits_pass_expires_at.isoformat()},
        )

    # The order must be the one we issued to this user — prevents replaying
    # another user's / a stale order to mint a pass.
    if not sub.credits_order_id or order_id != sub.credits_order_id:
        return api_response(success=False, message='Unknown or expired order.', status_code=400)

    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode('utf-8'),
        f'{order_id}|{payment_id}'.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, signature):
        logger.warning('Day Pass payment signature mismatch for user %s', user.id)
        return api_response(success=False, message='Payment verification failed.', status_code=400)

    # Re-check eligibility server-side; a genuinely paid-but-ineligible payment
    # should not silently double-grant. (Refunds are handled out of band.)
    available, next_at = _credits_availability(user, sub)
    if not available and not sub.has_active_day_pass:
        return api_response(
            success=False,
            message='Day Pass is not available right now.',
            data={'next_available_at': next_at.isoformat() if next_at else None},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    now = timezone.now()
    sub.credits_pass_expires_at = now + datetime.timedelta(days=settings.RAZORPAY_PRO_CREDITS_DAYS)
    sub.last_credits_purchase_at = now
    sub.credits_order_id = ''
    sub.save(update_fields=[
        'credits_pass_expires_at', 'last_credits_purchase_at', 'credits_order_id', 'modified_at',
    ])

    _record_day_pass_purchase(
        user=user,
        order_id=order_id,
        payment_id=payment_id,
        amount=settings.RAZORPAY_PRO_CREDITS,
        currency=settings.RAZORPAY_PRO_CREDITS_CURRENCY,
    )

    logger.info('Pro Day Pass granted to user %s until %s', user.id, sub.credits_pass_expires_at)

    return api_response(
        success=True,
        message='Pro Day Pass activated! Enjoy Pro features for the next 24 hours.',
        data={'expires_at': sub.credits_pass_expires_at.isoformat()},
    )


# ── GET /api/billing/invoices/ ───────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_invoices(request):
    user = request.user
    sub = get_or_create_subscription(user)

    data = []

    # Razorpay subscription invoices (recurring Pro plan).
    if sub.razorpay_subscription_id:
        try:
            result = _get_rzp().invoice.all({'subscription_id': sub.razorpay_subscription_id, 'count': 20})
            for inv in result.get('items', []):
                data.append({
                    'id': inv['id'],
                    'invoice_number': inv.get('invoice_number', inv['id']),
                    'amount': inv['amount'] / 100,
                    'currency': inv.get('currency', 'USD').upper(),
                    'status': inv['status'],
                    'date': inv.get('date') or inv.get('created_at'),
                    'description': inv.get('description', 'Pro Plan'),
                })
        except Exception as e:
            logger.exception('Failed to fetch invoices: %s', e)

    # Local Day Pass receipts (one-time Orders don't generate Razorpay invoices).
    from billing.models import DayPassPurchase
    for p in DayPassPurchase.objects.filter(user=user)[:20]:
        data.append({
            'id': p.order_id,
            'invoice_number': p.payment_id or p.order_id,
            'amount': p.amount / 100,
            'currency': p.currency.upper(),
            'status': 'paid',
            'date': int(p.created_at.timestamp()),
            'description': 'Pro Day Pass (24 hrs)',
        })

    # Newest first; entries missing a date sort last.
    data.sort(key=lambda x: x.get('date') or 0, reverse=True)

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

    from django.http import JsonResponse

    event = payload.get('event', '')
    payment_entity = payload.get('payload', {}).get('payment', {}).get('entity', {})

    logger.info('Razorpay webhook: %s', event)

    # ── Day Pass (one-time Order) backstop ───────────────────────────────────
    # A one-time Order payment carries an `order_id` on the payment entity and
    # has no subscription. If it matches a Day Pass order we issued, grant the
    # pass here (idempotent) in case the synchronous /credits/verify/ call was
    # never made (e.g. the user closed the tab after paying).
    order_id = payment_entity.get('order_id', '')
    if event == 'order.paid' or (event == 'payment.captured' and order_id):
        # `order.paid` puts the order under payload.order.entity.
        order_entity = payload.get('payload', {}).get('order', {}).get('entity', {})
        if not order_id:
            order_id = order_entity.get('id', '')
        if order_id:
            handled = _grant_day_pass_from_webhook(
                order_id,
                payment_id=payment_entity.get('id', ''),
                amount=payment_entity.get('amount') or order_entity.get('amount'),
                currency=(payment_entity.get('currency') or order_entity.get('currency') or ''),
            )
            if handled:
                return JsonResponse({'status': 'ok'})
            # Not a Day Pass order — fall through to subscription handling
            # only if this was a subscription payment (has no order match).

    # ── Subscription events ──────────────────────────────────────────────────
    entity = payload.get('payload', {}).get('subscription', {}).get('entity', {})
    rzp_sub_id = entity.get('id', '')

    if not rzp_sub_id:
        return JsonResponse({'status': 'ok'})

    try:
        sub = Subscription.objects.get(razorpay_subscription_id=rzp_sub_id)
    except Subscription.DoesNotExist:
        logger.warning('Webhook for unknown subscription: %s', rzp_sub_id)
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

    return JsonResponse({'status': 'ok'})


def _grant_day_pass_from_webhook(order_id, payment_id='', amount=None, currency=''):
    """Grant a Day Pass for a paid one-time Order, if `order_id` matches one we
    issued and it hasn't already been consumed. Idempotent: a second delivery
    (or a race with /credits/verify/) is a no-op because credits_order_id is
    cleared on grant. Returns True if this order was a Day Pass order.
    """
    import datetime

    try:
        sub = Subscription.objects.get(credits_order_id=order_id)
    except Subscription.DoesNotExist:
        return False

    now = timezone.now()
    sub.credits_pass_expires_at = now + datetime.timedelta(days=settings.RAZORPAY_PRO_CREDITS_DAYS)
    sub.last_credits_purchase_at = now
    sub.credits_order_id = ''
    sub.save(update_fields=[
        'credits_pass_expires_at', 'last_credits_purchase_at', 'credits_order_id', 'modified_at',
    ])

    _record_day_pass_purchase(
        user=sub.user,
        order_id=order_id,
        payment_id=payment_id,
        amount=amount if amount is not None else settings.RAZORPAY_PRO_CREDITS,
        currency=currency or settings.RAZORPAY_PRO_CREDITS_CURRENCY,
    )

    logger.info('Pro Day Pass granted via webhook for order %s (user %s)', order_id, sub.user_id)
    return True


def _record_day_pass_purchase(user, order_id, payment_id, amount, currency):
    """Store a local receipt for a Day Pass purchase (idempotent by order_id).

    One-time Razorpay Orders don't produce Razorpay Invoices, so this lets the
    billing history surface Day Pass payments.
    """
    from billing.models import DayPassPurchase
    try:
        DayPassPurchase.objects.get_or_create(
            order_id=order_id,
            defaults={
                'user': user,
                'payment_id': payment_id or '',
                'amount': int(amount),
                'currency': (currency or 'INR').upper(),
            },
        )
    except Exception as e:
        # A missing receipt must never fail the (already-granted) pass.
        logger.warning('Could not record Day Pass receipt for order %s: %s', order_id, e)


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
