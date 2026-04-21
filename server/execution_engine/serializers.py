from rest_framework import serializers
from execution_engine.models import ScriptExecution, WorkflowRun, WorkflowNodeRun


from execution_engine.helpers.gcs import generate_signed_url, get_blob_path_from_url


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
    stdout_signed_url = serializers.SerializerMethodField()
    stderr_signed_url = serializers.SerializerMethodField()
    logs_signed_url = serializers.SerializerMethodField()

    class Meta:
        model = ScriptExecution
        fields = [
            'id', 'status', 'stdout_log_url', 'stderr_log_url', 'logs_url',
            'stdout_signed_url', 'stderr_signed_url', 'logs_signed_url',
            'exit_code', 'started_at', 'completed_at', 'duration',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_stdout_signed_url(self, obj):
        path = get_blob_path_from_url(obj.stdout_log_url)
        return generate_signed_url(path) if path else ""

    def get_stderr_signed_url(self, obj):
        path = get_blob_path_from_url(obj.stderr_log_url)
        return generate_signed_url(path) if path else ""

    def get_logs_signed_url(self, obj):
        path = get_blob_path_from_url(obj.logs_url)
        return generate_signed_url(path) if path else ""


class ScriptExecutionHistorySerializer(serializers.ModelSerializer):
    script_id = serializers.IntegerField(source='script.id', read_only=True)
    script_name = serializers.CharField(source='script.name', read_only=True)
    stdout_signed_url = serializers.SerializerMethodField()
    stderr_signed_url = serializers.SerializerMethodField()
    logs_signed_url = serializers.SerializerMethodField()

    class Meta:
        model = ScriptExecution
        fields = [
            'id', 'script_id', 'script_name', 'status',
            'stdout_signed_url', 'stderr_signed_url', 'logs_signed_url',
            'exit_code', 'started_at', 'completed_at', 'duration',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_stdout_signed_url(self, obj):
        path = get_blob_path_from_url(obj.stdout_log_url)
        return generate_signed_url(path) if path else ""

    def get_stderr_signed_url(self, obj):
        path = get_blob_path_from_url(obj.stderr_log_url)
        return generate_signed_url(path) if path else ""

    def get_logs_signed_url(self, obj):
        path = get_blob_path_from_url(obj.logs_url)
        return generate_signed_url(path) if path else ""


class WorkflowRunRequestSerializer(serializers.Serializer):
    inputs = serializers.DictField(required=False, default=dict)


class WorkflowNodeRunSerializer(serializers.ModelSerializer):
    stdout_signed_url = serializers.SerializerMethodField()
    stderr_signed_url = serializers.SerializerMethodField()
    logs_signed_url = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowNodeRun
        fields = [
            'id', 'workflow_run_id', 'node_id', 'node_label', 'status',
            'execution_order', 'stdout_log_url', 'stderr_log_url', 'logs_url',
            'stdout_signed_url', 'stderr_signed_url', 'logs_signed_url',
            'exit_code', 'error_message', 'started_at', 'finished_at'
        ]
        read_only_fields = fields

    def get_stdout_signed_url(self, obj):
        path = get_blob_path_from_url(obj.stdout_log_url)
        return generate_signed_url(path) if path else ""

    def get_stderr_signed_url(self, obj):
        path = get_blob_path_from_url(obj.stderr_log_url)
        return generate_signed_url(path) if path else ""

    def get_logs_signed_url(self, obj):
        path = get_blob_path_from_url(obj.logs_url)
        return generate_signed_url(path) if path else ""


class WorkflowRunSerializer(serializers.ModelSerializer):
    workflow_name = serializers.CharField(source='workflow.name', read_only=True)

    class Meta:
        model = WorkflowRun
        fields = [
            'id', 'workflow_id', 'workflow_name', 'user_id', 'status', 'error_message',
            'started_at', 'finished_at', 'created_at', 'inputs'
        ]
        read_only_fields = fields

