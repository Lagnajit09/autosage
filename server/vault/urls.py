from django.urls import path
from . import views

urlpatterns = [
    path('vaults/', views.VaultListCreateView.as_view(), name='vault-list-create'),
    path('vaults/<int:pk>/', views.VaultDetailView.as_view(), name='vault-detail'),
    path('credentials/', views.CredentialListCreateView.as_view(), name='credential-list-create'),
    path('credentials/<int:pk>/', views.CredentialDetailView.as_view(), name='credential-detail'),
]
