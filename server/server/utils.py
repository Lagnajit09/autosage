from rest_framework.response import Response
from rest_framework import status

def api_response(success=True, message="", data=None, errors=None, status_code=status.HTTP_200_OK):
    """
    Standardize API response format.
    """
    response_data = {
        "status": "success" if success else "error",
        "message": message,
        "data": data,
        "errors": errors
    }
    return Response(response_data, status=status_code)
