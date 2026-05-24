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

    # ── Thread / Message / Summary / UserSettings (T05–T08) — added later ──
]
