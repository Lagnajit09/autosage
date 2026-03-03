from rest_framework import serializers
from .models import ScriptExecution


class ScriptDetailsSerializer(serializers.Serializer):
    script_id = serializers.IntegerField()
    script_name = serializers.CharField(max_length=255)
    pathname = serializers.CharField(max_length=500)
    url = serializers.URLField()  # GCS blob URL


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
            'id', 'status', 'stdout_log_url', 'stderr_log_url', 'logs_url', 'exit_code',
            'started_at', 'completed_at', 'duration',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields


class ScriptExecutionHistorySerializer(serializers.ModelSerializer):
    script_id = serializers.IntegerField(source='script.id', read_only=True)
    script_name = serializers.CharField(source='script.name', read_only=True)

    class Meta:
        model = ScriptExecution
        fields = [
            'id', 'script_id', 'script_name', 'status', 'stdout_log_url', 'stderr_log_url',
            'logs_url', 'exit_code', 'started_at', 'completed_at', 'duration',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields