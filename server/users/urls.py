from django.urls import path
from .views import (
    UserProfileView,
    UserNotificationSettingsView,
    update_user,
    deactivate_account,
    delete_account,
)

urlpatterns = [
    path('profile/', UserProfileView.as_view(), name='user-profile'),
    path('notifications/', UserNotificationSettingsView.as_view(), name='user-notifications'),
    path('update/', update_user, name='user-update'),
    path('deactivate/', deactivate_account, name='user-deactivate'),
    path('delete/', delete_account, name='user-delete'),
]
