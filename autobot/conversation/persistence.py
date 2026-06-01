"""Django persistence client for autobot.

Autobot is stateless w.r.t. user data — every read/write of threads,
messages, summaries, settings, and LLM configs goes through Django's
`/api/autobot/*` endpoints. The caller's Clerk JWT is forwarded as a
Bearer; Django re-verifies and scopes each queryset to the right user.
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

    Use the cached singleton `get_django_client()` — connection pooling
    lives there.
    """

    def __init__(self, base_url: str, timeout: float = 30.0):
        self._base_url = base_url.rstrip('/')
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=timeout,
        )

    async def aclose(self) -> None:
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
        """Authenticated request to Django; returns (status, parsed_body).

        Proxy endpoints pass the result through verbatim so Django's
        envelope ({success, message, data, errors}) reaches the client.

        Raises DjangoUnavailable on network failure / timeout.
        """
        headers = {
            "Authorization": f"Bearer {jwt}",
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
            logger.error(
                "Django request failed: method=%s path=%s err=%s",
                method, path, e,
            )
            raise DjangoUnavailable(f"Django request failed: {e}") from e

        # Wrap non-JSON responses (e.g. Django ImproperlyConfigured
        # before the response handler runs).
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
    settings = get_settings()
    return DjangoClient(base_url=settings.DJANGO_INTERNAL_URL)


async def close_django_client() -> None:
    if get_django_client.cache_info().currsize == 0:
        return
    await get_django_client().aclose()
    get_django_client.cache_clear()
