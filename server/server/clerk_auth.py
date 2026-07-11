"""Reusable Clerk JWT verification.

Shared by ``ClerkAuthMiddleware`` (normal request auth) and by endpoints that
must operate on a valid Clerk identity *even when the Django shadow user is
inactive* (e.g. the account-reactivation request flow, which the middleware
otherwise downgrades to AnonymousUser).
"""
import json

import jwt
import requests
from django.conf import settings
from django.core.cache import cache
from jwt.algorithms import RSAAlgorithm

JWKS_URL = "https://api.clerk.com/v1/jwks"
_JWKS_CACHE_KEY = "clerk_jwks"
_JWKS_CACHE_TIMEOUT = 60 * 60  # 1 hour


def get_jwks():
    """Fetch (and cache) Clerk's JWKS. Returns the dict or None on failure."""
    jwks = cache.get(_JWKS_CACHE_KEY)
    if jwks:
        return jwks

    try:
        headers = {"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"}
        response = requests.get(JWKS_URL, headers=headers)
        response.raise_for_status()
        jwks = response.json()
        cache.set(_JWKS_CACHE_KEY, jwks, _JWKS_CACHE_TIMEOUT)
        return jwks
    except Exception as e:  # noqa: BLE001 — logged, non-fatal
        print(f"Error fetching JWKS: {e}")
        return None


def verify_clerk_token(token):
    """Verify a Clerk JWT and return its decoded payload.

    Raises an exception on any verification failure. Callers that need a
    non-raising variant should wrap this in try/except.
    """
    jwks = get_jwks()
    if not jwks:
        raise Exception("JWKS not available")

    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")

    public_key = None
    for key in jwks["keys"]:
        if key["kid"] == kid:
            public_key = RSAAlgorithm.from_jwk(json.dumps(key))
            break

    if not public_key:
        raise Exception("Public key not found")

    return jwt.decode(
        token,
        public_key,
        algorithms=["RS256"],
        options={"verify_aud": False, "verify_iat": True},
        leeway=60,  # Allow 60 seconds of clock skew
    )


def extract_bearer_token(request):
    """Return the bearer token from an Authorization header, or None."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    return auth_header.split(" ")[1]
