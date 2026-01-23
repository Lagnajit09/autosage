from django.urls import path
from . import views

urlpatterns = [
    path('vaults/', views.VaultListCreateView.as_view(), name='vault-list-create'),
    path('vaults/<int:pk>/', views.VaultDetailView.as_view(), name='vault-detail'),
]
