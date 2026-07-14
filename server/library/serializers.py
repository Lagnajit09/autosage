from rest_framework import serializers

from .models import LibraryItem


class LibraryItemListSerializer(serializers.ModelSerializer):
    """Lightweight representation for the browse grid (omits heavy ``content``)."""

    class Meta:
        model = LibraryItem
        fields = [
            'id', 'type', 'name', 'description', 'category', 'tags',
            'author', 'version', 'downloads', 'is_verified',
            'created_at', 'modified_at',
        ]
        read_only_fields = fields


class LibraryItemDetailSerializer(serializers.ModelSerializer):
    """Full representation including ``content`` for preview/fork."""

    class Meta:
        model = LibraryItem
        fields = [
            'id', 'type', 'name', 'description', 'category', 'tags',
            'content', 'author', 'version', 'downloads', 'is_verified',
            'created_at', 'modified_at',
        ]
        read_only_fields = fields
