from django.shortcuts import get_object_or_404
from rest_framework import status, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Vault
from .serializers import VaultSerializer

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

class VaultDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Retrieve, update or delete a vault instance.
    """
    serializer_class = VaultSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Vault.objects.filter(owner=self.request.user)
