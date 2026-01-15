from django.contrib import admin

from .models import Workflow


@admin.register(Workflow)
class WorkflowAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "created_at", "modified_at")
    search_fields = ("name",)
    readonly_fields = ("created_at", "modified_at")
