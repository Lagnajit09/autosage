from django.urls import path
from .views import (
    UserProfileView,
    UserNotificationSettingsView,
    update_user,
    deactivate_account,
    delete_account,
    account_status,
    request_reactivation,
    report_bug,
    contact_support,
)
from . import views_cli

urlpatterns = [
    # SageCode (sagex CLI) sign-in and sessions — see views_cli.py.
    path('cli/auth/start/', views_cli.cli_auth_start, name='cli-auth-start'),
    path('cli/auth/token/', views_cli.cli_auth_token, name='cli-auth-token'),
    path('cli/auth/requests/<str:user_code>/', views_cli.cli_auth_request_detail, name='cli-auth-request'),
    path('cli/auth/requests/<str:user_code>/approve/', views_cli.cli_auth_approve, name='cli-auth-approve'),
    path('cli/auth/requests/<str:user_code>/deny/', views_cli.cli_auth_deny, name='cli-auth-deny'),
    path('cli/sessions/', views_cli.cli_session_list, name='cli-sessions'),
    path('cli/sessions/current/', views_cli.cli_session_current, name='cli-session-current'),
    path('cli/sessions/<uuid:session_id>/', views_cli.cli_session_revoke, name='cli-session-revoke'),
    path('cli/tokens/', views_cli.cli_token_create, name='cli-token-create'),

    path('profile/', UserProfileView.as_view(), name='user-profile'),
    path('notifications/', UserNotificationSettingsView.as_view(), name='user-notifications'),
    path('update/', update_user, name='user-update'),
    path('deactivate/', deactivate_account, name='user-deactivate'),
    path('delete/', delete_account, name='user-delete'),
    path('account-status/', account_status, name='user-account-status'),
    path('request-reactivation/', request_reactivation, name='user-request-reactivation'),
    path('report-bug/', report_bug, name='user-report-bug'),
    path('contact/', contact_support, name='user-contact'),
]
