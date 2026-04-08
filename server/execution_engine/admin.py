from django.contrib import admin
from .models import ScriptExecution, WorkflowNodeRun, WorkflowRun

@admin.register(ScriptExecution)
class ScriptExecutionAdmin(admin.ModelAdmin):
    list_display = ('id', 'script', 'server', 'status', 'started_at', 'completed_at', 'duration')
    list_filter = ('status', 'script', 'server', 'user', 'created_at')
    search_fields = ('script__name', 'server__name', 'server__ip_address', 'user__username')
    readonly_fields = ('id', 'started_at', 'completed_at', 'duration', 'created_at', 'updated_at')
    fieldsets = (
        ('Execution Info', {
            'fields': ('script', 'vault', 'server', 'credential', 'user', 'status', 'inputs')
        }),
        ('Output', {
            'fields': ('stdout_log_url', 'stderr_log_url', 'exit_code', 'logs_url')
        }),
        ('Timestamps', {
            'fields': ('started_at', 'completed_at', 'duration')
        }),
    )
    ordering = ['-created_at']
    
    def has_add_permission(self, request):
        return False
    
    def has_change_permission(self, request, obj=None):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(WorkflowRun)
class WorkflowRunAdmin(admin.ModelAdmin):
    list_display = ("id", "workflow", "user", "status", "created_at", "started_at", "finished_at")
    list_filter = ("status",)
    search_fields = ("id", "workflow__name", "celery_task_id")
    readonly_fields = ("id", "created_at", "started_at", "finished_at")
    ordering = ("-created_at",)


@admin.register(WorkflowNodeRun)
class WorkflowNodeRunAdmin(admin.ModelAdmin):
    list_display = ("id", "workflow_run", "node_label", "node_id", "status", "execution_order", "exit_code", "started_at", "finished_at")
    list_filter = ("status",)
    search_fields = ("node_id", "node_label", "workflow_run__id")
    readonly_fields = ("id", "started_at", "finished_at")
    ordering = ("workflow_run", "execution_order")
