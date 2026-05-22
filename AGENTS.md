# AGENT GUIDELINES FOR AUTOSAGE REPOSITORY

This document is the authoritative architectural and operational reference for **Autosage**. It explains what the system does, how the services fit together, how requests flow end-to-end, how state is stored, how deployments happen, and what conventions agents must preserve when making changes.

No secrets, tokens, keys, hostnames, or vendor account IDs are recorded here. Use environment variables / secret managers for those.

---

## 1. What Autosage Is

Autosage is a **remote script automation and workflow execution platform**.

Users can:

- Build, save, version, and execute **workflows** (visual DAGs of trigger / action / decision nodes).
- Run Python, PowerShell, and shell scripts against target **VMs** (Linux via SSH, Windows via WinRM).
- Send transactional **emails** from a workflow node (SMTP).
- Trigger workflows three ways: **manual** (UI), **HTTP webhook** (public, secret-protected), or **cron schedule** (Celery Beat).
- Reuse and fork **templates**.
- Use **Autobot**, the built-in AI assistant, to generate scripts/workflows, troubleshoot, and help drive automation. *Autobot is a new, in-progress service.*

---

## 2. System Topology — Three Planes

Autosage splits into three independently-deployed planes:

| Plane | Where | Code | Responsibility |
|---|---|---|---|
| **Frontend (UI)** | Firebase Hosting (CDN) | `client/` | React SPA, Clerk sign-in, SSE consumer |
| **Control plane** | OCI Ampere A1 VM, in `docker compose` | `server/` + `nginx/` | API, auth, orchestration, SSE relay |
| **Execution plane** | GCP Cloud Run | `exec-worker/` | SSH/WinRM/SMTP execution, NDJSON streaming |

Plus the brand-new **Autobot service** at `autobot/` (FastAPI) — currently a Hello-World scaffold; client-side routes (`/ai/autobot`) already exist but are not wired to a backend yet.

External managed services:

| Service | Purpose |
|---|---|
| **Clerk** | Identity + JWT issuance |
| **Supabase Postgres** | Primary relational store |
| **Upstash Redis** | Celery broker + result backend + Pub/Sub log channel |
| **GCS `autosagex-drive`** | Script bodies |
| **GCS `autosagex-logs`** | Per-execution stdout/stderr/logs bundle |
| **Gmail SMTP** | Completion notification email |
| **DuckDNS** | Free DDNS pointing at the OCI A1 public IP (so Let's Encrypt can issue a cert) |

---

## 3. Repository Layout

```
autogen/
├── client/                       # React + Vite frontend
├── server/                       # Django 5.2 control plane
├── exec-worker/                  # FastAPI execution worker
├── autobot/                      # NEW FastAPI service (in-progress)
├── server_v1/                    # LEGACY Node/Express backend — not used
├── architecture/                 # v2 architecture docs (authoritative diagrams)
├── plans/                        # Migration playbooks
├── nginx/                        # nginx configs (bootstrap + production TLS)
├── docker-compose.oci.yml        # Compose stack for OCI A1
├── docker-compose.yml            # Local dev compose
├── docker-compose.env.example    # Env template (no secrets)
├── cloudbuild.yaml               # Cloud Build pipeline for exec-worker
└── AGENTS.md                     # This file
```

Inside `server/` (Django apps):

```
server/
├── server/             # Django project: settings, urls, middleware, celery, auth
├── workflows/          # Workflow CRUD (graph stored as JSON)
├── scripts/            # Script CRUD + GCS upload/download/rename
├── vault/              # Vault / Server / Credential (Fernet-encrypted)
├── triggers/           # HTTP + Schedule triggers, beat sync, fire_scheduled_workflow
└── execution_engine/   # Run orchestration, DAG, SSE, run history, completion email
    ├── helpers/
    │   ├── graph.py
    │   ├── params.py
    │   ├── gcs.py
    │   ├── redis_pubsub.py
    │   ├── run_builder.py
    │   ├── notifications/
    │   └── script_execution/  # worker.py, executor.py, utils.py
    ├── templates/email/
    ├── views_workflow.py
    ├── views_script.py
    ├── tasks.py        # Celery: execute_workflow
    └── models.py       # ScriptExecution, WorkflowRun, WorkflowNodeRun
```

Inside `exec-worker/`:

```
exec-worker/
├── main.py             # FastAPI app, request models, /execute, /execute/email, /stop, /health
├── executors/
│   ├── shell_executor.py        # SSH via paramiko, streaming
│   ├── powershell_executor.py   # WinRM via pywinrm
│   └── email_executor.py        # SMTP via aiosmtplib + Jinja templates
└── templates/email/             # HTML email templates
```

Inside `client/src/`:

```
client/src/
├── App.tsx                 # Router + providers
├── lib/api-client.ts       # apiRequest() — Bearer JWT, sanitization, error dispatch
├── lib/api/executions.ts   # Execution endpoints client
├── pages/                  # Dashboard, Workflow, WorkflowExecution, ScriptEditor, AutobotChat, ...
├── components/
│   ├── workflow/           # ReactFlow builder, nodes, RightSidebar conf panels
│   ├── Execution/          # Terminal, Nodes, History, Response, Parameters
│   ├── ExecutionLogs/      # Table, filters, pagination
│   ├── Chat/               # Autobot chat UI (currently mocked content)
│   ├── vault/, auth/, ui/  # Vault modal, Clerk-aware routes, Radix-based UI
│   └── Dashboard/          # Stats, recent items, sidebar
└── contexts/, hooks/, sanitizers/, utils/
```

---

## 4. End-to-End Workflow Execution Flow

This is the canonical happy path that every agent must understand before touching execution code.

```
Browser ──HTTPS──▶ nginx ──HTTP──▶ Django (Uvicorn ASGI)
                                       │
                                       ├─▶ Supabase: persist WorkflowRun + N×WorkflowNodeRun (queued)
                                       ├─▶ Redis: enqueue execute_workflow on "celery" queue
                                       └─▶ 202 {workflow_run_id} (returns immediately)

Browser ──EventSource (SSE) on /runs/<id>/stream/──▶ nginx ──▶ Django async view
                                                                  └─▶ SUBSCRIBE workflow_run:<id>:logs

Celery worker  pops execute_workflow
  ├─ build_dag() over workflow.nodes/edges
  ├─ topo_order
  ├─ for each node:
  │     ├─ trigger     → mark success
  │     ├─ decision    → eval conditions, prune dead branch
  │     └─ action:
  │           ├─ script: fetch script body from GCS, render {{params}},
  │           │          httpx.stream POST exec-worker /api/worker/execute
  │           └─ email:  httpx.stream POST exec-worker /api/worker/execute/email
  ├─ for each NDJSON chunk from worker:
  │     ├─ mask passwords
  │     ├─ append to in-memory stdout/stderr buffers + logs list
  │     └─ publish_workflow_log(run_id, event, data)  → Redis Pub/Sub
  ├─ upload final stdout/stderr/logs.json bundle to GCS autosagex-logs
  ├─ update WorkflowNodeRun status / exit_code / log URLs
  └─ on completion: publish 'done' + (optional) send completion email
```

### 4.1 Numbered request flow

1. **Frontend load** — Browser fetches the SPA from Firebase CDN.
2. **Auth** — Clerk SDK issues a JWT to the browser.
3. **Hostname resolution** — `autosagex-api.duckdns.org` → A1 public IP.
4. **API request** — Browser POSTs `/api/execution-engine/workflows/<id>/run/` with `Authorization: Bearer <JWT>`. nginx terminates TLS, sets `X-Forwarded-Proto: https`, forwards to `http://django:8000`. Django's `SECURE_PROXY_SSL_HEADER` makes `request.scheme == 'https'`.
5. **Persist** — Django creates `WorkflowRun` + N×`WorkflowNodeRun` rows in Supabase.
6. **Enqueue + subscribe** — Django publishes the `execute_workflow` task to the Redis `celery` queue and returns 202 with the run id. The client opens an `EventSource` to `/api/execution-engine/workflows/runs/<id>/stream/`. That async view subscribes to `workflow_run:<id>:logs`.
7. **Script fetch + render** — The Celery worker pops the task, downloads each script body from `autosagex-drive`, and resolves `{{param}}` placeholders.
8. **Execute** — Celery streams an NDJSON POST to Cloud Run exec-worker (`X-API-Key` + Google OIDC bearer). The worker SSHes / WinRMs into the target VM, runs the script, and streams stdout/stderr line-by-line back to Django.
9. **Stream relay** — For every NDJSON chunk Django publishes a Pub/Sub event on the per-run channel. The SSE async view picks it up and emits an SSE frame to the browser. nginx is configured with `proxy_buffering off` so chunks flush instantly.
10. **Persist final logs** — When the workflow finishes, Celery uploads the stdout/stderr/`logs.json` bundle to GCS `autosagex-logs` and writes final status onto WorkflowRun.
11. **Optional email** — If `send_email=True` was set when the run was triggered, Django dispatches a completion email via Gmail SMTP.

---

## 5. Triggers — All Roads Lead to `enqueue_workflow_run()`

Autosage supports three trigger sources. **All three converge on a single helper, `execution_engine/helpers/run_builder.py::enqueue_workflow_run()`** — the only place that validates the DAG, validates bindings, masks secrets, persists `WorkflowRun` + `WorkflowNodeRun` rows, and dispatches the Celery task.

### 5.1 Manual trigger (UI)
- `POST /api/execution-engine/workflows/<id>/run/`
- Requires Clerk JWT.
- Body: `{ inputs, send_email, user_email }`.
- Returns **202** with `{ workflow_run_id, status: "queued" }`. Returns immediately — does not wait for execution.

### 5.2 HTTP webhook (public)
- `POST /api/execution-engine/triggers/http/<trigger_token>/`
- **No Clerk auth.** Authenticated via the `X-Trigger-Secret` header, which is bcrypt-verified against the per-trigger stored hash. Only the hash lives in the DB. Plaintext shown to the user **exactly once** on create/rotate.
- **Idempotency-Key header is required.** Repeat requests with the same key on the same trigger return the original `WorkflowRun` instead of starting a duplicate. Race-safe via a unique constraint in `http_trigger_idempotency_keys`.
- Throttled per `trigger_token` (not per user), via the custom `HttpTriggerThrottle`.
- Response includes a `polling_url` callers can GET (with the same secret) to check run status without Clerk auth.
- Public polling endpoint: `GET /api/execution-engine/triggers/http/<token>/runs/<run_id>/`.

### 5.3 Cron schedule (Celery Beat)
- Uses `django_celery_beat.schedulers:DatabaseScheduler`. Schedules live in DB tables, managed dynamically via API/UI — no service restart needed.
- The Django view idempotently syncs a `PeriodicTask` + `CrontabSchedule` row.
- v1 constraints: UTC only, 5-field cron expressions only.
- Beat enqueues `triggers.fire_scheduled_workflow` onto the **`scheduler` queue** (separate Celery queue + dedicated worker so cron firing is never blocked behind long workflow runs).
- `fire_scheduled_workflow` re-validates the schedule, enforces the **overlap policy** (skip if a queued/running scheduled run for this workflow already exists), then calls `enqueue_workflow_run(trigger_source="schedule")`.

---

## 6. Celery & Redis Configuration

Celery is the backbone of background execution.

### 6.1 Broker & backend
- **Broker**: Upstash Redis via `rediss://`, URL in `CELERY_BROKER_URL`.
- **Result backend**: same Redis. **But `CELERY_TASK_IGNORE_RESULT=True`** — no view ever calls `task.get()`; run state is tracked in Supabase (`WorkflowRun.status`). This eliminates per-task SET/EXPIRE on the broker — important on cost-billed Redis.
- `CELERY_RESULT_EXPIRES = 3600` (belt-and-braces 1h auto-expiry if a result does land).

### 6.2 Stability for remote Redis on Windows / cross-region
- `visibility_timeout`: 3600s — long workflows complete without being re-enqueued.
- `socket_timeout` & `socket_connect_timeout`: 30s.
- `socket_keepalive`: True.
- `retry_on_timeout`: enabled.
- `CELERY_BROKER_POOL_LIMIT = None` — pool disabled to avoid stale connections on long-lived workers.
- `CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True`.

### 6.3 Task time limits
- `CELERY_TASK_SOFT_TIME_LIMIT = 1800` (30 min)
- `CELERY_TASK_TIME_LIMIT = 3600` (hard kill after 1 hour)

### 6.4 Queue routing
- **`scheduler` queue**: dedicated to the lightweight `triggers.fire_scheduled_workflow`. Never blocked by heavy workflow runs.
- **`celery` (default) queue**: heavy `workflows.execute_workflow`.

Two separate Celery worker processes consume these queues independently.

### 6.5 Beat scheduler
- `CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'`.
- The Beat container runs as a separate compose service.

---

## 7. SSE & Real-Time Log Streaming

Workflow logs reach the browser through a Redis Pub/Sub hop:

```
Celery (publisher)  ─▶  Redis Pub/Sub channel `workflow_run:<id>:logs`
                                     │
                                     ▼
            Django async view (subscriber)  ─▶  SSE frames  ─▶  nginx  ─▶  Browser
```

### Why Pub/Sub instead of a direct stream?
- The Celery task is on a different process from the Django web container.
- Browsers reconnect; the Pub/Sub channel decouples producer from consumer.
- Lets multiple subscribers (multi-tab, future replay) attach to the same run.

### Implementation
- **Publisher** (`execution_engine/helpers/redis_pubsub.py::publish_workflow_log`): sync, lazy singleton Redis client, handles `rediss://` and strips `ssl_cert_reqs` from URL query.
- **Subscriber** (`subscribe_workflow_logs` async generator): polls `pubsub.get_message(timeout=1.0)`, yields parsed JSON `{event, data}`, stops on `done` event or 1800s deadline.
- **Django view** (`execution_engine/views_workflow.py::stream_workflow_run`) is a **native async** Django view (ASGI / Uvicorn). It auths via `sync_to_async` against the Clerk-set `request.user`, applies throttles, returns a `StreamingHttpResponse` with:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `X-Accel-Buffering: no`
- nginx side: `proxy_buffering off`, `proxy_read_timeout 3600s`, `proxy_http_version 1.1`, `Connection ""`.

### SSE event types
| Event | When | Notable fields |
|---|---|---|
| `status` | Run starts / finishes | `workflow_run_id`, `status`, `error_message` |
| `node_start` | A node begins | `node_id`, `node_label`, `node_type` |
| `node_complete` | A node ends | `node_id`, `status`, `exit_code`, `duration` |
| `log` | Generic line | `stdout` |
| `stdout` / `stderr` | Direct script output | `data` |
| `exit_code` | Script exit code | `node_id`, `exit_code` |
| `done` | Workflow finished | `workflow_run_id`, `status` |

### One-shot script execution (different path)
`/api/execution-engine/run/` does **not** use Redis Pub/Sub. Django streams the SSE response directly — `execution_engine/helpers/script_execution/executor.py::stream_execution` opens an `httpx.AsyncClient.stream()` to the exec-worker and transforms NDJSON chunks into SSE events inline. Used by the single-script "Run" feature in the Script Editor.

### Client-side SSE consumer
`client/src/pages/WorkflowExecution.tsx` uses `fetch()` + manual frame parsing (not `EventSource`) because it needs to send the `Authorization: Bearer` header — `EventSource` cannot set custom headers. It splits on `\n\n`, parses `event:` / `data:` lines, and updates per-node UI state.

---

## 8. Exec-Worker — The Execution Plane

FastAPI app on Cloud Run, autoscale 0→2 instances, 1 vCPU / 512 MiB, port 8020.

### 8.1 Endpoints

| Endpoint | Purpose | Auth |
|---|---|---|
| `POST /api/worker/execute` | Run script, stream NDJSON | `X-API-Key` + Cloud Run IAM (OIDC) |
| `POST /api/worker/execute/email` | Send email via SMTP, stream NDJSON | same |
| `POST /api/worker/stop/{execution_id}` | Set in-process asyncio.Event to terminate | same |
| `GET /api/health` | Liveness | rate-limited only |

### 8.2 NDJSON chunk shape

```json
{"type": "stdout",     "data": "<line>"}
{"type": "stderr",     "data": "<line>"}
{"type": "exit_code",  "data": 0}
{"type": "error",      "data": "<error message>"}
{"type": "log",        "data": "<info line>"}

# Email-specific:
{"type": "email_queued",  "data": "..."}
{"type": "email_sending", "data": "..."}
{"type": "email_sent",    "data": "..."}
{"type": "email_error",   "data": "..."}
```

### 8.3 Executors

| Class | Module | Target |
|---|---|---|
| `ShellExecutor` | `executors/shell_executor.py` | Linux via SSH (paramiko), password or SSH key auth |
| `PowerShellExecutor` | `executors/powershell_executor.py` | Windows via WinRM (pywinrm), NTLM/Basic/Kerberos |
| `EmailExecutor` | `executors/email_executor.py` | SMTP via aiosmtplib, Jinja-rendered HTML email |

Each exposes an `async stream()` generator that yields NDJSON chunks. Long-running script reads happen inside `run_in_executor` / `run_in_threadpool` so the event loop stays responsive.

### 8.4 Security hardening
- **SSRF defense** (`is_safe_host` in `main.py`): blocks `metadata.google.internal`, `169.254.169.254`, and in PROD any private/loopback address resolution. DEV permits internal hosts so local tests work.
- **Input sanitization**: bleach.clean(...) on string fields.
- **Rate limiting**: slowapi per-IP — `5/minute` on execute, `20/minute` on execute/email.
- **GCS auth**: ADC on Cloud Run (no key file); explicit service-account key file in DEV.

### 8.5 Calling convention from Django
`execution_engine/helpers/script_execution/worker.py::build_worker_headers()` builds:
- `X-API-Key: <WORKER_API_KEY>`
- `Content-Type: application/json`
- In PROD: `Authorization: Bearer <Google OIDC id_token>` with `audience = EXEC_WORKER_AUDIENCE` (= the Cloud Run service root URL). Token fetched via `google.oauth2.id_token.fetch_id_token` using ADC.

Cloud Run service is `--no-allow-unauthenticated`, so IAM rejects any caller without a valid OIDC token for that audience. `X-API-Key` is defense-in-depth on top of IAM.

---

## 9. Data Model (Supabase Postgres)

| Table | Module | Key fields |
|---|---|---|
| `workflows` | `workflows.Workflow` | `id (uuid)`, `user`, `name`, `nodes (JSON)`, `edges (JSON)` |
| `scripts` | `scripts.Script` | `id`, `owner`, `name`, `pathname`, `blob_url` (GCS), `file_size`, `version` |
| `vaults` | `vault.Vault` | `id`, `owner`, `name` |
| `credentials` | `vault.Credential` | `id`, `vault`, `credential_type`, `username`, `password` (Fernet), `ssh_key` (Fernet), `key_passphrase` (Fernet), `cert_pem` (Fernet) |
| `servers` | `vault.Server` | `id`, `vault`, `host`, `port`, `connection_method` (ssh/winrm) |
| `script_executions` | `execution_engine.ScriptExecution` | `id (uuid)`, `status`, `stdout_log_url`, `stderr_log_url`, `logs_url`, `exit_code`, `started_at`, `completed_at`, `duration` |
| `workflow_runs` | `execution_engine.WorkflowRun` | `id`, `workflow`, `user`, `status` (queued/running/success/failed/cancelled), `celery_task_id`, `inputs`, `send_email`, `notification_email`, `trigger_source` (manual/http/schedule), `trigger_node_id`, `started_at`, `finished_at` |
| `workflow_node_runs` | `execution_engine.WorkflowNodeRun` | `id`, `workflow_run`, `node_id`, `node_label`, `script_id`, `vault_id`, `server_id`, `credential_id`, `status`, `execution_order`, `stdout_log_url`, `stderr_log_url`, `logs_url`, `exit_code` |
| `http_triggers` | `triggers.HttpTrigger` | `id`, `workflow`, `user`, `node_id`, `trigger_token`, `secret_hash` (bcrypt), `secret_last4`, `is_active`, `last_triggered_at` |
| `http_trigger_idempotency_keys` | `triggers.HttpTriggerIdempotencyKey` | `id`, `trigger`, `key`, `workflow_run`, `created_at` — unique on (trigger, key) |
| `schedule_triggers` | `triggers.ScheduleTrigger` | `id`, `workflow`, `node_id`, `cron_expression`, `timezone`, `is_active`, `periodic_task_name` (link to Beat), `last_run`, `last_triggered_at`, `last_error` |
| `django_celery_beat_*` | (3rd party) | `PeriodicTask`, `CrontabSchedule` |

### Encryption at rest (Vault)
`vault.fields.EncryptedCharField` / `EncryptedTextField` use **Fernet** with a key derived via SHA-256 from `VAULT_ENCRYPTION_KEY`. Per-field encryption — only encrypted blobs hit Postgres.

### Run status state machine
```
WorkflowRun:        queued → running → (success | failed | cancelled)
WorkflowNodeRun:    pending → running → (success | failed | skipped | cancelled)
ScriptExecution:    pending → running → (completed | failed | cancelled)
```

---

## 10. Object Storage (GCS)

| Bucket | What goes there |
|---|---|
| `autosagex-drive` | Script bodies. Path pattern: `scripts/<user_id>/<script_id>/<filename>`. |
| `autosagex-logs` | Per-execution `stdout`, `stderr`, `logs.json` bundle. Path pattern: `executions/<user_id>/<run_id>/<node_id>/...` (for workflows) or `executions/<user_id>/<execution_id>/...` (for one-shot). |

**Rules:**
- Large content lives in GCS, never in DB rows. DB stores the URL only.
- All GCS reads/writes pass through `execution_engine/helpers/gcs.py` and `scripts/gcs.py` (centralised auth + URL building).
- Frontend never has direct GCS credentials — it reads logs via **signed URLs** generated server-side, returned by `/api/execution-engine/executions/all/`.

---

## 11. Authentication & Authorization

### 11.1 Clerk (identity)
- Frontend uses `@clerk/clerk-react`; sign-in/sign-up + JWT in `Authorization: Bearer`.
- `server/server/middleware.py::ClerkAuthMiddleware` verifies every incoming JWT against Clerk's JWKS (fetched once and cached in Django LocMemCache for 1 hour).
- On success, `update_or_create(User, username=<sub>)`, and `request.user` is set. CSRF is skipped because we never use session cookies for auth.
- DRF picks the user up via `server/server/authentication.py::MiddlewareAuthentication` (default permission: `IsAuthenticated`).

### 11.2 Authorization enforcement
- **Every** queryset on every protected view filters by `user=request.user` (or `owner=request.user` for scripts, `vault__owner=request.user` for credentials/servers).
- Cross-vault access is impossible because credentials/servers are always reached via `vault__owner=user`.
- Public endpoints (`HTTP trigger`, public polling) have their own auth model (`X-Trigger-Secret` + bcrypt hash). They never trust the URL alone.

### 11.3 Service-to-service auth (Django → exec-worker)
- `X-API-Key` header (defense-in-depth) AND
- Google OIDC ID token (Cloud Run IAM enforces).
- Audience = Cloud Run service root URL.

---

## 12. Rate Limiting

Centralised in `server/server/rate_limiters.py` and `settings.py::REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']`. UserRateThrottle subclasses, per-scope:

| Scope | Limit | Used on |
|---|---|---|
| `anon` | 100/day | unauth |
| `user` | 1000/day | auth default |
| `workflow_burst` / `_sustained` | 30/min, 500/day | workflow CRUD + runs |
| `workflow_create` | 5/min | workflow POST |
| `script_*` | same pattern | scripts |
| `vault_*` | same pattern | vault |
| `execution_burst` / `_sustained` | 30/min, 500/day | exec endpoints |
| `http_trigger` | 60/min | public webhooks — keyed by `trigger_token`, not user |

---

## 13. Production Deployment

### 13.1 Frontend — Firebase Hosting
- Built by GitHub Actions (`.github/workflows/firebase-hosting.yml`) on push to `client/**`.
- Node 20 → `npm ci` → write `.env.production` from `VITE_*` secrets → `vite build` → `firebase deploy`.
- Production channel on push to `main`; PR previews on pull requests (7-day TTL).
- Public URL: `https://autosagex.web.app`.

### 13.2 Control plane — OCI Ampere A1 (docker compose)
- Host: OCI Ampere A1 VM, Ubuntu 22.04 aarch64, 4 OCPU / 24 GB quota.
- Public DNS: `autosagex-api.duckdns.org` (DuckDNS A record → A1 public IP).
- TLS: real Let's Encrypt cert via certbot ACME http-01 + webroot. 90-day auto-renewal via cron.
- Five compose services on a single bridge network (`autosage-net`):

| Service | Image | Role |
|---|---|---|
| `nginx` | `nginx:1.27-alpine` | Publishes :80 and :443. TLS terminator, SSE-safe proxy, deferred DNS via `resolver 127.0.0.11` |
| `django` | `ghcr.io/<repo>/autosage-server:latest` (linux/arm64) | Uvicorn ASGI on :8000, **expose only — not host-mapped** |
| `celery` | same image, command `celery worker -Q celery` | concurrency 4, runs `execute_workflow` |
| `beat` | same image, command `celery beat` | DatabaseScheduler |
| `scheduler-worker` | same image, command `celery worker -Q scheduler` | concurrency 2, runs `fire_scheduled_workflow` |
| `certbot` | `certbot/certbot` (profile `tools`) | One-shot, not started by `up -d`; invoked for initial issuance + daily renewal cron |

Host bind mounts (all chmod 600 / read-only into containers):
- `server.env` → env_file for all four service containers
- `gcs_key.json` → `/app/creds/service-account.json:ro` (ADC source for both GCS and OIDC)
- `nginx/active.conf` → `/etc/nginx/conf.d/default.conf:ro`

Docker named volumes (managed by Docker, not host fs):
- `letsencrypt` → `/etc/letsencrypt` (cert + ACME account)
- `certbot-webroot` → `/var/www/certbot` (ACME challenge files)

### 13.3 Execution plane — Cloud Run
- Built by **Cloud Build** trigger on push to `exec-worker/**`. Filter is `exec-worker/**`.
- `docker build` → push to **Artifact Registry** (`execution-worker:$SHA`, `:latest`) → `gcloud run deploy execution-worker`.
- Service config: `--no-allow-unauthenticated`, `--cpu 1 --memory 512Mi`, `--max-instances 2 --min-instances 0`, `--port 8020`, `--service-account execution-worker-sa@<project>.iam.gserviceaccount.com`, `--set-secrets WORKER_API_KEY,ENVIRONMENT`.
- No GitHub Actions involvement for the worker.

### 13.4 CI/CD for the server (control plane)
GitHub Actions `.github/workflows/deploy-server.yml`, triggers on `server/**`, `nginx/**`, or the workflow file itself:

1. **build-and-push** job:
   - `actions/checkout`, `setup-qemu-action` (arm64), `setup-buildx-action`
   - `docker/build-push-action` with `context: ./server`, `platforms: linux/arm64`, GHA cache, push to GHCR.
2. **deploy** job (needs build-and-push):
   - Substitute `__DUCKDNS_DOMAIN__` placeholder into `nginx/autosage.conf` from the `DUCKDNS_DOMAIN` secret.
   - `scp` `docker-compose.oci.yml`, `nginx/autosage.conf`, `nginx/autosage-bootstrap.conf` to `~/autosage-server/` on the A1 VM.
   - SSH to the A1 VM and run: `docker login ghcr.io`, seed `active.conf` if missing, `docker compose pull`, `docker compose up -d --remove-orphans`, swap `active.conf` to the production conf if cert is present, `nginx -s reload`, `docker image prune -f`.
3. **health-check** job: `ssh + docker exec django` internal `/api/health/` + external `curl` against the DuckDNS hostname.

### 13.5 TLS bootstrap (one-time)
- Copy `autosage-bootstrap.conf` → `active.conf` (HTTP-only, serves only the ACME path).
- `docker compose up -d --no-deps nginx`.
- `docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d autosagex-api.duckdns.org`.
- Once cert is issued: copy `autosage.conf` → `active.conf`, `nginx -s reload`.
- Future renewals: daily cron at 03:17 UTC runs `docker compose run --rm certbot renew --quiet` then `docker compose exec -T nginx nginx -s reload`.

### 13.6 Required GitHub Secrets (names only)
| Secret | Used by |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Frontend deploy |
| `VITE_API_URL` | Frontend build (= DuckDNS URL) |
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend build |
| `GHCR_PAT` | Server build + deploy |
| `VM_HOST`, `VM_USER`, `VM_SSH_KEY`, `VM_SSH_PORT` | Server deploy + health check |
| `DUCKDNS_DOMAIN` | Server deploy nginx config sub |

**Never** commit any of these. Never log them. Never include in error messages.

---

## 14. API Surface (Django)

Root `urls.py`:
```
/admin/                                 Django admin
/api/health/                            Public liveness
/api/health/  (server-level)           service: main-server
/api/dashboard/                         GET — stats + recent items
/api/user/update/                       POST — sync Clerk profile

/api/workflows/                         CRUD (ListCreate + Detail)
/api/workflows/<id>/triggers/           Per-workflow triggers
/api/workflows/<id>/triggers/http/      POST create HTTP trigger
/api/workflows/<id>/triggers/http/<node_id>/             GET/DELETE
/api/workflows/<id>/triggers/http/<node_id>/regenerate/  POST rotate
/api/workflows/<id>/triggers/schedule/                   POST upsert cron
/api/workflows/<id>/triggers/schedule/<node_id>/         GET/DELETE

/api/triggers/                          Global list_all_triggers
/api/triggers/http/<id>/                manage_http_trigger
/api/triggers/schedule/<id>/            manage_schedule_trigger

/api/scripts/                           CRUD scripts
/api/scripts/<id>/                      GET / DELETE
/api/scripts/<id>/content/              GET content from GCS
/api/scripts/<id>/update/               POST overwrite content
/api/scripts/<id>/rename/               POST GCS copy + DB rename

/api/vault/                             Vault / Server / Credential CRUD

/api/execution-engine/run/                                POST single-script run (SSE direct)
/api/execution-engine/<uuid>/status/                      GET poll
/api/execution-engine/history/                            GET paginated history (scripts)
/api/execution-engine/executions/all/                     GET unified history (scripts + workflows)
/api/execution-engine/<uuid>/stop/                        POST stop
/api/execution-engine/health/                             GET (proxies to exec-worker)
/api/execution-engine/workflows/<id>/run/                 POST manual trigger
/api/execution-engine/workflows/runs/                     GET list runs
/api/execution-engine/workflows/runs/<run_id>/            GET run detail
/api/execution-engine/workflows/runs/<run_id>/nodes/      GET node runs
/api/execution-engine/workflows/runs/<run_id>/cancel/     POST cancel
/api/execution-engine/workflows/runs/<run_id>/stream/     GET SSE (async view)
/api/execution-engine/triggers/http/<token>/              POST public webhook
/api/execution-engine/triggers/http/<token>/runs/<id>/    GET public polling
```

### Response envelope
All non-streaming responses use `server/server/utils.py::api_response()`:

```json
{
  "success": true,
  "message": "Workflow execution queued successfully.",
  "data": { ... },
  "errors": null
}
```

DRF exceptions are reshaped by `server/server/exceptions.py::custom_exception_handler`:

```json
{
  "success": false,
  "status": "error",
  "status_code": 401,
  "message": "Authentication required. Please log in.",
  "data": null,
  "errors": { ...DRF detail... }
}
```

---

## 15. Frontend Conventions

- **Base URL**: `import.meta.env.VITE_API_URL`, fallback `http://localhost:8000`.
- **All API calls** flow through `client/src/lib/api-client.ts::apiRequest()`:
  - Adds `Authorization: Bearer <Clerk JWT>` (or raw if not JWT).
  - Sanitises JSON bodies via `sanitizers/`.
  - Dispatches `server-error` window event on 5xx → `/server-error` route.
  - Dispatches `limit-exceeded` window event on 429 → `/limit-exceeded` route.
- **SSE consumption**: `fetch()` + manual frame parsing (not `EventSource`) because `EventSource` cannot carry the Bearer token. Split on `\n\n`, parse `event:` and `data:` lines, JSON.parse the data.
- **Routing** is wrapped by `ProtectedRoute` / `PublicRoute` components; Clerk gates everything except `/`, `/signin`, `/signup`, `/sso-callback`, and the error routes.
- **State**: TanStack Query for data fetching; React Context for theme and loading.
- **UI**: Tailwind + Radix UI primitives. Workflow builder uses ReactFlow.

---

## 16. Autobot (Work In Progress)

Status: **scaffolding only**.

- `autobot/main.py` is a fresh FastAPI app with a single `GET /` returning `{"message": "Hello World"}`.
- The frontend already has the routes `/ai/autobot` and `/ai/autobot/:id`, the chat UI shell (`components/Chat/Interface.tsx`), share/customize/vault modals, and a left-nav entry. The chat UI currently renders a hard-coded `messages` array, and `ChatInput`'s `handleSubmit` is a no-op.
- No HTTP client to autobot exists yet on the frontend, and the autobot service has no business endpoints, models, auth, or DB integration.
- When wired up, autobot should follow the same conventions: **JWT verification** (Clerk JWKS), **per-user data isolation**, **GCS for any large artifacts**, **no execution work on the autobot host** (delegate to exec-worker if remote execution is needed).

---

## 17. Local Dev

| Component | Quick start |
|---|---|
| Frontend | `cd client && npm install && npm run dev` (Vite on 5173) |
| Django | `cd server && pip install -r requirements.txt && python manage.py migrate && python manage.py runserver` |
| Celery worker (default queue) | `cd server && celery -A server worker -Q celery -l info` |
| Celery worker (scheduler queue) | `cd server && celery -A server worker -Q scheduler -l info` |
| Celery beat | `cd server && celery -A server beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler` |
| Exec-worker | `cd exec-worker && pip install -r requirements.txt && uvicorn main:app --port 8020 --reload` |
| Autobot | `cd autobot && pip install -r requirements.txt && uvicorn main:app --port 8030 --reload` |
| Redis (local) | `docker run -p 6379:6379 redis:7` — set `CELERY_BROKER_URL=redis://localhost:6379/0` |

Use `docker-compose.env.example` as the template for required env var names (no values committed).

---

## 18. Build / Lint / Test

### 18.1 Frontend (`/client`)
- Install: `npm install`
- Build (prod): `npm run build` or `vite build`
- Build (dev): `npm run build:dev`
- Lint: `npm run lint` or `eslint .`

### 18.2 Python backends (`/server`, `/exec-worker`, `/autobot`)
- Install: `pip install -r requirements.txt`
- Lint: `flake8 .` or `ruff check .`
- Test: `pytest`
- Single test: `pytest <path/to/test_file.py::test_function_name>`

### 18.3 Legacy (`/server_v1`) — do not use for new work.

---

## 19. Code Style

### 19.1 Naming
- Variables / functions: `camelCase` (TS/JS), `snake_case` (Python)
- Classes / types: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`

### 19.2 Python
- Absolute imports.
- Standard library → third party → local, separated by blank lines.
- PEP 8, type hints, dataclasses for structured records.

### 19.3 Frontend
- Functional components + hooks only.
- TypeScript types/interfaces explicit on public props.
- Tailwind first; avoid inline styles.
- ESLint clean before commit.

### 19.4 Comments
- Explain **why**, not **what**.
- Note non-obvious invariants, security-relevant decisions, gotchas (Windows behavior, Upstash quirks, OIDC audience derivation, etc.).
- Keep them updated.

### 19.5 Commits
Follow the existing prefix convention seen in the log:
- `init:` first-time scaffolding of a new service
- `add:` net-new feature
- `fix:` bug fix
- `refactor:` no behavior change
- `chore:` infra/CI/build

---

## 20. Architectural Guard-Rails for Agents

Before making any change, answer:

1. **Which plane?** Is this control-plane (Django), execution-plane (exec-worker), or UI (client)?
2. **Will this introduce synchronous load on Django?** Long blocking work belongs in Celery or exec-worker, not in a request handler.
3. **Where should the data live?** Relational metadata → Supabase. Large blobs (scripts, logs, artifacts) → GCS, with the DB row holding only the URL.
4. **Does this preserve per-user authorization?** Every queryset must be scoped to `request.user`. Public endpoints must have their own non-Clerk auth.
5. **Does this preserve run-lifecycle observability?** Use the existing status fields (`status`, `started_at`, `finished_at`, `error_message`, `exit_code`, log URLs). Don't invent parallel status tracking.
6. **Does this leak secrets?** No password / API key / OIDC token / Fernet key / SSH key / SMTP password should ever land in logs, GCS, Supabase plaintext, or SSE frames. The Celery task already has `mask_passwords()`; reuse it.
7. **Is the trigger path going through `enqueue_workflow_run()`?** All three trigger sources must converge there.

### Do NOT
- Move long-running execution into a Django request handler.
- Store large artifacts directly in DB rows.
- Bypass `ClerkAuthMiddleware` / `MiddlewareAuthentication`.
- Skip the bcrypt secret verification on public webhooks.
- Skip the `Idempotency-Key` check on public webhooks.
- Add unauthenticated endpoints without explicit reason and matching throttle.
- Run scripts on the Django host. Ever.
- Block the exec-worker event loop with sync I/O — use `run_in_threadpool` / `run_in_executor`.
- Hard-code the DuckDNS hostname, Cloud Run URL, GCS bucket name, or Redis URL — these come from env vars.

### Do
- Add new run-types by extending the node type handler in `execution_engine/tasks.py` and the corresponding executor in `exec-worker/executors/`.
- Use the existing SSE channel for any new real-time event — extend the event-type vocabulary rather than opening a new pipe.
- Mask password parameters in any new code path that surfaces user output.
- Add an index on any new query column expected to be hot (see existing `models.Index` examples).
- Keep the OCI Django container slim. Prefer adding workers/queues over packing logic into the request path.

---

## 21. Diagrams

Source-of-truth diagrams live in:

- `architecture/architecture.md` — system-wide view, request flow, trigger sources, security boundaries.
- `architecture/client.architecture.md` — Firebase Hosting CI/CD + backend API contract.
- `architecture/server.architecture.md` — OCI A1 compose stack, CI/CD, TLS bootstrap, SSE flow through nginx.
- `architecture/worker.architecture.md` — Cloud Run service, Cloud Build, OIDC calling convention, IAM matrix.

When the architecture changes, update those mermaid diagrams **and** this file.

---

## 22. Quick Reference — Where to find things

| Task | File |
|---|---|
| Add an API endpoint | `server/<app>/urls.py` + `views.py` |
| Add a node type to the executor | `server/execution_engine/tasks.py::execute_workflow` |
| Add a new exec target | `exec-worker/executors/` + `build_executor()` in `main.py` |
| Add a Celery task | `server/<app>/tasks.py`, route via `CELERY_TASK_ROUTES` in `settings.py` |
| Add an SSE event type | publisher: `tasks.py::publish_workflow_log(...)`, consumer: `client/src/pages/WorkflowExecution.tsx::streamLogs` |
| Add a vault credential type | `vault/models.py::Credential.Type` + serializer + `save()` cleanup |
| Touch SSL / nginx | `nginx/autosage.conf` (prod), `nginx/autosage-bootstrap.conf` (cert issuance) |
| Touch compose | `docker-compose.oci.yml` (prod) — keep `expose:` on django, never `ports:` |
| Touch Beat schedule | `triggers/views.py::upsert_schedule_trigger` |
| Touch worker auth | `execution_engine/helpers/script_execution/worker.py::build_worker_headers` |
| Touch frontend SSE consumer | `client/src/pages/WorkflowExecution.tsx::streamLogs` |
| Touch frontend API client | `client/src/lib/api-client.ts` |

---

## 23. Cursor / Copilot Rules

No `.cursor/rules/` or `.github/copilot-instructions.md` files are present. **This document is the primary reference.** Add repo-local instructions in additional `AGENTS.md` files under specific subdirectories only if a sub-tree needs a different convention from the global one.
