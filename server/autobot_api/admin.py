from django.contrib import admin

from autobot_api.models import LLMConfig


@admin.register(LLMConfig)
class LLMConfigAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'provider', 'model_name', 'is_default', 'modified_at')
    list_filter = ('provider', 'is_default')
    search_fields = ('name', 'user__username', 'model_name')
    readonly_fields = ('id', 'created_at', 'modified_at')

    # api_key is editable via the admin form (Fernet-encrypted on save) but
    # comes back as ciphertext when re-displayed, so what staff see in the
    # form after save is the encrypted blob. The standard reveal endpoint
    # is the right way to inspect plaintext, not the admin.
    fieldsets = (
        (None, {
            'fields': ('id', 'user', 'name', 'is_default'),
        }),
        ('Provider', {
            'fields': ('provider', 'model_name', 'api_version', 'base_url'),
        }),
        ('Secret', {
            'fields': ('api_key',),
            'description': (
                'API key is Fernet-encrypted at rest. Edits here re-encrypt '
                'on save. Use the /api/autobot/llm-configs/<id>/reveal/ '
                'endpoint to fetch plaintext for use, not this form.'
            ),
        }),
        ('Behavior', {
            'fields': ('system_instruction',),
        }),
        ('Timestamps', {
            'fields': ('created_at', 'modified_at'),
        }),
    )
