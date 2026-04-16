import json
import uuid
from django.http import JsonResponse
from rest_framework.request import Request as DRFRequest

def json_response(success: bool, message: str, data=None, errors=None, status_code: int = 200) -> JsonResponse:
    """Async-safe replacement for api_response() that returns JsonResponse."""
    return JsonResponse(
        {"success": success, "message": message, "data": data, "errors": errors},
        status=status_code,
    )

def sse_event(event: str, data: dict) -> str:
    """Format a Server-Sent Event frame."""
    from django.core.serializers.json import DjangoJSONEncoder
    return f"event: {event}\ndata: {json.dumps(data, cls=DjangoJSONEncoder)}\n\n"

def uuid_to_str(data):
    """Recursively convert UUID objects to strings."""
    if isinstance(data, dict):
        return {k: uuid_to_str(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [uuid_to_str(v) for v in data]
    elif isinstance(data, uuid.UUID):
        return str(data)
    return data

def check_throttle(request, throttle_class):
    """
    Run a DRF throttle against the raw Django request.
    Returns True when the request is allowed.
    """
    throttle = throttle_class()
    # DRF throttles need a DRF Request wrapper; we build a minimal one.
    drf_request = DRFRequest(request)
    drf_request._user = request.user
    return throttle.allow_request(drf_request, None)
