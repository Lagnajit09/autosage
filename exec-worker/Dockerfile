# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# System dependencies for building paramiko/pywinrm and other C-extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    libssl-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies into a prefix
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --prefix=/install --no-cache-dir -r requirements.txt


# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Minimal runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libffi8 \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application source (respects .dockerignore to avoid secrets)
COPY . .

# ── Environment variables ─────────────────────────────────────────────────────
# Defaults; to be overridden at runtime.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8020

# Expose FastAPI port
EXPOSE 8020

# ── Entrypoint ────────────────────────────────────────────────────────────────
# Run Uvicorn for async execution and streaming.
# Note: --proxy-headers is useful if running behind Nginx/ALB.
CMD ["sh", "-c", \
  "exec uvicorn main:app \
    --host 0.0.0.0 \
    --port ${PORT} \
    --workers 1 \
    --loop asyncio \
    --log-level info \
    --timeout-keep-alive 60 \
    --proxy-headers"]
