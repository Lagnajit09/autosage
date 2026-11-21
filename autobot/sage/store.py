"""Saving Sage conversations: a thin client for Django's sage_api.

Every call forwards the user's own SageCode key (`SageAuth.call_django`), so
Django scopes every row to the key's owner — Sage never writes anything a user
couldn't write themselves.

What's saved is trimmed first (`stored_turn`): tool results longer than
SAGE_STORED_TOOL_CHARS become a digest and file text in write/edit calls a
placeholder, so the contents of a user's local files never reach the database
in full.

Saving never breaks a conversation: any failure is logged and reported as
False/None, and the caller stops saving for that connection (turn numbers are
assigned by Django in arrival order, so a gap would misnumber later turns).
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from conversation.persistence import DjangoUnavailable
from sage import compaction
from sage.auth import SageAuth
from settings import get_settings

logger = logging.getLogger(__name__)

_BASE = "/api/sage/conversations/"
_ID = re.compile(r"^[0-9a-fA-F-]{36}$")


def valid_id(value: Any) -> bool:
    return isinstance(value, str) and bool(_ID.match(value))


def stored_turn(turn: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """A finished turn as it's saved: long tool output and file text trimmed."""
    return compaction.compact_turn(turn, get_settings().SAGE_STORED_TOOL_CHARS)


async def _call(auth: SageAuth, method: str, path: str, body: Any = None) -> tuple[int, Any]:
    try:
        return await asyncio.wait_for(
            auth.call_django(method, path, json_body=body),
            timeout=get_settings().SAGE_STORE_TIMEOUT_SECONDS,
        )
    except (DjangoUnavailable, asyncio.TimeoutError) as e:
        logger.warning("Sage store: %s %s failed: %s", method, path, type(e).__name__)
        return 0, None


def _data(status: int, body: Any, ok: tuple[int, ...] = (200, 201)) -> dict[str, Any] | None:
    if status not in ok or not isinstance(body, dict) or not isinstance(body.get("data"), dict):
        return None
    return body["data"]


async def start(auth: SageAuth, *, title: str, workspace: str) -> str | None:
    """A new conversation's id (Django keeps only the newest 100 per user)."""
    data = _data(*await _call(auth, "POST", _BASE, {"title": title[:200], "workspace": workspace}))
    conversation_id = data.get("id") if data else None
    return conversation_id if valid_id(conversation_id) else None


async def save_turn(auth: SageAuth, conversation_id: str, payload: dict[str, Any]) -> int | None:
    """Append a finished turn; the turn number Django gave it."""
    data = _data(*await _call(auth, "POST", f"{_BASE}{conversation_id}/turns/", payload))
    seq = data.get("seq") if data else None
    return seq if isinstance(seq, int) else None


async def save_summary(auth: SageAuth, conversation_id: str, payload: dict[str, Any]) -> bool:
    return _data(*await _call(auth, "POST", f"{_BASE}{conversation_id}/summaries/", payload)) is not None


async def load(auth: SageAuth, conversation_id: str) -> tuple[str, dict[str, Any] | None]:
    """("ok", data) · ("missing", None): deleted, someone else's or never
    existed · ("unavailable", None): Django couldn't be reached."""
    if not valid_id(conversation_id):
        return "missing", None
    status, body = await _call(auth, "GET", f"{_BASE}{conversation_id}/")
    if status == 404:
        return "missing", None
    data = _data(status, body, ok=(200,))
    return ("ok", data) if data is not None else ("unavailable", None)
