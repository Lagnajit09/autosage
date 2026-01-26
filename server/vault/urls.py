from django.urls import path
from . import views

urlpatterns = [
    path('vaults/', views.VaultListCreateView.as_view(), name='vault-list-create'),
    path('vaults/<int:pk>/', views.VaultDetailView.as_view(), name='vault-detail'),
    path('credentials/', views.CredentialListCreateView.as_view(), name='credential-list-create'),
    path('credentials/<int:pk>/', views.CredentialDetailView.as_view(), name='credential-detail'),
    path('credentials/<int:pk>/reveal/', views.CredentialRevealView.as_view(), name='credential-reveal'),
    path('servers/', views.ServerListCreateView.as_view(), name='server-list-create'),
    path('servers/<int:pk>/', views.ServerDetailView.as_view(), name='server-detail'),
]
