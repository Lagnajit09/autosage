from django.contrib import admin

from autobot_api.models import LLMConfig, Message, Summary, Thread, UserSettings


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


# ── Conversation models (T05) ────────────────────────────────────────────────


class MessageInline(admin.TabularInline):
    """Compact message list inside the Thread admin page."""
    model = Message
    extra = 0
    can_delete = False
    fields = ('role', 'created_at', 'provider', 'model_name', 'total_tokens')
    readonly_fields = fields
    ordering = ('created_at',)

    def has_add_permission(self, request, obj=None):
        # Admin shouldn't be injecting messages into threads; they come
        # from the chat endpoint only.
        return False


@admin.register(Thread)
class ThreadAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'last_message_at', 'is_archived', 'modified_at')
    list_filter = ('is_archived',)
    search_fields = ('title', 'user__username', 'id')
    readonly_fields = ('id', 'created_at', 'modified_at', 'last_message_at')
    raw_id_fields = ('user', 'llm_config')
    inlines = [MessageInline]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'thread', 'role', 'provider', 'model_name', 'total_tokens', 'created_at')
    list_filter = ('role', 'content_type', 'provider')
    search_fields = ('id', 'thread__id', 'thread__user__username', 'content')
    readonly_fields = ('id', 'created_at')
    raw_id_fields = ('thread',)


@admin.register(Summary)
class SummaryAdmin(admin.ModelAdmin):
    list_display = ('id', 'thread', 'up_to_message', 'summary_tokens', 'created_at')
    search_fields = ('id', 'thread__id', 'thread__user__username')
    readonly_fields = ('id', 'created_at')
    raw_id_fields = ('thread', 'up_to_message')


@admin.register(UserSettings)
class UserSettingsAdmin(admin.ModelAdmin):
    list_display = ('user', 'default_llm_config', 'tone', 'expertise', 'language', 'modified_at')
    list_filter = ('tone', 'expertise', 'language')
    search_fields = ('user__username',)
    readonly_fields = ('created_at', 'modified_at')
    raw_id_fields = ('user', 'default_llm_config')
