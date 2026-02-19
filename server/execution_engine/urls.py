from django.urls import path
from . import views

app_name = "executions"

urlpatterns = [
    # Main execution endpoint – streams SSE updates
    path("run/", views.execute_script, name="execute-script"),

    # Polling fallback – returns current execution state as JSON
    path("<uuid:execution_id>/status/", views.execution_status, name="execution-status"),
]