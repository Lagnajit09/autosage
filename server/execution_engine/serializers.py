from rest_framework import serializers
from execution_engine.models import ScriptExecution, WorkflowRun, WorkflowNodeRun


from execution_engine.helpers.gcs import (
    generate_signed_url,
    get_blob_path_from_url,
    logs_expired,
)


class SignedLogUrlMixin:
    """
    Mints V4 signed URLs for a model's stdout/stderr/logs blobs, but returns
    empty strings (and exposes `logs_expired: true`) once the run is past the
    bucket's lifecycle retention. This stops us from handing the client a signed
    URL for a blob the 90-day lifecycle sweep has already deleted — which would
    404 and misleadingly read as "no output captured".

    Hosting serializers must declare `created_at` in their Meta fields (used to
    compute age) and add the three SerializerMethodFields + `logs_expired`.
    """

    def _expired(self, obj) -> bool:
        return logs_expired(getattr(obj, "created_at", None))

    def _signed(self, obj, log_url) -> str:
        if self._expired(obj):
            return ""
        path = get_blob_path_from_url(log_url)
        return generate_signed_url(path) if path else ""

    def get_logs_expired(self, obj) -> bool:
        return self._expired(obj)

    def get_stdout_signed_url(self, obj) -> str:
        return self._signed(obj, obj.stdout_log_url)

    def get_stderr_signed_url(self, obj) -> str:
        return self._signed(obj, obj.stderr_log_url)

    def get_logs_signed_url(self, obj) -> str:
        return self._signed(obj, obj.logs_url)


class ScriptDetailsSerializer(serializers.Serializer):
    script_id = serializers.IntegerField()
    script_name = serializers.CharField(max_length=255)
    pathname = serializers.CharField(max_length=500)


class VaultDetailsSerializer(serializers.Serializer):
    vault_id = serializers.UUIDField()
    server_id = serializers.UUIDField()
    credential_id = serializers.UUIDField()


class ScriptExecutionRequestSerializer(serializers.Serializer):
    script_details = ScriptDetailsSerializer()
    vault_details = VaultDetailsSerializer()
    inputs = serializers.DictField(required=False, default=dict)


class ScriptExecutionResponseSerializer(SignedLogUrlMixin, serializers.ModelSerializer):
    stdout_signed_url = serializers.SerializerMethodField()
    stderr_signed_url = serializers.SerializerMethodField()
    logs_signed_url = serializers.SerializerMethodField()
    logs_expired = serializers.SerializerMethodField()

    class Meta:
        model = ScriptExecution
        fields = [
            'id', 'status',
            'stdout_signed_url', 'stderr_signed_url', 'logs_signed_url',
            'logs_expired',
            'exit_code', 'started_at', 'completed_at', 'duration',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields


class ScriptExecutionHistorySerializer(SignedLogUrlMixin, serializers.ModelSerializer):
    script_id = serializers.IntegerField(source='script.id', read_only=True)
    script_name = serializers.CharField(source='script.name', read_only=True)
    stdout_signed_url = serializers.SerializerMethodField()
    stderr_signed_url = serializers.SerializerMethodField()
    logs_signed_url = serializers.SerializerMethodField()
    logs_expired = serializers.SerializerMethodField()

    class Meta:
        model = ScriptExecution
        fields = [
            'id', 'script_id', 'script_name', 'status',
            'stdout_signed_url', 'stderr_signed_url', 'logs_signed_url',
            'logs_expired',
            'exit_code', 'started_at', 'completed_at', 'duration',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields


class WorkflowRunRequestSerializer(serializers.Serializer):
    inputs = serializers.DictField(required=False, default=dict)
    send_email = serializers.BooleanField(required=False, default=False)
    user_email = serializers.EmailField(required=False, allow_blank=True, default="")
    # Only "autobot" is an accepted client-supplied source; any other value
    # (incl. "http"/"schedule") is ignored by the view and coerced to "manual"
    # so a Clerk-authed client can't impersonate a webhook or scheduled run.
    trigger_source = serializers.ChoiceField(
        choices=["manual", "autobot"], required=False, default="manual"
    )

    def validate(self, attrs):
        if attrs.get("send_email") and not attrs.get("user_email"):
            raise serializers.ValidationError(
                {"user_email": "user_email is required when send_email is true."}
            )
        return attrs


class WorkflowNodeRunSerializer(SignedLogUrlMixin, serializers.ModelSerializer):
    stdout_signed_url = serializers.SerializerMethodField()
    stderr_signed_url = serializers.SerializerMethodField()
    logs_signed_url = serializers.SerializerMethodField()
    logs_expired = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowNodeRun
        fields = [
            'id', 'workflow_run_id', 'node_id', 'node_label', 'status',
            'execution_order',
            'stdout_signed_url', 'stderr_signed_url', 'logs_signed_url',
            'logs_expired',
            'exit_code', 'error_message', 'started_at', 'finished_at'
        ]
        read_only_fields = fields

    # WorkflowNodeRun has no created_at of its own; its blobs live under the
    # parent run's path, so retention is keyed off the run's creation time.
    def _expired(self, obj) -> bool:
        run = getattr(obj, "workflow_run", None)
        return logs_expired(getattr(run, "created_at", None))


class WorkflowRunSerializer(serializers.ModelSerializer):
    workflow_name = serializers.CharField(source='workflow.name', read_only=True)

    class Meta:
        model = WorkflowRun
        fields = [
            'id', 'workflow_id', 'workflow_name', 'user_id', 'status', 'error_message',
            'started_at', 'finished_at', 'created_at', 'inputs'
        ]
        read_only_fields = fields

