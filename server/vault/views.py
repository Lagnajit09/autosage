from django.shortcuts import get_object_or_404
from rest_framework import status, generics
from rest_framework.permissions import IsAuthenticated
from .models import Vault
from .serializers import VaultSerializer
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
