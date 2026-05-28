"""Tool implementations for autobot (T14+).

Importing this package as a side effect registers every tool defined
under `tools/` into `llm.tools._REGISTRY`. Keep imports here EXPLICIT
— a forgotten import means a forgotten tool, and the LLM will silently
lack that capability.

  • T14 — script tools (`scripts.py`)
  • T15 — workflow tools (`workflows.py`) + vault metadata (`vault.py`)

Add new imports at the bottom of this file as tool modules land.
"""

from . import scripts    # noqa: F401 — register on import
from . import vault      # noqa: F401 — register on import
from . import workflows  # noqa: F401 — register on import
