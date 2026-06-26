# Autosage

**Autosage** is a server management and workflow automation platform. Connect your servers, write scripts, chain them into visual workflows, and run everything on demand, on a schedule, or via webhook — with real-time log streaming and a built-in AI copilot.

> **Live app:** [autosagex.web.app](https://autosagex.web.app) &nbsp;|&nbsp; **Docs:** [autosagexdocs.web.app](https://autosagexdocs.web.app)

---

## What it does

Autosage lets you automate work on remote servers without cobbling together scripts, cron jobs, and monitoring tools. You manage everything from one dashboard:

- Write and version **scripts** (Python, PowerShell, Shell) in an in-browser editor.
- Chain scripts into **visual workflows** — a drag-and-drop DAG of trigger, action, and decision nodes.
- Connect **Linux** (SSH) and **Windows** (WinRM) servers with encrypted credentials in a Key Vault.
- Trigger runs **manually**, on a **cron schedule**, or via a **public HTTP webhook**.
- Stream **real-time logs** back to the browser as each node executes.
- Let **Autobot**, the built-in AI assistant, generate scripts and workflows, investigate failures, and drive executions through conversation.

---

## Features

### Workflow Builder

- Visual DAG canvas (powered by React Flow) with Trigger, Action, and Decision nodes.
- Per-node server + credential assignment, parameter binding, and conditional branching.
- Import / export workflows as JSON.
- Manual run, webhook trigger (HMAC-signed), or cron schedule (Celery Beat).

### Script Editor

- Monaco-based editor with language support for Python, PowerShell, and Shell.
- Versioned storage; scripts reusable across multiple workflow nodes.
- One-click execution against any connected server with live log streaming.

### Autobot — AI Assistant

- Chat interface for generating scripts and workflows from natural language.
- **Execution copilot**: run, rerun, and investigate past runs through conversation.
- Failure-investigation loop — reads logs, diagnoses errors, suggests fixes.
- BYO API key (Gemini, Groq, OpenRouter, and more) or use the shared admin pool.
- Conversation history, context summarization, and a usage dashboard.
- Secure password side-channel for workflows that require run-time secrets.

### Key Vault

- Fernet-encrypted storage of SSH keys, passwords, and WinRM credentials.
- Vault-scoped servers — credentials are never returned in plaintext to the client.
- Reusable across any number of workflow nodes.

### Execution Logs

- Unified cross-workflow run history with filters and pagination.
- Per-node stdout / stderr capture stored in cloud storage; signed-URL downloads.
- Status timeline: queued → running → success / failed / cancelled.

### Docs Assistant (Pillar A)

- Public AI chat panel embedded on the documentation site (no login required).
- Answers grounded in the docs corpus via pgvector RAG; cites source links.
- Accessible from every page as the **Ask Autobot** side panel.

---

## Tech Stack

| Layer           | Technology                                                            |
| --------------- | --------------------------------------------------------------------- |
| Frontend        | React 18, Vite 5, TypeScript, Tailwind CSS, Radix UI, React Flow      |
| Auth            | Clerk                                                                 |
| Control plane   | Django 5.2, Django REST Framework, Celery 5, Uvicorn                  |
| AI service      | FastAPI, LiteLLM, pgvector RAG (fastembed / bge-base-en-v1.5)         |
| Execution plane | FastAPI on GCP Cloud Run (SSH via Paramiko, WinRM, SMTP)              |
| Database        | Supabase (PostgreSQL + pgvector)                                      |
| Cache / queue   | Upstash Redis (Celery broker + hot context cache)                     |
| Storage         | Google Cloud Storage (script bodies + execution logs)                 |
| Hosting         | Firebase Hosting (SPA) + OCI Ampere A1 arm64 (backend Docker Compose) |

---

## Architecture

```
Browser ──HTTPS──▶ nginx (OCI A1)
                     ├──▶ /api/*        → Django (control plane)
                     ├──▶ /api/ai/*     → Autobot (FastAPI AI service)
                     └──▶ static assets

Django  ──▶ Supabase (PostgreSQL)
        ──▶ Upstash Redis (task queue + pub/sub)
        ──▶ GCS (script bodies, logs)

Celery  ──▶ Cloud Run exec-worker  ──▶ Target VM (SSH / WinRM)
```

For the full architectural reference, service topology, request flow, and contributor guidelines, see **[AGENTS.md](./AGENTS.md)**.

---

## Repositories

| Repo                                                                      | Contents                                                          |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`Lagnajit09/autosage`](https://github.com/Lagnajit09/autosage)           | This repo — Django, Autobot, React SPA, exec-worker, nginx, CI/CD |
| [`Lagnajit09/autosage-docs`](https://github.com/Lagnajit09/autosage-docs) | Docusaurus documentation site with the Ask Autobot docs assistant |

---

## Local Development

### Prerequisites

- Docker + Docker Compose (WSL2 on Windows)
- Node 20
- Clerk account (dev keys)
- API key for at least one LLM provider (Gemini free tier works)

### Start the full stack

```bash
# Copy and fill in env files
cp server/.env.example server/.env
cp autobot.env.example .env.autobot

# Start all backend services (Django + Celery + Redis + Autobot + nginx)
docker compose -f docker-compose.dev.yml up

# In a separate terminal — frontend dev server
cd client && npm install && npm run dev
```

| Service                   | URL                         |
| ------------------------- | --------------------------- |
| Frontend (Vite)           | `http://localhost:5173`     |
| API + Autobot (via nginx) | `http://localhost:8080`     |
| Django direct             | not host-mapped — use nginx |
| Autobot direct            | not host-mapped — use nginx |

> Autobot is accessible at `http://localhost:8080/api/ai/` through nginx. The container port (8030) is on the internal Docker network only.

### Run tests

```bash
# Autobot focused tests (no external deps required)
cd autobot
python -m pytest tests/ -q
```

---

## Deployment

The backend deploys to an OCI Ampere A1 VM via two independent GitHub Actions pipelines:

- **`deploy-server`** — triggers on changes to `server/`, `nginx/`, or `docker-compose.oci.yml`. Builds the Django arm64 image, pushes to GHCR, SSHes to the VM, and rolls out via `docker compose up`.
- **`deploy-autobot`** — triggers on changes to `autobot/`. Builds the Autobot arm64 image and surgically restarts only the `autobot` container (`--no-deps`).

The React SPA deploys to Firebase Hosting via **`firebase-hosting`** on changes to `client/`.

See `plans/auto_docs_rag_deployment_runbook.md` for the full rollout checklist.

---
