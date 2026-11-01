from rest_framework import authentication, exceptions
from django.utils import timezone

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


class ApiKeyAuthentication(authentication.BaseAuthentication):
    """Authenticate a request via an ``X-API-Key: sgx_...`` header.

    Used by non-browser clients (the sagex CLI). The key is hashed and looked up;
    its owning ``User`` becomes ``request.user`` so all existing per-user scoping
    applies unchanged. Returns ``None`` when no key header is present, so the
    Clerk-JWT path (MiddlewareAuthentication) still runs for browser requests.
    """

    keyword = 'X-API-Key'

    def authenticate(self, request):
        presented = request.headers.get(self.keyword)
        if not presented:
            return None  # no API key -> let other authenticators (Clerk) try

        # ClerkAuthMiddleware already resolved this key for the same request (a DRF
        # Request proxies attribute reads to the underlying HttpRequest).
        resolved = getattr(request, '_api_key_auth', None)
        if resolved:
            return resolved

        # Imported lazily so this module stays importable before apps are ready.
        from users import cli_sessions
        from users.models import ApiKey, hash_api_key

        try:
            api_key = ApiKey.objects.select_related('user').get(key_hash=hash_api_key(presented))
        except ApiKey.DoesNotExist:
            # Present-but-invalid key is a hard failure (don't fall through).
            raise exceptions.AuthenticationFailed('Invalid API key.')

        # A known-but-dead key gets a specific reason, so the CLI can say why.
        if not api_key.is_active:
            raise exceptions.AuthenticationFailed(cli_sessions.inactive_message(api_key))
        now = timezone.now()
        if cli_sessions.is_expired(api_key, now):
            cli_sessions.revoke(api_key, ApiKey.RevokeReason.EXPIRED, now)
            raise exceptions.AuthenticationFailed(cli_sessions.inactive_message(api_key))

        user = api_key.user
        if not user.is_active:
            raise exceptions.AuthenticationFailed('User is inactive.')

        cli_sessions.record_request(api_key, request, now)
        return (user, api_key)

    def authenticate_header(self, request):
        # Make DRF return 401 (not 403) on failure.
        return self.keyword
