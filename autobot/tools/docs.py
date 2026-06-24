"""Docs RAG tool — the ONLY capability on the public docs chat path.

`search_docs` performs semantic (pgvector cosine) retrieval over the
Autosage documentation corpus by calling Django's
`POST /api/autobot/docs/search/`.

Auth model — deliberately different from every other tool here:
  • All other autobot tools forward the caller's Clerk JWT and Django
    scopes the result per-user.
  • The docs path is PUBLIC (no Clerk user, no JWT). This tool instead
    presents the shared `X-Internal-Secret` so the AllowAny docs-search
    view accepts the call. Django decides authorization server-side: the
    secret unlocks ONLY that one view, never an IsAuthenticated route.
    See `conversation.persistence.DjangoClient.request` for the full
    rationale and the fail-closed guard.

The handler keeps the standard tool contract — `(args, jwt)` returning a
dict — but ignores `jwt` (there is none on this path) and reads the secret
from settings. On any non-2xx it returns `{"error": ...}` so the model can
self-correct rather than seeing a raised exception.
"""

from __future__ import annotations

import logging
from typing import Any

from conversation.persistence import DjangoUnavailable, get_django_client
from llm.tools import ToolDefinition, register_tool
from settings import get_settings

logger = logging.getLogger(__name__)

# Mirror the Django-side bounds so the model gets immediate, local feedback
# instead of a round-trip clamp. Django re-clamps authoritatively.
_DOCS_MAX_QUERY_CHARS = 1000
_DOCS_DEFAULT_TOP_K = 5
_DOCS_MAX_TOP_K = 10


def _django_error(status_code: int, body: Any, default: str) -> dict[str, Any]:
    """Normalize a non-2xx Django response into a tool-result error dict."""
    msg = None
    if isinstance(body, dict):
        msg = body.get("message") or body.get("detail")
    return {"error": msg or f"{default} (HTTP {status_code})"}


async def _handler_search_docs(args: dict[str, Any], jwt: str) -> dict[str, Any]:
    # `jwt` is intentionally unused — the docs path has no user. Auth is the
    # internal secret, presented below.
    query = args.get("query")
    if not isinstance(query, str) or not query.strip():
        return {"error": "Argument 'query' must be a non-empty string."}
    query = query.strip()[:_DOCS_MAX_QUERY_CHARS]

    top_k = args.get("top_k", _DOCS_DEFAULT_TOP_K)
    if not isinstance(top_k, int) or isinstance(top_k, bool):
        top_k = _DOCS_DEFAULT_TOP_K
    top_k = max(1, min(top_k, _DOCS_MAX_TOP_K))

    secret = get_settings().AUTOBOT_INTERNAL_SECRET
    if not secret:
        # Fail closed and loud (operator), generic (model). A missing secret
        # is a deploy misconfiguration, not something the model can fix.
        logger.error(
            "search_docs invoked but AUTOBOT_INTERNAL_SECRET is unset — "
            "the docs-search endpoint cannot be reached.",
        )
        return {"error": "Docs search is temporarily unavailable."}

    client = get_django_client()
    try:
        s, body = await client.request(
            method="POST",
            path="/api/autobot/docs/search/",
            internal_secret=secret,  # no JWT on the public docs path
            json_body={"query": query, "top_k": top_k},
        )
    except DjangoUnavailable as e:
        return {"error": f"Docs search unreachable: {e}"}

    if s != 200:
        # A 401 here means the secret is wrong/missing on one side — log it
        # for the operator but don't echo the auth detail to the model.
        if s == 401:
            logger.error(
                "search_docs got 401 from Django — internal secret mismatch "
                "between autobot and Django.",
            )
            return {"error": "Docs search is temporarily unavailable."}
        return _django_error(s, body, "Docs search failed")

    raw = (body or {}).get("data") or {}
    results = raw.get("results") or []
    # Reshape to the model-facing contract: `content` → `snippet`. Drop any
    # fields the model doesn't need so the tool result stays compact.
    shaped = [
        {
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "heading_path": r.get("heading_path", ""),
            "snippet": r.get("content", ""),
        }
        for r in results
        if isinstance(r, dict)
    ]
    return {"results": shaped}


register_tool(ToolDefinition(
    name="search_docs",
    description=(
        "Search the Autosage product documentation and return the most "
        "relevant passages. ALWAYS call this before answering a question "
        "about how Autosage works — answer only from what it returns, and "
        "cite the `url` of each source you use. Returns a list of "
        "{title, url, heading_path, snippet}. If nothing relevant comes "
        "back, tell the user you couldn't find it in the docs rather than "
        "guessing."
    ),
    parameters_schema={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": (
                    "Natural-language search query describing what the user "
                    "wants to know. Rephrase the user's question into a "
                    "focused query about Autosage concepts/features."
                ),
            },
            "top_k": {
                "type": "integer",
                "description": (
                    "How many passages to retrieve (default 5, max 10). "
                    "Use more only for broad questions spanning topics."
                ),
            },
        },
        "required": ["query"],
        "additionalProperties": False,
    },
    handler=_handler_search_docs,
))
