from django.urls import path
from triggers import views_global

app_name = "triggers_global"

urlpatterns = [
    path("", views_global.list_all_triggers, name="list-all-triggers"),
    # Owner-only: workflow name / trigger id / run id -> the HTTP trigger run to poll.
    path("http/resolve/", views_global.resolve_http_trigger_run, name="resolve-http-trigger-run"),
    path("http/<uuid:trigger_id>/", views_global.manage_http_trigger, name="manage-http-trigger"),
    path("schedule/<uuid:trigger_id>/", views_global.manage_schedule_trigger, name="manage-schedule-trigger"),
]
