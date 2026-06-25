"""Pytest fixtures for autobot tests.

The autobot package uses bare imports (`from settings import ...`,
`from routers import ...`) — i.e. `autobot/` itself is the import root, not a
top-level `autobot` package. So tests must run with `autobot/` on sys.path.
This conftest guarantees that regardless of the pytest invocation directory.
"""

from __future__ import annotations

import os
import sys

# autobot/ (the parent of this tests/ dir) must be importable as the root.
_AUTOBOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _AUTOBOT_DIR not in sys.path:
    sys.path.insert(0, _AUTOBOT_DIR)
