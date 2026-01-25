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
        # User-friendly message based on status code
        message = "An error occurred during the request."
        if response.status_code == 400:
            message = "Validation failed. Please check the provided data."
        elif response.status_code == 401:
            message = "Authentication required. Please log in."
        elif response.status_code == 403:
            message = "You do not have permission to perform this action."
        elif response.status_code == 404:
            message = "The requested resource was not found."

        # Structured response for DRF-handled exceptions
        response.data = {
            "status": "error",
            "message": message,
            "data": None,
            "errors": response.data # This contains the system/technical errors
        }
    else:
        # Unhandled exceptions (Internal Server Errors)
        logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
        
        response = Response({
            "status": "error",
            "message": "A system error occurred. Our team has been notified.",
            "data": None,
            "errors": str(exc) # The raw error for debugging
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return response
