"""Django persistence client for autobot (T11).

Autobot is stateless w.r.t. user data — every read/write of threads,
messages, summaries, settings, and LLM configs goes through Django's
`/api/autobot/*` endpoints. Django stays the single source of truth for
the schema; Autobot just speaks HTTP to it over the internal docker bridge.

The caller's Clerk JWT is forwarded as a Bearer header. Django's
`ClerkAuthMiddleware` re-verifies it and scopes every queryset to the
right user — so per-user authorization is enforced exactly once, in
exactly one place.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

import httpx

from settings import get_settings

logger = logging.getLogger(__name__)


class DjangoUnavailable(Exception):
    """Django internal API unreachable / network failure / transient error."""


class DjangoClient:
    """Async httpx wrapper around Django's `/api/autobot/*` endpoints.

    One client per process — connection pooling is owned by the underlying
    `httpx.AsyncClient`. The cached singleton (`get_django_client`) is the
    only intended way to obtain an instance.
    """

    def __init__(self, base_url: str, timeout: float = 30.0):
        # Strip trailing slash so callers can pass paths like
        # `/api/autobot/threads/` without doubling up.
        self._base_url = base_url.rstrip('/')
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=timeout,
        )

    async def aclose(self) -> None:
        """Close the underlying connection pool. Called from FastAPI lifespan."""
        await self._client.aclose()

    async def request(
        self,
        *,
        method: str,
        path: str,
        jwt: str,
        json_body: Any | None = None,
        params: dict[str, Any] | None = None,
    ) -> tuple[int, Any]:
        """Make an authenticated request to Django.

        Returns ``(status_code, parsed_response_body)``. The caller decides
        how to translate the status into a FastAPI response — proxy
        endpoints pass it through verbatim so the Django api_response
        envelope (`{success, message, data, errors}`) reaches the client
        unchanged.

        Raises:
          DjangoUnavailable — network failure / timeout / no response.
        """
        headers = {
            "Authorization": f"Bearer {jwt}",
            # Django's ClerkAuthMiddleware reads `Authorization` directly;
            # no `Accept` overrides needed — DRF defaults to JSON.
        }
        try:
            resp = await self._client.request(
                method,
                path,
                headers=headers,
                json=json_body,
                params=params,
            )
        except httpx.HTTPError as e:
            # Don't include the URL in the log message if the JWT might
            # be embedded anywhere — the redactor catches the
            # `Authorization:` form but a malformed URL could leak.
            logger.error(
                "Django request failed: method=%s path=%s err=%s",
                method, path, e,
            )
            raise DjangoUnavailable(f"Django request failed: {e}") from e

        # Django always returns JSON for /api/autobot/* — even on 4xx /
        # 5xx. If it doesn't (e.g. a Django ImproperlyConfigured exception
        # before the response handler runs), wrap the text fragment.
        try:
            data = resp.json()
        except ValueError:
            logger.warning(
                "Django returned non-JSON: method=%s path=%s status=%d",
                method, path, resp.status_code,
            )
            data = {
                "success": False,
                "message": "Upstream returned non-JSON response.",
                "data": None,
                "errors": {"upstream": resp.text[:500]},
            }

        return resp.status_code, data


@lru_cache
def get_django_client() -> DjangoClient:
    """Cached singleton — connection pool lives for the process lifetime."""
    settings = get_settings()
    return DjangoClient(base_url=settings.DJANGO_INTERNAL_URL)


async def close_django_client() -> None:
    """Close the cached client, if any. Idempotent."""
    if get_django_client.cache_info().currsize == 0:
        return
    await get_django_client().aclose()
    get_django_client.cache_clear()
