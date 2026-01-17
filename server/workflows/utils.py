from django.http import JsonResponse

def api_response(success, message, data=None, status=200, errors=None):
    response = {
        "status": "success" if success else "error",
        "message": message,
    }
    if data is not None:
        response["data"] = data
    if errors is not None:
        response["errors"] = errors
    
    return JsonResponse(response, status=status)
