from rest_framework import serializers

from autobot_api.models import LLMConfig


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
