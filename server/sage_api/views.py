from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from server.utils import api_response
from users.models import ApiKey


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sage_ping(request):
    """Authenticated canary for the Sage app: proves routing + auth reach it.

    Read-only and touches no table. Reports which credential kind was used so a
    deploy can be checked from both the CLI (API key) and the browser (Clerk).
    """
    client = 'cli' if isinstance(request.auth, ApiKey) else 'web'
    return api_response(message='Sage is reachable.', data={'service': 'sage_api', 'client': client})
