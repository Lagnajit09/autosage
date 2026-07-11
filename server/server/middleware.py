from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model

from server.clerk_auth import verify_clerk_token, extract_bearer_token

User = get_user_model()


class ClerkAuthMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
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
