from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
import logging

logger = logging.getLogger(__name__)

def custom_exception_handler(exc, context):
    """
    Custom exception handler for Django Rest Framework to provide a structured response.
    """
    # Call DRF's default exception handler first to get the standard error response.
    response = exception_handler(exc, context)

    if response is not None:
        # Structured response for DRF-handled exceptions (ValidationErrors, NotAuthenticated, etc.)
        response.data = {
            "status": "error",
            "message": "A validation error occurred." if response.status_code == 400 else "An error occurred during the request.",
            "data": None,
            "errors": response.data # This usually contains the field-specific errors
        }
    else:
        # Unhandled exceptions (Internal Server Errors)
        logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
        
        response = Response({
            "status": "error",
            "message": "An internal server error occurred.",
            "data": None,
            "errors": str(exc) # The raw error for debugging
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return response
