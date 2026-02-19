from rest_framework import serializers
from .models import ScriptExecution


class ScriptDetailsSerializer(serializers.Serializer):
    script_id = serializers.UUIDField()
    script_name = serializers.CharField(max_length=255)
    pathname = serializers.CharField(max_length=500)
    url = serializers.URLField()  # Vercel Blob URL (blob_url)


class VaultDetailsSerializer(serializers.Serializer):
    vault_id = serializers.UUIDField()
    server_id = serializers.UUIDField()
    credential_id = serializers.UUIDField()


class ScriptExecutionRequestSerializer(serializers.Serializer):
    script_details = ScriptDetailsSerializer()
    vault_details = VaultDetailsSerializer()
    inputs = serializers.DictField(required=False, default=dict)


class ScriptExecutionResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScriptExecution
        fields = [
            'id', 'status', 'stdout', 'stderr', 'exit_code',
            'started_at', 'completed_at', 'duration', 'logs',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields