from django.shortcuts import get_object_or_404
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from .models import Vault, Credential, Server
from .serializers import VaultSerializer, CredentialSerializer, CredentialRevealSerializer, ServerSerializer
from server.utils import api_response
from server.rate_limiters import VaultBurstThrottle, VaultSustainedThrottle, VaultCreateThrottle

class VaultListCreateView(generics.ListCreateAPIView):
    """
    List all vaults owned by the user or create a new vault.
    """
    serializer_class = VaultSerializer
    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        if self.request.method == 'POST':
            return [VaultBurstThrottle(), VaultSustainedThrottle(), VaultCreateThrottle()]
        return [VaultBurstThrottle(), VaultSustainedThrottle()]

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
    throttle_classes = [VaultBurstThrottle, VaultSustainedThrottle]

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
        # Force partial=True to allow individual field updates via PUT
        kwargs['partial'] = True
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

    def get_throttles(self):
        if self.request.method == 'POST':
            return [VaultBurstThrottle(), VaultSustainedThrottle(), VaultCreateThrottle()]
        return [VaultBurstThrottle(), VaultSustainedThrottle()]

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
        # Allow filtering by vault_id AFTER validating ownership
        vault_id = request.query_params.get('vault_id')
        queryset = self.get_queryset()
        
        if vault_id:
            # Ensure the vault belongs to the user before filtering
            vault = get_object_or_404(Vault, pk=vault_id, owner=self.request.user)
            queryset = queryset.filter(vault=vault)
        
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
    throttle_classes = [VaultBurstThrottle, VaultSustainedThrottle]

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

    def perform_update(self, serializer):
        # Ensure that if the vault is updated, the user owns the new vault
        vault = serializer.validated_data.get('vault')
        if vault and vault.owner != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to move credentials to this vault.")
        serializer.save()

    def update(self, request, *args, **kwargs):
        # Force partial=True to allow individual field updates via PUT
        kwargs['partial'] = True
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

class CredentialRevealView(generics.RetrieveAPIView):
    """
    Reveal sensitive credential fields for a specific credential.
    This endpoint explicitly returns password, ssh_key, and other sensitive data.
    """
    serializer_class = CredentialRevealSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [VaultBurstThrottle, VaultSustainedThrottle]

    def get_queryset(self):
        return Credential.objects.filter(vault__owner=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Credential secrets revealed successfully.",
            data=response.data,
            status_code=status.HTTP_200_OK
        )

class ServerListCreateView(generics.ListCreateAPIView):
    """
    List all servers owned by the user or create a new server.
    """
    serializer_class = ServerSerializer
    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        if self.request.method == 'POST':
            return [VaultBurstThrottle(), VaultSustainedThrottle(), VaultCreateThrottle()]
        return [VaultBurstThrottle(), VaultSustainedThrottle()]

    def get_queryset(self):
        # Only return servers if the user owns the vault they belong to
        return Server.objects.filter(vault__owner=self.request.user)

    def perform_create(self, serializer):
        # Validate that the vault belongs to the user
        vault = serializer.validated_data.get('vault')
        if vault.owner != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to add servers to this vault.")
        
        # Validate that the credential (if provided) belongs to a vault owned by the user
        # AND belongs to the same vault as the server
        credential = serializer.validated_data.get('credential')
        if credential:
            if credential.vault.owner != self.request.user:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("The selected credential does not belong to you.")
            
            if credential.vault != vault:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"credential": ["The credential must belong to the same vault as the server."]})
            
        serializer.save()

    def list(self, request, *args, **kwargs):
        # Allow filtering by vault_id AFTER validating ownership
        vault_id = request.query_params.get('vault_id')
        queryset = self.get_queryset()
        
        if vault_id:
            # Ensure the vault belongs to the user before filtering
            vault = get_object_or_404(Vault, pk=vault_id, owner=self.request.user)
            queryset = queryset.filter(vault=vault)
        
        serializer = self.get_serializer(queryset, many=True)
        return api_response(
            success=True,
            message="Servers retrieved successfully.",
            data=serializer.data,
            status_code=status.HTTP_200_OK
        )

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Server created successfully.",
            data=response.data,
            status_code=status.HTTP_201_CREATED
        )

class ServerDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Retrieve, update or delete a server instance.
    """
    serializer_class = ServerSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [VaultBurstThrottle, VaultSustainedThrottle]

    def get_queryset(self):
        return Server.objects.filter(vault__owner=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Server retrieved successfully.",
            data=response.data,
            status_code=status.HTTP_200_OK
        )

    def perform_update(self, serializer):
        # Ensure that if the vault or credential is updated, they belong to the user
        vault = serializer.validated_data.get('vault')
        if vault and vault.owner != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to move servers to this vault.")
            
        credential = serializer.validated_data.get('credential')
        if credential:
            if credential.vault.owner != self.request.user:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("The selected credential does not belong to you.")
            
            # Check if credential is in the same vault as the server
            # Use the new vault if it's being updated, otherwise use existing vault
            target_vault = vault if vault else self.get_object().vault
            if credential.vault != target_vault:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"credential": ["The credential must belong to the same vault as the server."]})
        
        serializer.save()

    def update(self, request, *args, **kwargs):
        # Force partial=True to allow individual field updates via PUT
        kwargs['partial'] = True
        response = super().update(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Server updated successfully.",
            data=response.data,
            status_code=status.HTTP_200_OK
        )

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Server deleted successfully.",
            status_code=status.HTTP_200_OK
        )

# Link/Unlink Endpoints

class CredentialMoveToVaultView(APIView):
    """
    Move a credential from one vault to another.
    POST /api/vault/credentials/<uuid:pk>/move-to-vault/
    Body: {"vault_id": <new_vault_uuid>}
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [VaultBurstThrottle, VaultSustainedThrottle]

    def post(self, request, pk):
        # Get the credential (must be owned by user)
        credential = get_object_or_404(Credential, pk=pk, vault__owner=request.user)
        
        # Get the target vault (must be owned by user)
        vault_id = request.data.get('vault_id')
        if not vault_id:
            return api_response(
                success=False,
                message="vault_id is required.",
                errors={"vault_id": ["This field is required."]},
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        target_vault = get_object_or_404(Vault, pk=vault_id, owner=request.user)
        
        # Move the credential
        old_vault_name = credential.vault.name
        credential.vault = target_vault
        credential.save()
        
        return api_response(
            success=True,
            message=f"Credential moved from '{old_vault_name}' to '{target_vault.name}' successfully.",
            data=CredentialSerializer(credential).data,
            status_code=status.HTTP_200_OK
        )

class ServerLinkCredentialView(APIView):
    """
    Link or unlink a credential to/from a server.
    POST /api/vault/servers/<uuid:pk>/link-credential/
    Body: {"credential_id": <credential_uuid>}  # or null to unlink
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [VaultBurstThrottle, VaultSustainedThrottle]

    def post(self, request, pk):
        # Get the server (must be owned by user)
        server = get_object_or_404(Server, pk=pk, vault__owner=request.user)
        
        credential_id = request.data.get('credential_id')
        
        # If credential_id is null or empty, unlink
        if credential_id is None or credential_id == '':
            server.credential = None
            server.save()
            return api_response(
                success=True,
                message="Credential unlinked from server successfully.",
                data=ServerSerializer(server).data,
                status_code=status.HTTP_200_OK
            )
        
        # Otherwise, link the credential (must be owned by user)
        # AND must be in the same vault as the server
        credential = get_object_or_404(Credential, pk=credential_id, vault__owner=request.user)
        
        if credential.vault != server.vault:
            return api_response(
                success=False,
                message="The credential must belong to the same vault as the server.",
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        server.credential = credential
        server.save()
        
        return api_response(
            success=True,
            message=f"Credential '{credential.name}' linked to server '{server.name}' successfully.",
            data=ServerSerializer(server).data,
            status_code=status.HTTP_200_OK
        )

class ServerUnlinkCredentialView(APIView):
    """
    Unlink credential from a server.
    POST /api/vault/servers/<uuid:pk>/unlink-credential/
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [VaultBurstThrottle, VaultSustainedThrottle]

    def post(self, request, pk):
        # Get the server (must be owned by user)
        server = get_object_or_404(Server, pk=pk, vault__owner=request.user)
        
        if not server.credential:
            return api_response(
                success=False,
                message="Server does not have any linked credential.",
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        old_credential_name = server.credential.name
        server.credential = None
        server.save()
        
        return api_response(
            success=True,
            message=f"Credential '{old_credential_name}' unlinked from server successfully.",
            data=ServerSerializer(server).data,
            status_code=status.HTTP_200_OK
        )
