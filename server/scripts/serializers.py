from rest_framework import serializers
from .models import Script

class ScriptSerializer(serializers.ModelSerializer):
    """
    Serializer for Script model - used for listing and retrieving scripts.
    Excludes sensitive blob URLs from general listing.
    """
    owner_username = serializers.CharField(source='owner.username', read_only=True)
    
    class Meta:
        model = Script
        fields = [
            'id',
            'name',
            'pathname',
            'blob_url',
            'download_url',
            'owner',
            'owner_username',
            'content_type',
            'file_size',
            'uploaded_at',
            'updated_at',
            'version'
        ]
        read_only_fields = [
            'id',
            'blob_url',
            'download_url',
            'owner',
            'owner_username',
            'file_size',
            'uploaded_at',
            'updated_at',
            'version'
        ]


class ScriptCreateSerializer(serializers.Serializer):
    """
    Serializer for creating a new script.
    Accepts name, language, and content.
    """
    name = serializers.CharField(max_length=255, required=True)
    language = serializers.CharField(max_length=50, required=True)
    content = serializers.CharField(required=True, allow_blank=False)
    
    # Language to extension and content-type mapping
    LANGUAGE_MAP = {
        'javascript': {'ext': 'js', 'content_type': 'text/javascript'},
        'typescript': {'ext': 'ts', 'content_type': 'text/typescript'},
        'python': {'ext': 'py', 'content_type': 'text/x-python'},
        'java': {'ext': 'java', 'content_type': 'text/x-java'},
        'cpp': {'ext': 'cpp', 'content_type': 'text/x-c++src'},
        'c': {'ext': 'c', 'content_type': 'text/x-csrc'},
        'csharp': {'ext': 'cs', 'content_type': 'text/x-csharp'},
        'go': {'ext': 'go', 'content_type': 'text/x-go'},
        'rust': {'ext': 'rs', 'content_type': 'text/x-rust'},
        'ruby': {'ext': 'rb', 'content_type': 'text/x-ruby'},
        'php': {'ext': 'php', 'content_type': 'text/x-php'},
        'swift': {'ext': 'swift', 'content_type': 'text/x-swift'},
        'kotlin': {'ext': 'kt', 'content_type': 'text/x-kotlin'},
        'shell': {'ext': 'sh', 'content_type': 'text/x-shellscript'},
        'bash': {'ext': 'sh', 'content_type': 'text/x-shellscript'},
        'sql': {'ext': 'sql', 'content_type': 'text/x-sql'},
        'html': {'ext': 'html', 'content_type': 'text/html'},
        'css': {'ext': 'css', 'content_type': 'text/css'},
        'json': {'ext': 'json', 'content_type': 'application/json'},
        'xml': {'ext': 'xml', 'content_type': 'application/xml'},
        'yaml': {'ext': 'yaml', 'content_type': 'text/x-yaml'},
        'markdown': {'ext': 'md', 'content_type': 'text/markdown'},
    }
    
    def validate_language(self, value):
        """Validate that the language is supported."""
        language = value.lower()
        if language not in self.LANGUAGE_MAP:
            raise serializers.ValidationError(
                f"Unsupported language: {value}. Supported languages: {', '.join(self.LANGUAGE_MAP.keys())}"
            )
        return language
    
    def validate_name(self, value):
        """Validate script name - no special characters except underscore and hyphen."""
        import re
        if not re.match(r'^[a-zA-Z0-9_-]+$', value):
            raise serializers.ValidationError(
                "Script name can only contain letters, numbers, underscores, and hyphens."
            )
        return value
    
    def validate_content(self, value):
        """Validate that content is not empty."""
        if not value or not value.strip():
            raise serializers.ValidationError("Script content cannot be empty.")
        return value


class ScriptUpdateSerializer(serializers.Serializer):
    """
    Serializer for updating an existing script's content.
    """
    content = serializers.CharField(required=True, allow_blank=False)
    
    def validate_content(self, value):
        """Validate that content is not empty."""
        if not value or not value.strip():
            raise serializers.ValidationError("Script content cannot be empty.")
        return value


class ScriptRenameSerializer(serializers.Serializer):
    """
    Serializer for renaming a script.
    """
    new_name = serializers.CharField(max_length=255, required=True)
    
    def validate_new_name(self, value):
        """Validate script name - no special characters except underscore and hyphen."""
        import re
        if not re.match(r'^[a-zA-Z0-9_-]+$', value):
            raise serializers.ValidationError(
                "Script name can only contain letters, numbers, underscores, and hyphens."
            )
        return value


class ScriptContentSerializer(serializers.Serializer):
    """
    Serializer for returning script content.
    """
    name = serializers.CharField()
    pathname = serializers.CharField()
    content = serializers.CharField()
    language = serializers.CharField()
    content_type = serializers.CharField()
    file_size = serializers.IntegerField()
    version = serializers.IntegerField()
    uploaded_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
