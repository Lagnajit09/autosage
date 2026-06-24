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
        jwt: str = "",
        internal_secret: str | None = None,
        json_body: Any | None = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, Any]:
        """Request to Django; returns (status, parsed_body).

        Two MUTUALLY EXCLUSIVE auth modes, both chosen by the caller — the
        client never decides authentication itself, it only carries the
        credential the caller hands it:

          • **JWT mode (default):** pass a non-empty ``jwt``. Sends
            ``Authorization: Bearer <jwt>``. This is what every user-facing
            tool uses; Django re-verifies the Clerk token and scopes by user.

          • **Internal-secret mode:** pass ``internal_secret`` (and leave
            ``jwt`` empty). Sends ``X-Internal-Secret`` and NO Authorization
            header. Used ONLY by the public docs path, which has no user/JWT,
            to reach the secret-gated ``/api/autobot/docs/search/`` endpoint.

        SECURITY — why this can't turn a secured route into a public one:
        the secret is only ever an *autobot-side credential the caller opts
        into*; whether a request is authorized is decided SERVER-SIDE by each
        Django route's ``permission_classes``. ``IsAuthenticated`` routes
        (scripts, threads, execution engine, …) never read
        ``X-Internal-Secret`` — presenting it there just yields 401. Only the
        ``AllowAny`` docs-search view checks the secret, and it ignores
        Bearer. The two gates are disjoint and live where the client can't
        influence them. The check below is the autobot-side backstop that
        keeps the modes from blurring: a call with neither credential is a
        programming error and is refused before it leaves the process, so an
        authenticated tool can never silently degrade into an
        unauthenticated request.

        Proxy endpoints pass the result through verbatim so Django's
        envelope ({success, message, data, errors}) reaches the client.

        `headers` adds request-specific headers (e.g. `Idempotency-Key`) on
        top of the chosen auth — it can never override the auth headers.

        Raises DjangoUnavailable on network failure / timeout.
        """
        if internal_secret:
            # Internal-secret mode: no Bearer at all. Sending both would be
            # ambiguous, so the secret path is exclusive — jwt is ignored.
            req_headers = {"X-Internal-Secret": internal_secret}
            reserved = {"authorization", "x-internal-secret"}
        elif jwt:
            req_headers = {"Authorization": f"Bearer {jwt}"}
            reserved = {"authorization"}
        else:
            # Neither credential — refuse rather than emit an unauthenticated
            # request to what is almost certainly an IsAuthenticated route.
            # Fails closed; protects against an accidental empty-JWT call.
            raise ValueError(
                "DjangoClient.request requires either a non-empty `jwt` or "
                "an `internal_secret`; refusing to send an unauthenticated "
                "request.",
            )
        if headers:
            # Auth headers are non-overridable — merge extras under them.
            for k, v in headers.items():
                if k.lower() in reserved:
                    continue
                req_headers[k] = v
        try:
            resp = await self._client.request(
                method,
                path,
                headers=req_headers,
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
