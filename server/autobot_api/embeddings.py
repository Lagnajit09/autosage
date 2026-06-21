"""Local document embeddings for the docs RAG pipeline (Pillar A).

Uses fastembed (Qdrant) running a quantized ONNX model on CPU — no external API,
no rate limits, no API key. The SAME model must embed both ingested passages and
search queries, or cosine distances are meaningless (see DocChunk.embedding and
DOC_EMBEDDING_DIMENSIONS in models.py).

Resource model — who actually loads the ~300MB model:
    The model is loaded LAZILY, on the first embed call, and cached as a
    process-local singleton. Only processes that actually embed pay for it:
      • the uvicorn web process — `embed_query` in the docs-search view, and
      • the `ingest_docs` management command — `embed_passages`.
    The celery / beat / scheduler-worker processes never call this module, so
    they never load the model: no wasted RAM, no startup latency there.

    DO NOT load the model at import time or unconditionally in
    AppConfig.ready() — that would force every process (and the startup
    `migrate` / `collectstatic` steps) to load it. Keep it lazy.
"""

from __future__ import annotations

import threading

# fastembed model id. bge-base-en-v1.5 → 768-dim (matches DOC_EMBEDDING_DIMENSIONS).
EMBEDDING_MODEL_NAME = "BAAI/bge-base-en-v1.5"

# bge retrieval is asymmetric: the QUERY gets an instruction prefix, passages do
# not. fastembed 0.8.0 does NOT auto-apply this for bge-base-en-v1.5 (its
# query_embed and passage_embed return identical vectors), so we prepend the
# documented instruction ourselves and embed BOTH sides with the plain `embed()`.
# This keeps the prefix applied exactly once, independent of fastembed internals
# (a future version that starts auto-prefixing query_embed would double-apply it).
BGE_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "

_model = None
_lock = threading.Lock()


def _get_model():
    """Return the process-local embedding model, loading it on first use.

    Double-checked locking so concurrent first requests (multiple uvicorn
    coroutines hitting the search view at once) construct the model only once.
    The `fastembed` import is kept inside the function so importing this module
    is cheap for processes that never embed.
    """
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from fastembed import TextEmbedding

                _model = TextEmbedding(model_name=EMBEDDING_MODEL_NAME)
    return _model


def embed_query(text: str) -> list[float]:
    """Embed a single search query.

    Prepends the bge query instruction so query and passage live in the same
    retrieval space as bge intends. MUST stay distinct from embed_passages —
    embedding a query without the prefix measurably hurts recall.
    """
    model = _get_model()
    vector = next(iter(model.embed([BGE_QUERY_INSTRUCTION + text])))
    return vector.tolist()


def embed_passages(texts: list[str]) -> list[list[float]]:
    """Embed document chunks/passages (no query prefix). Batched.

    Returns one vector per input text, in order. Empty input → empty list.
    """
    if not texts:
        return []
    model = _get_model()
    return [vector.tolist() for vector in model.embed(texts)]
