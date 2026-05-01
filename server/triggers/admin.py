from django.contrib import admin

from triggers.models import HttpTrigger, HttpTriggerIdempotencyKey, ScheduleTrigger


@admin.register(HttpTrigger)
class HttpTriggerAdmin(admin.ModelAdmin):
    list_display = ('trigger_token', 'workflow', 'user', 'node_id', 'is_active', 'created_at', 'rotated_at', 'last_triggered_at')


@admin.register(HttpTriggerIdempotencyKey)
class HttpTriggerIdempotencyKeyAdmin(admin.ModelAdmin):
    list_display = ('key', 'trigger', 'workflow_run', 'created_at')
    list_filter = ('trigger', 'workflow_run')
    search_fields = ('key', 'trigger__trigger_token', 'workflow_run__id')
    ordering = ['-created_at']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(ScheduleTrigger)
class ScheduleTriggerAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'workflow',
        'user',
        'node_id',
        'cron_expression',
        'timezone',
        'is_active',
        'last_triggered_at',
        'last_run',
        'created_at',
    )
    list_filter = ('is_active', 'timezone')
    search_fields = ('workflow__name', 'node_id', 'cron_expression', 'periodic_task_name')
    readonly_fields = ('id', 'periodic_task_name', 'created_at', 'updated_at', 'last_triggered_at', 'last_run', 'last_error')
    ordering = ['-created_at']