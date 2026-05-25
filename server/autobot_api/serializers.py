from rest_framework import serializers

from autobot_api.models import LLMConfig, Thread


class LLMConfigSerializer(serializers.ModelSerializer):
    """Standard read/write serializer for LLMConfig.

    `api_key` is write-only — never returned in list/retrieve responses.
    On create, api_key is required. On update (PATCH), api_key is optional;
    if omitted, the existing encrypted value is preserved.

    Plaintext retrieval happens through the dedicated `reveal` endpoint
    (see views.LLMConfigRevealView), not here.
    """

    api_key = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=False,
        max_length=1024,
        style={'input_type': 'password'},
    )

    class Meta:
        model = LLMConfig
        fields = [
            'id',
            'name',
            'provider',
            'api_key',
            'model_name',
            'api_version',
            'base_url',
            'system_instruction',
            'is_default',
            'created_at',
            'modified_at',
        ]
        read_only_fields = ['id', 'created_at', 'modified_at']

    def validate(self, attrs):
        # api_key is required on create — but ModelSerializer can't know that
        # because we set required=False above (so PATCH works). Enforce here.
        if self.instance is None and not attrs.get('api_key'):
            raise serializers.ValidationError(
                {'api_key': 'This field is required when creating a new LLM config.'}
            )
        return attrs


class LLMConfigRevealSerializer(serializers.ModelSerializer):
    """Returns the decrypted api_key alongside the rest of the config.

    Used only by `LLMConfigRevealView` (`POST .../reveal/`). Autobot calls
    this once per chat request to get the plaintext key, then forwards it
    to LiteLLM without caching or logging the value.
    """

    class Meta:
        model = LLMConfig
        fields = [
            'id',
            'name',
            'provider',
            'api_key',
            'model_name',
            'api_version',
            'base_url',
            'system_instruction',
        ]
        read_only_fields = fields


# ── Thread (T06) ─────────────────────────────────────────────────────────────


class ThreadSerializer(serializers.ModelSerializer):
    """Read/write serializer for Thread.

    Security notes:
      • `user` is NOT in `fields` — the owner is set server-side from
        `request.user` via `perform_create`. Without this omission, a
        client could POST `{"user": <another-id>}` and create a thread
        owned by someone else.
      • `llm_config` is validated to belong to the requesting user
        (`validate_llm_config`). Otherwise a leaked or guessed LLMConfig
        UUID could be attached to one's own thread — every other endpoint
        scopes by user, but the FK itself is the soft IDOR vector.
      • Length-capped fields (`title` ≤ 255, `system_prompt_override` ≤ 8000)
        are enforced both at the model layer and by ModelSerializer.
      • Read-only metadata (id, timestamps, message_count) can never be
        spoofed by a client.
    """

    # Annotated by the list/detail view — read-only and optional in payload
    # form (POST/PATCH responses set it after the .annotate() round-trip).
    message_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Thread
        fields = [
            'id',
            'title',
            'llm_config',
            'system_prompt_override',
            'is_archived',
            'last_message_at',
            'created_at',
            'modified_at',
            'message_count',
        ]
        read_only_fields = [
            'id',
            'last_message_at',
            'created_at',
            'modified_at',
            'message_count',
        ]

    def validate_llm_config(self, value):
        """Reject any FK target that doesn't belong to the requesting user.

        Returns a generic 'not found' shape rather than 'forbidden' so we
        don't leak the existence of cross-user UUIDs.
        """
        if value is None:
            return value
        request = self.context.get('request')
        if request is None or not request.user.is_authenticated:
            raise serializers.ValidationError('Authentication required.')
        if value.user_id != request.user.id:
            raise serializers.ValidationError(
                'LLM config not found or access denied.'
            )
        return value
