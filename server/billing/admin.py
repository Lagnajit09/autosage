from django.contrib import admin
from billing.models import DayPassPurchase, Subscription


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('user', 'plan', 'status', 'billing_interval', 'current_period_end', 'created_at')
    list_filter = ('plan', 'status')
    search_fields = ('user__username', 'razorpay_subscription_id')
    readonly_fields = ('created_at', 'modified_at')


@admin.register(DayPassPurchase)
class DayPassPurchaseAdmin(admin.ModelAdmin):
    list_display = ('user', 'order_id', 'payment_id', 'amount', 'currency', 'created_at')
    search_fields = ('user__username', 'order_id', 'payment_id')
    readonly_fields = ('created_at',)
