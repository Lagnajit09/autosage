from django.urls import path
from .views import (
    UserProfileView,
    UserNotificationSettingsView,
    update_user,
    deactivate_account,
    delete_account,
    account_status,
    request_reactivation,
)

urlpatterns = [
    path('profile/', UserProfileView.as_view(), name='user-profile'),
    path('notifications/', UserNotificationSettingsView.as_view(), name='user-notifications'),
    path('update/', update_user, name='user-update'),
    path('deactivate/', deactivate_account, name='user-deactivate'),
    path('delete/', delete_account, name='user-delete'),
    path('account-status/', account_status, name='user-account-status'),
    path('request-reactivation/', request_reactivation, name='user-request-reactivation'),
]
