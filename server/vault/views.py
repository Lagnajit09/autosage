from django.shortcuts import get_object_or_404
from rest_framework import status, generics
from rest_framework.permissions import IsAuthenticated
from .models import Vault, Credential
from .serializers import VaultSerializer, CredentialSerializer
from server.utils import api_response

class VaultListCreateView(generics.ListCreateAPIView):
    """
    List all vaults owned by the user or create a new vault.
    """
    serializer_class = VaultSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Vault.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Vaults retrieved successfully.",
            data=response.data,
            status_code=status.HTTP_200_OK
        )

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Vault created successfully.",
            data=response.data,
            status_code=status.HTTP_201_CREATED
        )

class VaultDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Retrieve, update or delete a vault instance.
    """
    serializer_class = VaultSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Vault.objects.filter(owner=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Vault retrieved successfully.",
            data=response.data,
            status_code=status.HTTP_200_OK
        )

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Vault updated successfully.",
            data=response.data,
            status_code=status.HTTP_200_OK
        )

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Vault deleted successfully.",
            status_code=status.HTTP_200_OK
        )

class CredentialListCreateView(generics.ListCreateAPIView):
    """
    List all credentials owned by the user or create a new credential.
    """
    serializer_class = CredentialSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Only return credentials if the user owns the vault they belong to
        return Credential.objects.filter(vault__owner=self.request.user)

    def perform_create(self, serializer):
        # Validate that the vault belongs to the user
        vault = serializer.validated_data.get('vault')
        if vault.owner != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to add credentials to this vault.")
        serializer.save()

    def list(self, request, *args, **kwargs):
        # Allow filtering by vault_id
        vault_id = request.query_params.get('vault_id')
        queryset = self.get_queryset()
        if vault_id:
            queryset = queryset.filter(vault_id=vault_id)
        
        serializer = self.get_serializer(queryset, many=True)
        return api_response(
            success=True,
            message="Credentials retrieved successfully.",
            data=serializer.data,
            status_code=status.HTTP_200_OK
        )

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Credential created successfully.",
            data=response.data,
            status_code=status.HTTP_201_CREATED
        )

class CredentialDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Retrieve, update or delete a credential instance.
    """
    serializer_class = CredentialSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Credential.objects.filter(vault__owner=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Credential retrieved successfully.",
            data=response.data,
            status_code=status.HTTP_200_OK
        )

    def update(self, request, *args, **kwargs):
        # Ensure that if the vault is updated, the user owns the new vault
        vault_id = request.data.get('vault')
        if vault_id:
            from .models import Vault
            vault = get_object_or_404(Vault, pk=vault_id, owner=self.request.user)
        
        response = super().update(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Credential updated successfully.",
            data=response.data,
            status_code=status.HTTP_200_OK
        )

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Credential deleted successfully.",
            status_code=status.HTTP_200_OK
        )
