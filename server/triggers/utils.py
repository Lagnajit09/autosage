"""Helpers for HTTP-trigger token generation, secret hashing, and verification.

Uses Django's built-in PBKDF2 hashers (no extra dependencies). The plaintext
secret is shown once to the user; only the hash is persisted.
"""
from __future__ import annotations

import secrets

from django.contrib.auth.hashers import check_password, make_password

SECRET_PREFIX = "whsk_"
TOKEN_NBYTES = 24
SECRET_NBYTES = 24


def generate_trigger_token() -> str:
    """Return a URL-safe random slug used as the public trigger identifier."""
    return secrets.token_urlsafe(TOKEN_NBYTES)


def generate_secret() -> str:
    """Return a fresh plaintext secret with a recognizable prefix."""
    return f"{SECRET_PREFIX}{secrets.token_urlsafe(SECRET_NBYTES)}"


def hash_secret(plain: str) -> str:
    """Hash a secret with Django's default password hasher (PBKDF2-SHA256)."""
    return make_password(plain)


def verify_secret(plain: str, hashed: str) -> bool:
    """Constant-time comparison of plaintext against a stored hash."""
    if not plain or not hashed:
        return False
    try:
        return check_password(plain, hashed)
    except Exception:
        return False


def secret_last4(plain: str) -> str:
    return plain[-4:] if plain else ""
