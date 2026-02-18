from django.contrib import admin
from .models import ScriptExecution

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
            'fields': ('stdout', 'stderr', 'exit_code', 'logs')
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
