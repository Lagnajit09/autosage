from rest_framework import serializers

from autobot_api.models import LLMConfig, Message, Summary, Thread


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


# ── Message (T07) ────────────────────────────────────────────────────────────


class MessageSerializer(serializers.ModelSerializer):
    """Read/write serializer for Message.

    Security notes:
      • `thread` is NOT in `fields` — the parent is set server-side from
        the URL kwarg by the view's `perform_create`. A client cannot
        POST a message into someone else's thread by spoofing the field.
      • `role` is enum-bound by Message.Role.choices (validated by
        ModelSerializer automatically).
      • `tool_call_id` is required when role='tool' — validated below.
      • `tool_calls` is a JSON list; light shape check only (LiteLLM
        owns the strict shape at chat-time).
      • Idempotency: `client_id` is honored by the view's create() —
        a duplicate POST with the same value returns the existing
        message instead of creating a copy. Belt-and-suspenders backed
        by the partial unique constraint on (thread, client_id).
    """

    class Meta:
        model = Message
        fields = [
            'id',
            'role',
            'content',
            'content_type',
            'provider',
            'model_name',
            'prompt_tokens',
            'completion_tokens',
            'total_tokens',
            'tool_calls',
            'tool_call_id',
            'client_id',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def validate_tool_calls(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('Must be a JSON array.')
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError(
                    'Each tool_call must be a JSON object.'
                )
        return value

    def validate(self, attrs):
        # role=tool messages must reference the tool call they answer.
        # The reciprocal (assistant messages with tool_calls must have
        # tool_call_id empty) isn't strictly enforceable — LiteLLM can
        # emit either shape — so we don't gate on it.
        role = attrs.get('role') or (self.instance.role if self.instance else None)
        if role == Message.Role.TOOL:
            tool_call_id = attrs.get('tool_call_id', '')
            if self.instance is not None and not tool_call_id:
                tool_call_id = self.instance.tool_call_id
            if not tool_call_id:
                raise serializers.ValidationError(
                    {'tool_call_id': 'Required when role is "tool".'}
                )
        return attrs


# ── Summary (T07) ────────────────────────────────────────────────────────────


class SummarySerializer(serializers.ModelSerializer):
    """Read/write serializer for Summary.

    Security notes:
      • `thread` is set from the URL kwarg by the view, never from the
        request body. Same pattern as MessageSerializer.
      • `up_to_message` FK has a **narrowed queryset** scoped to the
        requesting user's own messages — DRF's primary-key lookup will
        return 400 on a cross-user UUID rather than letting it resolve
        (closes the enumeration vector).
      • Belt-and-suspenders: `validate_up_to_message` also checks the
        referenced message lives in THIS thread (not just any of the
        user's threads).
    """

    up_to_message = serializers.PrimaryKeyRelatedField(
        queryset=Message.objects.all(),  # narrowed in __init__
    )

    class Meta:
        model = Summary
        fields = [
            'id',
            'up_to_message',
            'summary_text',
            'summary_tokens',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Narrow the FK queryset to messages in the requesting user's
        # threads. Without this, an attacker could probe cross-user
        # message UUIDs via 400 vs 404 timing.
        request = self.context.get('request')
        if request is not None and getattr(request.user, 'is_authenticated', False):
            self.fields['up_to_message'].queryset = Message.objects.filter(
                thread__user=request.user,
            )

    def validate_up_to_message(self, value):
        # Even within the user's own messages, the summary's anchor must
        # be in THIS thread — otherwise you'd be creating a summary in
        # thread A that anchors against a message in thread B.
        thread_id = self.context.get('thread_id')
        if thread_id is None:
            raise serializers.ValidationError('Thread context is missing.')
        if value.thread_id != thread_id:
            raise serializers.ValidationError(
                'Message does not belong to this thread.'
            )
        return value
