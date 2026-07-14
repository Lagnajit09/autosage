from django.contrib import admin

from .models import LibraryItem


@admin.register(LibraryItem)
class LibraryItemAdmin(admin.ModelAdmin):
    list_display = (
        "name", "type", "category", "is_verified", "is_published",
        "downloads", "modified_at",
    )
    list_filter = ("type", "category", "is_verified", "is_published")
    search_fields = ("name", "description")
    readonly_fields = ("id", "downloads", "created_at", "modified_at")
