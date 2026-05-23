# ── autobot/Dockerfile — minimal scaffold (T02) ───────────────────────────
#
# This is a "just enough to start hello world" scaffold. T09 will rewrite it
# with proper layering (separate dependency install layer), pinned versions
# from requirements.txt (which is currently UTF-16 LE BOM-encoded and needs
# re-encoding as UTF-8 before pip can read it), a non-root user, and any
# LLM-related system deps (e.g. ca-certificates for outbound TLS to LLM APIs).
#
# Until T09: this installs FastAPI + uvicorn directly so the build doesn't
# depend on the existing autobot/requirements.txt encoding.

FROM python:3.12-slim

# Quieter pip + no .pyc files cluttering the image.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN pip install \
    fastapi==0.115.0 \
    "uvicorn[standard]==0.30.6"

COPY main.py ./

EXPOSE 8030

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8030"]
