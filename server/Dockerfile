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
    PORT=8000

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
     --log-level info"]
