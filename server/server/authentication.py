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
    # Skip a DB write on every request; only refresh last_used_at this often.
    _TOUCH_INTERVAL_SECONDS = 300

    def authenticate(self, request):
        presented = request.headers.get(self.keyword)
        if not presented:
            return None  # no API key -> let other authenticators (Clerk) try

        # Imported lazily so this module stays importable before apps are ready.
        from users.models import ApiKey, hash_api_key

        try:
            api_key = ApiKey.objects.select_related('user').get(
                key_hash=hash_api_key(presented),
                is_active=True,
            )
        except ApiKey.DoesNotExist:
            # Present-but-invalid key is a hard failure (don't fall through).
            raise exceptions.AuthenticationFailed('Invalid API key.')

        user = api_key.user
        if not user.is_active:
            raise exceptions.AuthenticationFailed('User is inactive.')

        self._touch(api_key)
        return (user, api_key)

    def _touch(self, api_key):
        """Best-effort last_used_at stamp, throttled to avoid a write per request."""
        now = timezone.now()
        last = api_key.last_used_at
        if last is None or (now - last).total_seconds() > self._TOUCH_INTERVAL_SECONDS:
            ApiKey.objects.filter(pk=api_key.pk).update(last_used_at=now)

    def authenticate_header(self, request):
        # Make DRF return 401 (not 403) on failure.
        return self.keyword
