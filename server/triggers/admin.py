from django.contrib import admin
from .models import HttpTrigger, HttpTriggerIdempotencyKey

@admin.register(HttpTrigger)
class HttpTriggerAdmin(admin.ModelAdmin):
    list_display = ('trigger_token', 'workflow', 'node_id', 'created_at', 'rotated_at', 'last_triggered_at')

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