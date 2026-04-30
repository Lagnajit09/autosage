from django.urls import include, path
from . import views

urlpatterns = [
    path('', views.WorkflowListCreateView.as_view(), name='workflow-list-create'),
    path('<uuid:pk>/', views.WorkflowDetailView.as_view(), name='workflow-detail'),
    # Per-workflow trigger management endpoints (HTTP triggers, etc.)
    path('<uuid:workflow_id>/triggers/', include('triggers.urls')),
]
