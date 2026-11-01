from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from rest_framework import exceptions

from server.authentication import ApiKeyAuthentication
from server.clerk_auth import verify_clerk_token, extract_bearer_token

User = get_user_model()


class ClerkAuthMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Raw (non-DRF) async views such as the SSE endpoints only see
        # request.user, so CLI API keys must be resolved here as well as in DRF.
        # A present-but-invalid key never falls through to the Clerk path.
        if request.headers.get(ApiKeyAuthentication.keyword):
            try:
                result = ApiKeyAuthentication().authenticate(request)
            except exceptions.AuthenticationFailed:
                result = None
            request.user = result[0] if result else AnonymousUser()
            request._api_key_auth = result     # lets DRF skip a second lookup
            response = self.get_response(request)
            if result:
                self._count_run(request, response, result[1])
            return response

        token = extract_bearer_token(request)
        if not token:
            return self.get_response(request)

        try:
            payload = verify_clerk_token(token)

            user_id = payload.get('sub')

            user, created = User.objects.update_or_create(
                username=user_id,
                defaults={
                    # 'email': email, # Add defaults if we can extract them
                    # 'first_name': first_name,
                    # 'last_name': last_name,
                }
            )

            if not user.is_active:
                request.user = AnonymousUser()
            else:
                request.user = user

        except Exception as e:
            print(f"Auth Error: {e}")
            request.user = AnonymousUser()

        return self.get_response(request)

    @staticmethod
    def _count_run(request, response, api_key):
        """Add a run to the SageCode session's activity when one was started.

        Done here, once the response is known, so the execution views stay
        untouched. A streaming response (live script run) has its status as soon
        as the stream opens, which is when the run has started.
        """
        from users import cli_sessions

        match = getattr(request, 'resolver_match', None)
        if match and match.url_name in cli_sessions.RUN_URL_NAMES and 200 <= response.status_code < 300:
            cli_sessions.record_run_started(api_key)
