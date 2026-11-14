"""HTTP/WebSocket entry point for Sage.

Empty on purpose: routes arrive with the auth bridge (SageCode API keys), so
that no Sage route ever exists without authentication. Every route added here
must authenticate — the only unauthenticated route in Autobot stays /health/
(plus the bounded public docs path).
"""

from fastapi import APIRouter

router = APIRouter(prefix="/sage", tags=["sage"])
