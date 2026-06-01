from django.urls import path

from autobot_api import views

app_name = 'autobot_api'

urlpatterns = [
    # ── LLMConfig (T04) ────────────────────────────────────────────────────
    path(
        'llm-configs/',
        views.LLMConfigListCreateView.as_view(),
        name='llm-config-list-create',
    ),
    path(
        'llm-configs/<uuid:pk>/',
        views.LLMConfigDetailView.as_view(),
        name='llm-config-detail',
    ),
    path(
        'llm-configs/<uuid:pk>/reveal/',
        views.LLMConfigRevealView.as_view(),
        name='llm-config-reveal',
    ),

    # ── Thread (T06) ───────────────────────────────────────────────────────
    path(
        'threads/',
        views.ThreadListCreateView.as_view(),
        name='thread-list-create',
    ),
    path(
        'threads/<uuid:pk>/',
        views.ThreadDetailView.as_view(),
        name='thread-detail',
    ),

    # ── Message + Summary (T07) ────────────────────────────────────────────
    path(
        'threads/<uuid:thread_id>/messages/',
        views.MessageListCreateView.as_view(),
        name='message-list-create',
    ),
    path(
        'threads/<uuid:thread_id>/summaries/',
        views.SummaryListCreateView.as_view(),
        name='summary-list-create',
    ),

    # ── UserSettings (T08) ─────────────────────────────────────────────────
    path(
        'settings/',
        views.UserSettingsView.as_view(),
        name='user-settings',
    ),

    # ── Dashboard analytics (T25) ──────────────────────────────────────────
    path(
        'dashboard/',
        views.DashboardView.as_view(),
        name='dashboard',
    ),
]
