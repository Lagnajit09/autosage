from django.contrib import admin
from .models import Script

@admin.register(Script)
class ScriptAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'pathname', 'uploaded_at', 'version') 
    list_filter = ('name', 'owner', 'pathname', 'uploaded_at', 'version')
    search_fields = ('name', 'owner', 'pathname', 'uploaded_at', 'version')
    ordering = ['-uploaded_at', '-updated_at']