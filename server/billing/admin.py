from django.contrib import admin
from billing.models import Subscription


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('user', 'plan', 'status', 'billing_interval', 'current_period_end', 'created_at')
    list_filter = ('plan', 'status')
    search_fields = ('user__username', 'razorpay_subscription_id')
    readonly_fields = ('created_at', 'modified_at')
