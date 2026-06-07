"""Tool implementations for autobot.

Importing this package registers every tool into `llm.tools._REGISTRY`
as a side effect. Keep imports here EXPLICIT — a forgotten import means
the LLM silently lacks that capability.
"""

from . import execution  # noqa: F401 — register on import
from . import scripts    # noqa: F401 — register on import
from . import vault      # noqa: F401 — register on import
from . import workflows  # noqa: F401 — register on import
