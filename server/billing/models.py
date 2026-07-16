from django.conf import settings
from django.db import models


class Subscription(models.Model):
    PLAN_FREE = 'free'
    PLAN_PRO = 'pro'
    PLAN_ENTERPRISE = 'enterprise'
    PLAN_CHOICES = [
        (PLAN_FREE, 'Free'),
        (PLAN_PRO, 'Pro'),
        (PLAN_ENTERPRISE, 'Enterprise'),
    ]

    STATUS_ACTIVE = 'active'
    STATUS_CANCELLED = 'cancelled'
    STATUS_EXPIRED = 'expired'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_CANCELLED, 'Cancelled'),
        (STATUS_EXPIRED, 'Expired'),
    ]

    INTERVAL_MONTHLY = 'monthly'
    INTERVAL_YEARLY = 'yearly'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='subscription',
    )
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default=PLAN_FREE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    razorpay_subscription_id = models.CharField(max_length=255, blank=True)
    razorpay_customer_id = models.CharField(max_length=255, blank=True)
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    billing_interval = models.CharField(max_length=10, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    # One-time "Pro Day Pass" — a temporary Pro override layered on top of the
    # real plan. credits_pass_expires_at is when the current pass lapses;
    # last_credits_purchase_at gates the once-per-week cooldown.
    credits_pass_expires_at = models.DateTimeField(null=True, blank=True)
    last_credits_purchase_at = models.DateTimeField(null=True, blank=True)
    credits_order_id = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'billing_subscriptions'

    def __str__(self):
        return f"{self.user} — {self.plan} ({self.status})"

    @property
    def is_active(self):
        return self.status == self.STATUS_ACTIVE

    @property
    def has_active_day_pass(self):
        from django.utils import timezone
        return bool(
            self.credits_pass_expires_at
            and self.credits_pass_expires_at > timezone.now()
        )


class DayPassPurchase(models.Model):
    """A one-time Pro Day Pass payment receipt.

    One-time Razorpay Orders don't generate Razorpay Invoices, so we record
    each successful Day Pass payment locally to show it in billing history.
    Keyed by order_id for idempotency across the verify/webhook grant paths.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='day_pass_purchases',
    )
    order_id = models.CharField(max_length=255, unique=True)
    payment_id = models.CharField(max_length=255, blank=True)
    amount = models.PositiveIntegerField(help_text='Amount in the smallest currency unit (paise).')
    currency = models.CharField(max_length=10, default='INR')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'billing_day_pass_purchases'
        ordering = ['-created_at']

    def __str__(self):
        return f"DayPass {self.order_id} — {self.user}"
