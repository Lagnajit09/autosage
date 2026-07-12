from django.urls import path
from billing import views

urlpatterns = [
    path('subscription/', views.subscription_detail, name='billing-subscription'),
    path('checkout/', views.create_checkout, name='billing-checkout'),
    path('cancel/', views.cancel_subscription, name='billing-cancel'),
    path('invoices/', views.list_invoices, name='billing-invoices'),
    path('plans/', views.list_plans, name='billing-plans'),
    path('webhook/', views.razorpay_webhook, name='billing-webhook'),
    path('internal/plan/', views.internal_plan, name='billing-internal-plan'),
    path('contact/', views.contact_enterprise, name='billing-contact'),
]
