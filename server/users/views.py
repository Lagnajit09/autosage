import logging
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import get_user_model

from server.utils import api_response
from .models import UserProfile, UserNotificationSettings
from .serializers import UserProfileSerializer, UserNotificationSettingsSerializer

logger = logging.getLogger(__name__)
User = get_user_model()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_user(request):
    """Sync Clerk identity fields (first_name, last_name, email) onto the Django shadow user."""
    user = request.user
    data = request.data
    updated_fields = []

    for field in ('first_name', 'last_name', 'email'):
        value = data.get(field)
        if value is not None:
            setattr(user, field, value)
            updated_fields.append(field)

    if updated_fields:
        user.save(update_fields=updated_fields)
        logger.info("User %s synced fields: %s", user.username, ', '.join(updated_fields))
        return Response({'message': 'User updated successfully', 'updated_fields': updated_fields})

    return Response({'message': 'No fields provided to update'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def deactivate_account(request):
    """Mark the Django shadow user as inactive. All API calls will be rejected until an admin reactivates."""
    user = request.user
    user.is_active = False
    user.save(update_fields=['is_active'])
    logger.info("User %s deactivated their account.", user.username)
    return api_response(success=True, message="Account deactivated.", data={}, status_code=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def delete_account(request):
    """
    Permanently delete the Django user and all associated data (cascade).
    The caller is responsible for also calling Clerk user.delete() on the frontend
    to remove the Clerk identity.
    """
    user = request.user
    username = user.username
    user.delete()
    logger.info("User %s permanently deleted their account.", username)
    return api_response(success=True, message="Account deleted.", data={}, status_code=status.HTTP_200_OK)


class UserProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserProfileSerializer
    http_method_names = ['get', 'patch']

    def get_object(self):
        profile, _ = UserProfile.objects.get_or_create(user=self.request.user)
        return profile

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return api_response(
            success=True,
            message="User profile retrieved successfully.",
            data=serializer.data,
            status_code=status.HTTP_200_OK
        )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return api_response(
            success=True,
            message="User profile updated successfully.",
            data=serializer.data,
            status_code=status.HTTP_200_OK
        )


class UserNotificationSettingsView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserNotificationSettingsSerializer
    http_method_names = ['get', 'patch']

    def get_object(self):
        notif_settings, _ = UserNotificationSettings.objects.get_or_create(
            user=self.request.user
        )
        return notif_settings

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return api_response(
            success=True,
            message="Notification settings retrieved successfully.",
            data=serializer.data,
            status_code=status.HTTP_200_OK
        )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return api_response(
            success=True,
            message="Notification settings updated successfully.",
            data=serializer.data,
            status_code=status.HTTP_200_OK
        )
