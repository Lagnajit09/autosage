import requests
import jwt
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from django.core.cache import cache
from jwt.algorithms import RSAAlgorithm
import json

User = get_user_model()

class ClerkAuthMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.jwks_url = "https://api.clerk.com/v1/jwks"
        self.jwks_cache_key = "clerk_jwks"
        self.jwks_cache_timeout = 60 * 60  # 1 hour

    def get_jwks(self):
        jwks = cache.get(self.jwks_cache_key)
        if jwks:
            return jwks
        
        try:
            headers = {"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"}
            response = requests.get(self.jwks_url, headers=headers)
            response.raise_for_status()
            jwks = response.json()
            cache.set(self.jwks_cache_key, jwks, self.jwks_cache_timeout)
            return jwks
        except Exception as e:
            print(f"Error fetching JWKS: {e}")
            return None

    def __call__(self, request):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return self.get_response(request)

        token = auth_header.split(' ')[1]
        
        try:
            jwks = self.get_jwks()
            if not jwks:
                raise Exception("JWKS not available")

            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get('kid')
            
            public_key = None
            for key in jwks['keys']:
                if key['kid'] == kid:
                    public_key = RSAAlgorithm.from_jwk(json.dumps(key))
                    break
            
            if not public_key:
                raise Exception("Public key not found")

            payload = jwt.decode(
                token,
                public_key,
                algorithms=['RS256'],
                options={"verify_aud": False, "verify_iat": True},
                leeway=60  # Allow 60 seconds of clock skew
            )
            
            user_id = payload.get('sub')
            email = None
            first_name = ""
            last_name = ""
            
            user, created = User.objects.update_or_create(
                username=user_id,
                defaults={
                    # 'email': email, # Add defaults if we can extract them
                    # 'first_name': first_name,
                    # 'last_name': last_name,
                }
            )
            
            request.user = user

        except Exception as e:
            print(f"Auth Error: {e}")
            request.user = AnonymousUser()

        return self.get_response(request)
