from django.urls import path
from . import views

urlpatterns = [
    path('', views.WorkflowListCreateView.as_view(), name='workflow-list-create'),
    path('<uuid:pk>/', views.WorkflowDetailView.as_view(), name='workflow-detail'),
]
