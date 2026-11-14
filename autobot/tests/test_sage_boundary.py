"""Sage stays isolated from the web chat (see sage/__init__.py).

Static checks only — no Redis, Django or LLM needed.
"""

from __future__ import annotations

import ast
import pathlib

_AUTOBOT_DIR = pathlib.Path(__file__).resolve().parent.parent
_SAGE_DIR = _AUTOBOT_DIR / "sage"


def _imported_modules(path: pathlib.Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
    return found


def test_sage_does_not_import_routers():
    for path in _SAGE_DIR.rglob("*.py"):
        bad = {m for m in _imported_modules(path) if m == "routers" or m.startswith("routers.")}
        assert not bad, f"{path.name} imports {bad}; Sage must not depend on the web chat routers"


def test_routers_do_not_import_sage():
    for path in (_AUTOBOT_DIR / "routers").rglob("*.py"):
        bad = {m for m in _imported_modules(path) if m == "sage" or m.startswith("sage.")}
        assert not bad, f"routers/{path.name} imports {bad}; the web chat must not depend on Sage"


def test_sage_router_is_mounted_under_sage():
    from sage.router import router

    assert router.prefix == "/sage"
