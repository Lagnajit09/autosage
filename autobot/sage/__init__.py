"""Sage — the SageCode agent runtime.

Lives in the Autobot service but is isolated from the web chat: nothing here
imports from ``routers.chat`` (or other routers), and the web chat never
imports from here. That boundary is what lets Sage grow (WebSocket session,
local tools, sub-agents, model routing) without breaking the browser flow.
Shared building blocks it may reuse: ``llm.client``, ``conversation.persistence``,
``streaming``, ``settings``.

Mounted at ``/sage`` (externally ``/api/ai/sage/``); persistence goes through
Django's ``sage_api`` app, never straight to Postgres.
"""
