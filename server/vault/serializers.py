from rest_framework import serializers
from .models import Credential, Server, Vault

class CredentialSerializer(serializers.ModelSerializer):
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

class VaultSerializer(serializers.ModelSerializer):
    credentials = CredentialSerializer(many=True, read_only=True)
    servers = ServerSerializer(many=True, read_only=True)

    class Meta:
        model = Vault
        fields = '__all__'
        read_only_fields = ('owner', 'created_at', 'modified_at')
