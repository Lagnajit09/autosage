# ── autobot/Dockerfile ──────────────────────────────────────────────
#
# Slim Python 3.12 base, works on both linux/amd64 (dev) and linux/arm64
# (prod OCI). Layered so changes to source code don't bust the dependency
# install cache. Non-root user. Bare-paths app — nginx strips the
# /api/ai/ prefix on the way in (see nginx/autosage-dev.conf), so the
# FastAPI app sees just /health/, /threads/, etc.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# ── Dependency layer (cached when only code changes) ───────────────────
COPY requirements.txt .
RUN pip install -r requirements.txt

# ── Source layer ───────────────────────────────────────────────────────
# Explicit file list (not `COPY . .`) so the bind-mounted venv/ dir in
# the dev tree never sneaks into the image.
COPY main.py settings.py auth.py throttling.py ./
COPY conversation/ ./conversation/
COPY llm/ ./llm/
COPY routers/ ./routers/
COPY streaming/ ./streaming/
COPY tools/ ./tools/

# ── Non-root user ──────────────────────────────────────────────────────
RUN useradd --create-home --shell /bin/bash --uid 1000 autobot \
    && chown -R autobot:autobot /app
USER autobot

EXPOSE 8030

# --workers 2 to leave headroom for SSE chat: each streaming
# response holds a worker for 10–60s; one worker + concurrent users
# deadlocks. --proxy-headers + --forwarded-allow-ips * so X-Forwarded-*
# from nginx are honored (matters for request.url.scheme behind TLS).
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8030", \
     "--workers", "2", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
