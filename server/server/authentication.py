from rest_framework import authentication

class MiddlewareAuthentication(authentication.BaseAuthentication):
    """
    Simple authentication class that trusts the user set by ClerkAuthMiddleware.
    This avoids CSRF checks that SessionAuthentication performs.
    """
    def authenticate(self, request):
        # The user should have been set by ClerkAuthMiddleware on the underlying HttpRequest
        # We access the original request via request._request
        user = getattr(request._request, 'user', None)
        
        if user and user.is_authenticated:
            return (user, None)
        
        return None
