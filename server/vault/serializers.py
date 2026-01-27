from rest_framework import serializers
from .models import Credential, Server, Vault

class CredentialSerializer(serializers.ModelSerializer):
    """
    Serializer for Credential model that MASKS sensitive fields in responses.
    Sensitive fields are write_only, meaning they can be provided on create/update
    but are never returned in responses.
    """
    username = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    ssh_key = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True, style={'base_template': 'textarea.html'})
    key_passphrase = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    cert_pem = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True, style={'base_template': 'textarea.html'})

    class Meta:
        model = Credential
        fields = '__all__'
        read_only_fields = ('created_at', 'modified_at')

    def validate(self, data):
        """
        Check that the required fields are present for the given credential type.
        This validation only runs on CREATE, not on partial updates (PATCH).
        """
        # Skip type-specific validation for partial updates
        if self.partial:
            return data
            
        cred_type = data.get('credential_type')
        
        if cred_type == Credential.Type.USERNAME_PASSWORD:
            if not data.get('username') or not data.get('password'):
                raise serializers.ValidationError(
                    {"detail": "Username and password are required for username_password type."}
                )
        elif cred_type == Credential.Type.SSH_KEY:
            if not data.get('ssh_key'):
                raise serializers.ValidationError(
                    {"detail": "SSH key is required for ssh_key type."}
                )
        elif cred_type == Credential.Type.CERTIFICATE:
            if not data.get('cert_pem'):
                raise serializers.ValidationError(
                    {"detail": "Certificate PEM is required for certificate type."}
                )
        
        return data

class CredentialRevealSerializer(serializers.ModelSerializer):
    """
    Serializer that INCLUDES sensitive fields for explicit reveal operations.
    This should only be used in dedicated reveal endpoints with proper authorization.
    """
    class Meta:
        model = Credential
        fields = '__all__'
        read_only_fields = ('created_at', 'modified_at')

class ServerSerializer(serializers.ModelSerializer):
    credential_details = CredentialSerializer(source='credential', read_only=True)

    class Meta:
        model = Server
        fields = '__all__'
        read_only_fields = ('created_at', 'modified_at')

    def validate(self, data):
        """
        Validate port based on connection method if port is not provided.
        Also provides basic validation for port range.
        """
        conn_method = data.get('connection_method')
        port = data.get('port')

        if port is not None:
            if not (1 <= port <= 65535):
                raise serializers.ValidationError({"port": "Port must be between 1 and 65535."})
        
        return data

class VaultSerializer(serializers.ModelSerializer):
    credentials = CredentialSerializer(many=True, read_only=True)
    servers = ServerSerializer(many=True, read_only=True)

    class Meta:
        model = Vault
        fields = '__all__'
        read_only_fields = ('owner', 'created_at', 'modified_at')
