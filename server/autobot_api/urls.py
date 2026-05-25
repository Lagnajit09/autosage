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

    # ── Message / Summary / UserSettings (T07–T08) — added later ───────────
]
