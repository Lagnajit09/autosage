"""Tool implementations for autobot (T14+).

Importing this package as a side effect registers every tool defined
under `tools/` into `llm.tools._REGISTRY`. Keep imports here EXPLICIT
— a forgotten import means a forgotten tool, and the LLM will silently
lack that capability.

T14 ships only the script tools. T15 adds workflow + vault-metadata
tools. Add new imports at the bottom of this file as tool modules land.
"""

from . import scripts  # noqa: F401 — import for side effect (tool registration)
