from rest_framework import serializers
from .models import UserProfile, UserNotificationSettings


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = [
            'display_name',
            'bio',
            'timezone',
            'created_at',
            'modified_at',
        ]
        read_only_fields = ['created_at', 'modified_at']


class UserNotificationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserNotificationSettings
        fields = [
            'email_notifications',
            'push_notifications',
            'marketing_emails',
            'modified_at',
        ]
        read_only_fields = ['modified_at']
