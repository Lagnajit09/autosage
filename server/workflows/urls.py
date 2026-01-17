from django.urls import path
from . import views

urlpatterns = [
    path('list/', views.list_workflows, name='workflow-list'),
    path('create/', views.create_workflow, name='workflow-create'),
    path('<uuid:pk>/', views.retrieve_workflow, name='workflow-detail'),
    path('<uuid:pk>/update/', views.update_workflow, name='workflow-update'),
    path('<uuid:pk>/delete/', views.delete_workflow, name='workflow-delete'),
]
