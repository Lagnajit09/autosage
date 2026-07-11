import logging
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail

from server.utils import api_response
from server.clerk_auth import verify_clerk_token, extract_bearer_token
from .models import UserProfile, UserNotificationSettings
from .serializers import UserProfileSerializer, UserNotificationSettingsSerializer

logger = logging.getLogger(__name__)
User = get_user_model()


def _resolve_clerk_user(request):
    """Verify the request's Clerk JWT and return the matching Django user.

    Unlike the request.user set by ClerkAuthMiddleware, this returns the user
    even when they are *inactive* — required for the reactivation flow, since
    the middleware downgrades deactivated users to AnonymousUser.

    Returns the User instance, or None if the token is missing/invalid or no
    matching user exists.
    """
    token = extract_bearer_token(request)
    if not token:
        return None
    try:
        payload = verify_clerk_token(token)
    except Exception as e:  # noqa: BLE001
        logger.warning("Clerk token verification failed: %s", e)
        return None
    user_id = payload.get('sub')
    if not user_id:
        return None
    return User.objects.filter(username=user_id).first()


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


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def account_status(request):
    """Report whether the Clerk-authenticated user's Django account is active.

    Used right after sign-in to detect deactivated accounts (whom the auth
    middleware otherwise hides as AnonymousUser) and route them to the
    reactivation-request page.
    """
    user = _resolve_clerk_user(request)
    if user is None:
        return api_response(
            success=False,
            message="Could not verify account.",
            data={"exists": False},
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
    return api_response(
        success=True,
        message="Account status retrieved.",
        data={"exists": True, "is_active": user.is_active},
        status_code=status.HTTP_200_OK,
    )


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def request_reactivation(request):
    """Email the admin inbox with a deactivated user's reactivation request.

    Verifies the Clerk token directly (the user is inactive, so middleware
    treats them as anonymous). No-ops safely if the account is already active.
    """
    user = _resolve_clerk_user(request)
    if user is None:
        return api_response(
            success=False,
            message="Could not verify account.",
            data={},
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    if user.is_active:
        return api_response(
            success=True,
            message="Your account is already active.",
            data={"is_active": True},
            status_code=status.HTTP_200_OK,
        )

    message = (request.data.get('message') or '').strip()
    email = user.email or 'unknown'

    admin_email = getattr(settings, 'ADMIN_NOTIFICATION_EMAIL', None)
    if not admin_email:
        logger.error("ADMIN_NOTIFICATION_EMAIL not configured; cannot send reactivation request.")
        return api_response(
            success=False,
            message="Reactivation requests are temporarily unavailable. Please contact support.",
            data={},
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    body = (
        "A deactivated user has requested account reactivation.\n\n"
        f"Django username (Clerk sub): {user.username}\n"
        f"Email: {email}\n"
        f"Name: {(user.get_full_name() or '').strip() or 'N/A'}\n\n"
        f"User message:\n{message or '(no message provided)'}\n\n"
        "To reactivate, set is_active=True on this user in the Django admin."
    )

    try:
        send_mail(
            subject=f"[Autosage] Account reactivation request — {email}",
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[admin_email],
            fail_silently=False,
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("Failed to send reactivation request email for %s: %s", user.username, e)
        return api_response(
            success=False,
            message="Failed to send your request. Please try again later.",
            data={},
            status_code=status.HTTP_502_BAD_GATEWAY,
        )

    logger.info("Reactivation request sent to admin for user %s.", user.username)
    return api_response(
        success=True,
        message="Your reactivation request has been sent to the administrator.",
        data={},
        status_code=status.HTTP_200_OK,
    )


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
