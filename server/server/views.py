from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import logging

logger = logging.getLogger(__name__)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_user(request):
    """
    Update the current authenticated user's profile information.
    Expected payload: { first_name?: string, last_name?: string, email?: string }
    """
    user = request.user
    data = request.data

    first_name = data.get('first_name')
    last_name = data.get('last_name')
    email = data.get('email')

    updated_fields = []

    if first_name is not None:
        user.first_name = first_name
        updated_fields.append('first_name')
    
    if last_name is not None:
        user.last_name = last_name
        updated_fields.append('last_name')
    
    if email is not None:
        user.email = email
        updated_fields.append('email')

    if updated_fields:
        user.save(update_fields=updated_fields)
        logger.info(f"User {user.username} updated fields: {', '.join(updated_fields)}")
        return Response({
            "message": "User updated successfully",
            "updated_fields": updated_fields
        }, status=status.HTTP_200_OK)
    
    return Response({
        "message": "No fields provided to update"
    }, status=status.HTTP_400_BAD_REQUEST)
