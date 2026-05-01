import re

from rest_framework import serializers


class HttpTriggerCreateSerializer(serializers.Serializer):
    node_id = serializers.CharField(max_length=255)


# v1 cron: exactly 5 whitespace-separated fields.
_CRON_RE = re.compile(
    r"^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$"
)


def _validate_cron(value: str) -> str:
    """Reject anything that isn't a 5-field cron expression."""
    if not _CRON_RE.match(value.strip()):
        raise serializers.ValidationError(
            "cron_expression must be a 5-field cron string: "
            "<minute> <hour> <day_of_month> <month_of_year> <day_of_week>"
        )
    return value.strip()


class ScheduleTriggerUpsertSerializer(serializers.Serializer):
    """Validates a schedule trigger create/update request."""

    node_id = serializers.CharField(max_length=255)
    cron_expression = serializers.CharField(max_length=255, validators=[_validate_cron])


class ScheduleTriggerResponseSerializer(serializers.Serializer):
    """Read-only shape returned from all schedule trigger endpoints."""

    node_id = serializers.CharField()
    cron_expression = serializers.CharField()
    timezone = serializers.CharField()
    is_active = serializers.BooleanField()
    created_at = serializers.DateTimeField()
    last_triggered_at = serializers.DateTimeField(allow_null=True)
    last_run_id = serializers.SerializerMethodField()
    last_error = serializers.CharField()

    def get_last_run_id(self, obj) -> str | None:  # type: ignore[override]
        return str(obj.last_run_id) if obj.last_run_id else None

class HttpTriggerListSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    workflow_id = serializers.UUIDField(source='workflow.id')
    workflow_name = serializers.CharField(source='workflow.name')
    node_id = serializers.CharField()
    trigger_url = serializers.SerializerMethodField()
    secret_last4 = serializers.CharField()
    is_active = serializers.BooleanField()
    created_at = serializers.DateTimeField()
    last_triggered_at = serializers.DateTimeField(allow_null=True)

    def get_trigger_url(self, obj):
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(f"/api/execution-engine/triggers/http/{obj.trigger_token}/")
        return ""

class ScheduleTriggerListSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    workflow_id = serializers.UUIDField(source='workflow.id')
    workflow_name = serializers.CharField(source='workflow.name')
    node_id = serializers.CharField()
    cron_expression = serializers.CharField()
    timezone = serializers.CharField()
    is_active = serializers.BooleanField()
    created_at = serializers.DateTimeField()
    last_triggered_at = serializers.DateTimeField(allow_null=True)
    last_error = serializers.CharField()
