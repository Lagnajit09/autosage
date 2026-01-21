from rest_framework import serializers
from .models import Credential, Server

class CredentialSerializer(serializers.ModelSerializer):
    class Meta:
        model = Credential
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'modified_at')

class ServerSerializer(serializers.ModelSerializer):
    credential_details = CredentialSerializer(source='credential', read_only=True)

    class Meta:
        model = Server
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'modified_at')
