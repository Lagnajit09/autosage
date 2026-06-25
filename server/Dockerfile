# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# System-level build dependencies (for psycopg2-binary, cryptography, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies into a prefix so we can copy them cleanly
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --prefix=/install --no-cache-dir -r requirements.txt


# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Only the minimal runtime libraries needed by psycopg2-binary
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application source (respects .dockerignore)
COPY . .

# ── Environment variables ─────────────────────────────────────────────────────
# These are DEFAULTS that will be overridden at runtime via --env-file or -e flags.
# Do NOT hardcode real secrets here.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=server.settings \
    PORT=8000 \
    FASTEMBED_CACHE_PATH=/opt/fastembed-cache

# ── Pre-bake the docs-RAG embedding model (Pillar A / plan 4.2b) ──────────────
# autobot_api/embeddings.py lazily loads fastembed's BAAI/bge-base-en-v1.5 on
# the first docs-search query (and during `manage.py ingest_docs`). Without
# baking it in, that first call would block on a ~200MB HuggingFace download —
# bad for cold starts and impossible in egress-restricted runtimes. Downloading
# it here (into FASTEMBED_CACHE_PATH, which the running process also reads) makes
# startup deterministic. This image runs django + celery + beat; only the web
# worker and the ingestion command ever load the model, but baking is harmless
# for the others (cache files just sit unused). Adds ~250MB to the image.
RUN python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='BAAI/bge-base-en-v1.5')"

# Expose the ASGI port
EXPOSE 8000

# ── Entrypoint ────────────────────────────────────────────────────────────────
# Run Django migrations, then start Uvicorn in production mode (no --reload).
# Workers: adjust --workers based on VM vCPU count (2 * nCPU + 1 is a good baseline).
CMD ["sh", "-c", \
  "python manage.py migrate --noinput && \
   python manage.py collectstatic --noinput && \
   exec uvicorn server.asgi:application \
     --host 0.0.0.0 \
     --port ${PORT} \
     --workers 2 \
     --loop asyncio \
     --http h11 \
     --timeout-keep-alive 120 \
     --log-level info"]
