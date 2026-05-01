from django.urls import path

from triggers import views

app_name = "triggers"

urlpatterns = [
    # ── HTTP triggers ─────────────────────────────────────────────────────────
    # POST /api/workflows/<workflow_id>/triggers/http/
    path("http/", views.create_http_trigger, name="http-trigger-create"),

    # GET / DELETE /api/workflows/<workflow_id>/triggers/http/<node_id>/
    path("http/<str:node_id>/", views.http_trigger_detail, name="http-trigger-detail"),

    # POST /api/workflows/<workflow_id>/triggers/http/<node_id>/regenerate/
    path(
        "http/<str:node_id>/regenerate/",
        views.regenerate_http_trigger_secret,
        name="http-trigger-regenerate",
    ),

    # ── Schedule triggers ─────────────────────────────────────────────────────
    # POST /api/workflows/<workflow_id>/triggers/schedule/
    path("schedule/", views.upsert_schedule_trigger, name="schedule-trigger-upsert"),

    # GET / DELETE /api/workflows/<workflow_id>/triggers/schedule/<node_id>/
    path(
        "schedule/<str:node_id>/",
        views.schedule_trigger_detail,
        name="schedule-trigger-detail",
    ),
]
