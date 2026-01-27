from django.urls import path
from . import views

urlpatterns = [
    path('vaults/', views.VaultListCreateView.as_view(), name='vault-list-create'),
    path('vaults/<uuid:pk>/', views.VaultDetailView.as_view(), name='vault-detail'),
    path('credentials/', views.CredentialListCreateView.as_view(), name='credential-list-create'),
    path('credentials/<uuid:pk>/', views.CredentialDetailView.as_view(), name='credential-detail'),
    path('credentials/<uuid:pk>/reveal/', views.CredentialRevealView.as_view(), name='credential-reveal'),
    path('credentials/<uuid:pk>/move-to-vault/', views.CredentialMoveToVaultView.as_view(), name='credential-move-to-vault'),
    path('servers/', views.ServerListCreateView.as_view(), name='server-list-create'),
    path('servers/<uuid:pk>/', views.ServerDetailView.as_view(), name='server-detail'),
    path('servers/<uuid:pk>/link-credential/', views.ServerLinkCredentialView.as_view(), name='server-link-credential'),
    path('servers/<uuid:pk>/unlink-credential/', views.ServerUnlinkCredentialView.as_view(), name='server-unlink-credential'),
]
