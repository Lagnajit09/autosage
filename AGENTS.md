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

Plus the **Autobot service** at `autobot/` (FastAPI) — live on the same OCI A1 host as Django, routed by nginx at `/api/ai/*`. Chat surface (SSE streaming, tool-using script + workflow generation, conversation summarization, BYO LLM keys via `LLMConfig`, usage dashboard, archived chats) is shipped end-to-end. **Autobot v2 (Pillar B)** adds an execution copilot: execution mode (BYO-only), rich tabbed RunPanel (Graph + Logs), `run_workflow` / `run_script` / `rerun_workflow` tools, a failure-investigation loop, past-execution investigation tools, and a secure password side-channel for workflows that require run-time secrets. See Section 16 for the full Autobot reference.

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
    │   ├── run_builder.py        # enqueue_workflow_run() — all trigger sources converge here;
    │   │                         #   autobot trigger path drops password-typed inputs
    │   ├── notifications/
    │   └── script_execution/  # worker.py, executor.py, utils.py
    ├── templates/email/
    ├── views_workflow.py         # trigger_workflow_run (trigger_source="autobot" + Idempotency-Key),
    │                             #   rerun_workflow_run, create_run_intent, fulfill_run_intent
    ├── views_script.py           # run_script_async_view — fire-and-forget POST /run/async/
    ├── tasks.py        # Celery: execute_workflow
    └── models.py       # ScriptExecution, WorkflowRun, WorkflowNodeRun,
                        #   WorkflowRunIdempotencyKey, WorkflowRunIntent
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
│   ├── Autobot/Chat/       # Autobot chat UI + v2 execution panel
│   │   ├── Interface.tsx   # pendingSecret state; mounts SecretForm anchored at composer
│   │   ├── ChatInput.tsx   # SecretForm positioned bottom-full above input box
│   │   ├── ToolResultRenderer.tsx   # RunCard/PreviewCard/RunStatusInline/AwaitingSecretCard
│   │   └── run/            # v2 RunPanel module
│   │       ├── runStore.ts          # SSE/poll per run-id; useSyncExternalStore
│   │       ├── RunPanelProvider.tsx # drawer state + requestSecret/pendingSecret context
│   │       ├── RunGraph.tsx         # read-only ReactFlow status canvas (new)
│   │       ├── RunPanel.tsx         # drawer: workflow → Graph/Logs/Response; script → Logs/Details
│   │       ├── RunCard.tsx          # compact inline renderer + cancel
│   │       ├── RunFields.tsx        # ParamGrid + SecretField (enabled) + ParamInput
│   │       ├── SecretForm.tsx       # composer-anchored confirmation form; raw fetch to fulfill endpoint
│   │       ├── intents.ts           # fulfillRunIntent() — raw fetch, no sanitizeInput
│   │       └── runTypes.ts / runUi.tsx
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

Autosage supports four trigger sources. **All four converge on a single helper, `execution_engine/helpers/run_builder.py::enqueue_workflow_run()`** — the only place that validates the DAG, validates bindings, masks secrets, persists `WorkflowRun` + `WorkflowNodeRun` rows, and dispatches the Celery task. When `trigger_source == "autobot"`, the helper additionally drops any password-typed inputs before passing them to the worker (Layer-3 backstop of the password safety guarantee).

### 5.1 Manual trigger (UI) and Autobot trigger
- `POST /api/execution-engine/workflows/<id>/run/`
- Requires Clerk JWT.
- Body: `{ inputs, send_email, user_email }`. Optional `Idempotency-Key` header (required by the Autobot path, optional for the builder).
- `trigger_source` body field: `"manual"` (default, builder Run button) or `"autobot"` (Autobot tools). A forged `"http"` / `"schedule"` value returns 400.
- Returns **202** with `{ workflow_run_id, status: "queued" }` (or `{ idempotent: true }` on a replay). Returns immediately — does not wait for execution.
- **Dedup guard**: optional `Idempotency-Key` header is backed by `WorkflowRunIdempotencyKey` DB table (`unique(user, workflow, key)`). A duplicate key returns the original run id with `200 + idempotent: true`. Race-safe via `IntegrityError` catch — mirrors the HTTP-trigger dedup pattern but keyed on `(user, workflow)` rather than a trigger row.

### 5.1b Autobot secure side-channel
Used when a workflow has a `password`-typed parameter with no baked-in value; the secret travels **browser → Django directly**, never through Autobot.
- `POST /api/execution-engine/workflows/<id>/run/intent/` — Autobot creates a `WorkflowRunIntent` (no `WorkflowRun` yet). Strips password inputs; returns `{ run_intent_id, needs_params }`. TTL 5 min, single-use.
- `POST /api/execution-engine/workflows/runs/intents/<run_intent_id>/fulfill/` — browser posts the full confirmed params (including secrets) directly. Merges intent inputs + browser params, calls `enqueue_workflow_run(..., trigger_source="manual")` so the Layer-3 drop does NOT fire (secret came from the user, not the model). Marks intent fulfilled. Returns `{ workflow_run_id, status }`.

### 5.1c Script async trigger
- `POST /api/execution-engine/run/async/` — fire-and-forget async script run for the Autobot path. Returns `202 { execution_id, status: "pending" }`. A Celery task drains the stream and discards SSE frames; no live token streaming for chat-initiated scripts.

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
| `workflow_runs` | `execution_engine.WorkflowRun` | `id`, `workflow`, `user`, `status` (queued/running/success/failed/cancelled), `celery_task_id`, `inputs`, `send_email`, `notification_email`, `trigger_source` (**manual/http/schedule/autobot**), `trigger_node_id`, `started_at`, `finished_at` |
| `workflow_node_runs` | `execution_engine.WorkflowNodeRun` | `id`, `workflow_run`, `node_id`, `node_label`, `script_id`, `vault_id`, `server_id`, `credential_id`, `status`, `execution_order`, `stdout_log_url`, `stderr_log_url`, `logs_url`, `exit_code` |
| `http_triggers` | `triggers.HttpTrigger` | `id`, `workflow`, `user`, `node_id`, `trigger_token`, `secret_hash` (bcrypt), `secret_last4`, `is_active`, `last_triggered_at` |
| `http_trigger_idempotency_keys` | `triggers.HttpTriggerIdempotencyKey` | `id`, `trigger`, `key`, `workflow_run`, `created_at` — unique on (trigger, key) |
| `schedule_triggers` | `triggers.ScheduleTrigger` | `id`, `workflow`, `node_id`, `cron_expression`, `timezone`, `is_active`, `periodic_task_name` (link to Beat), `last_run`, `last_triggered_at`, `last_error` |
| `workflow_run_idempotency_keys` | `execution_engine.WorkflowRunIdempotencyKey` | `id (uuid)`, `user`, `workflow`, `key`, `workflow_run`, `created_at` — `unique(user, workflow, key)`; guards manual + autobot paths against duplicate runs |
| `workflow_run_intents` | `execution_engine.WorkflowRunIntent` | `id (uuid)`, `user`, `workflow`, `inputs (JSON — non-secret)`, `send_email`, `notification_email`, `created_at`, `fulfilled_at`, `expires_at` — single-use, 5-min TTL; the secure side-channel "prepared but not yet enqueued" run |
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
/api/execution-engine/run/async/                          POST fire-and-forget async script run (Autobot path)
/api/execution-engine/<uuid>/status/                      GET poll
/api/execution-engine/history/                            GET paginated history (scripts)
/api/execution-engine/executions/all/                     GET unified history (scripts + workflows, tag filter + pagination)
/api/execution-engine/<uuid>/stop/                        POST stop
/api/execution-engine/health/                             GET (proxies to exec-worker)
/api/execution-engine/workflows/<id>/run/                 POST manual/autobot trigger (trigger_source + Idempotency-Key)
/api/execution-engine/workflows/<id>/run/intent/          POST create run intent for secure side-channel
/api/execution-engine/workflows/runs/                     GET list runs
/api/execution-engine/workflows/runs/<run_id>/            GET run detail
/api/execution-engine/workflows/runs/<run_id>/nodes/      GET node runs
/api/execution-engine/workflows/runs/<run_id>/cancel/     POST cancel
/api/execution-engine/workflows/runs/<run_id>/rerun/      POST whole-workflow rerun
/api/execution-engine/workflows/runs/<run_id>/stream/     GET SSE (async view — reused by Autobot RunPanel)
/api/execution-engine/workflows/runs/intents/<id>/fulfill/ POST fulfill run intent with secrets (browser→Django)
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

## 16. Autobot (Live Service)

Status: **shipped — v1 (Phases 1–5) + v2 Pillar B**. Autobot is a live FastAPI service on the same OCI A1 host as Django, routed by nginx at `/api/ai/*`. v1 shipped: chat + script/workflow CRUD tool calls, conversation summarization, BYO LLM keys, usage dashboard, archived chats. v2 Pillar B shipped: execution copilot (run/rerun/investigate/fix), rich tabbed RunPanel (Graph + Logs), failure-investigation loop, and the secure password side-channel. Cloud-infra tools remain out of scope (→ v3).

### 16.1 Service topology

```
Browser ──HTTPS──▶ nginx ──HTTP──▶ autobot (FastAPI, :8030)
                       │                │
                       │                ├─▶ Clerk JWKS  (JWT verify, 1h LocMem cache)
                       │                ├─▶ django:8000  (/api/autobot/*, /api/scripts/, /api/workflows/,
                       │                │                 /api/vault/* metadata, /api/execution-engine/*)
                       │                ├─▶ redis:6379/2  (hot ctx, TTL 7200s; admin-quota counter;
                       │                │                  exec-quota autobot:exec_quota:<sub>:<yyyymmdd>)
                       │                └─▶ litellm  (Gemini / Groq / OpenRouter; or BYO LLMConfig)
                       │
                       ├──▶ autobot :8030  (/api/ai/* — Autobot chat + execution copilot)
                       │
                       └──▶ django:8000  (everything else)

RunPanel SSE (v2):
Browser ──HTTPS──▶ nginx ──HTTP──▶ django:8000
                                       └─▶ GET /api/execution-engine/workflows/runs/<id>/stream/
                                           (the pre-existing workflow-run SSE — reused directly by the
                                            RunPanel, independent of the chat SSE stream)
```

Key invariants:
- nginx **strips the `/api/ai/` prefix** before forwarding, so FastAPI routes are bare (`/health/`, `/threads/`, `/chat/messages/stream/`). `X-Forwarded-Prefix: /api/ai` tells autobot what prefix it's mounted under for self-URL building. `app = FastAPI(root_path="/api/ai", ...)` in `autobot/main.py`.
- Autobot **never writes directly to Postgres**. All persistence flows through Django's `/api/autobot/*` REST surface with the **user's Clerk JWT forwarded** as Bearer — Django remains the single source of truth for per-user authorization. Per memory `[[project_autobot_persistence_model]]`.
- Autobot uses **Redis DB `/2`** (`redis://redis:6379/2`); Celery is on `/0`. Volatile-lru eviction on a 1 GB cap means autobot's TTL'd keys can pressure-eject each other but Celery's untimed queue items are never evictable. See the Redis comment block in `docker-compose.oci.yml`.

### 16.2 Repo layout

```
autobot/
├── Dockerfile               # arm64-compatible, slim Python 3.12, non-root, uvicorn --workers 2
├── requirements.txt
├── main.py                  # FastAPI app + CORS + lifespan + /health/ + /whoami/
├── settings.py              # pydantic-settings env loader; AUTOBOT_EXEC_DAILY_LIMIT
├── auth.py                  # Clerk JWKS verify dependency + log-redaction filter
├── throttling.py            # slowapi limiter keyed on user_sub (falls back to remote_addr)
├── conversation/
│   ├── cache.py             # aioredis client on DB /2; admin-quota helpers;
│   │                        #   incr_exec_quota_for_today / get_exec_quota_for_today
│   ├── persistence.py       # httpx client wrapping Django /api/autobot/*
│   └── summarizer.py        # tiktoken counts, pre-compaction, summarization
├── llm/
│   ├── client.py            # LiteLLM wrapper; LLMError(retryable); admin chain + BYO resolution
│   ├── tools.py             # JSON-Schema tool registry + dispatcher (timeout + error normalization);
│   │                        #   ToolContext{user_sub, tool_call_id} ContextVar
│   └── prompts.py           # system prompt; _MODE_ALLOWED_TOOLS / get_mode_allowed_tools;
│                            #   rewritten execution/generation/research prompts + §0b + §12b
├── streaming/
│   └── sse.py               # event:/data: SSE frame formatting
├── routers/
│   ├── proxy.py             # thread / settings / llm-config CRUD passthroughs to Django
│   ├── chat.py              # POST /chat/messages/stream/; _effective_allowed_tools;
│   │                        #   _WRITE_TOOL_NAMES; _execution_mode_blocked
│   └── analytics.py         # GET /dashboard/ (Django aggregation + Redis quota merge)
└── tools/                   # side-effect imports register into llm/tools.py registry
    ├── scripts.py           # list/read/create/update script
    ├── workflows.py         # list/read/create/update workflow; read_workflow masks password params
    ├── vault.py             # list_vault_resources (metadata only, never returns secrets)
    ├── execution.py         # v2 execution copilot tools:
    │                        #   get_execution_histories, get_workflow_run, get_script_run,
    │                        #   read_run_logs, preview_workflow_run, run_workflow,
    │                        #   run_script, rerun_workflow
    └── _security.py         # mask_password_params() + mask_inputs_by_keyname()
```

### 16.3 Endpoint surface

All routes are auth-required via `Depends(require_auth)` except `/health/`. Throttles applied via `app.state.limiter` (slowapi, keyed on `user_sub`).

| Method | Path (external) | Purpose |
|---|---|---|
| GET | `/api/ai/health/` | Public liveness — service, version, uptime. **No auth.** |
| GET | `/api/ai/whoami/` | Authenticated canary — returns `user_sub`. |
| GET/POST | `/api/ai/threads/` | List user threads / create thread (proxy to Django). |
| GET/PATCH/DELETE | `/api/ai/threads/<id>/` | Thread detail / rename + archive / delete. |
| GET | `/api/ai/threads/<id>/messages/` | Paginated message history (proxy — used by SPA on thread-open). |
| POST | `/api/ai/chat/messages/stream/` | **The chat endpoint.** SSE response, emits `token`, `tool_call_start`, `tool_result`, `done`, `error`. Execution mode requires BYO key. |
| POST | `/api/ai/threads/<id>/token-refresh/` | Mid-stream Clerk JWT refresh; remaps Bearer for in-flight tool dispatch. |
| GET/PATCH | `/api/ai/settings/` | User-level autobot settings (default LLM config, tone, etc.). |
| GET/POST | `/api/ai/llm-configs/` | List / create user BYO LLM configs (api key write-only). |
| GET/PATCH/DELETE | `/api/ai/llm-configs/<id>/` | BYO LLM config detail. |
| GET | `/api/ai/dashboard/` | Today / Last 7d / All-time usage buckets + Redis admin-quota counter. |

The `root_path="/api/ai"` setting on the FastAPI app means **internally** these are `/health/`, `/threads/`, etc. — nginx strips the prefix on the way in.

### 16.4 Auth + JWT forwarding

`autobot/auth.py::require_auth`:
- Verifies the incoming Clerk JWT against JWKS (RS256, in-process 1 h LocMem-style cache).
- Returns an `AuthContext(user_sub, raw_jwt)`.
- The **raw JWT is forwarded** to every Django call (`httpx.AsyncClient` with `Authorization: Bearer <raw_jwt>`). Autobot itself never elevates privileges — every Django request runs under the **user's own** identity, so per-user query scoping in Django enforces tenant isolation automatically. No second `IsInternalCaller` permission was added; Django treats autobot as just another Clerk-authed client.
- `install_log_redaction()` installs a `logging.Filter` that strips any `Authorization:` substring before formatter emit. Applied in both `lifespan` startup and `basicConfig` time to cover early-startup logs. `httpx` logger is bumped to WARNING because it echoes headers on errors.

### 16.5 Chat flow (`routers/chat.py`)

1. Verify JWT → `auth.user_sub` + `raw_jwt`.
2. POST the user message to Django (`/api/autobot/threads/<id>/messages/`). This **also serves as the authorization check** — Django's `_get_thread_or_404` 404s on a thread the caller doesn't own, no separate pre-fetch needed.
3. `asyncio.gather(get_thread, get_history)` — parallel round-trip. Thread payload carries `system_prompt_override` + optional `llm_config_id`. History page size = 20.
4. Hydrate hot context from Redis (`autobot:thread:<id>:ctx`); on miss, build from the history just fetched + latest Summary row.
5. **Pre-compaction** of any `tool` messages > 2 KB to one-line digests in-context (raw payloads stay in Postgres). Defers summarization 5–10 turns.
6. Tiktoken count. If `tokens > AUTOBOT_CONTEXT_TARGET_RATIO × context_window`, run `conversation/summarizer.py` to collapse all-but-the-last-N messages into a `system`-role summary, persist a `Summary` row via Django, replace those messages in-context.
7. Resolve the LLM client (`llm/client.py::resolve_for_thread`) — returns a list:
   - If `UserSettings.default_llm_config_id` or `Thread.llm_config_id` is set → BYO: `POST /api/autobot/llm-configs/<id>/reveal/` once per request to get the plaintext api key, never cache it.
   - Else → admin chain: `[primary, *AUTOBOT_ADMIN_FALLBACKS]`. `LLMResolution.is_admin = True` enables the per-user daily quota.
8. **Round-1 fallback**: try each `LLMResolution` in order on retryable errors (`RateLimitError`, `ServiceUnavailableError`, `Timeout`, `APIConnectionError`). Once any `event: token` has been written to the client, fallback is **suppressed** — mid-turn provider swaps would interleave deltas.
9. **OpenRouter cascade**: when `resolution.provider == "openrouter"` and `OPENROUTER_FALLBACK_MODELS` is set, inject `extra_body={"models": [...], "route": "fallback"}` so OpenRouter tries multiple free models server-side in one round-trip.
10. Stream deltas as `event: token`. On `tool_call`, emit `event: tool_call_start`, dispatch via `llm/tools.py::dispatch` (timeout, error normalization to `{"error": "..."}`), emit `event: tool_result`, append the tool message to context, loop. Hard cap `AUTOBOT_MAX_TOOL_ROUNDS=10`.
11. On final assistant message: persist via Django with `prompt_tokens / completion_tokens / total_tokens / provider / model_name / is_byo`, refresh Redis cache + TTL, emit `event: done`. After any **write tool**, invalidate `autobot:thread:<id>:ctx`.

### 16.6 Tools (v1 + v2)

JSON-Schema definitions in `autobot/llm/tools.py`; implementations in `autobot/tools/*.py` (side-effect imports register into the global registry via `import tools as _tools` in `main.py`).

**Mode floors** (`_MODE_ALLOWED_TOOLS` in `prompts.py`, intersected with `_PANEL_ALLOWED_TOOLS` in `chat.py`):
- `research` — read tools only (incl. investigation tools).
- `generation` — read + write tools (no execution).
- `execution` — read + write + exec tools. **BYO-only** (shared-key turns refused upfront).

| Tool | Module | Mode floor | Calls Django at | Notes |
|---|---|---|---|---|
| `list_scripts`, `read_script`, `create_script`, `update_script` | `tools/scripts.py` | read / write | `/api/scripts/*` | Same surface the SPA Script Editor uses. |
| `list_workflows`, `read_workflow`, `create_workflow`, `update_workflow` | `tools/workflows.py` | read / write | `/api/workflows/*` | `read_workflow` masks `password`-typed param values before the JSON reaches the model. |
| `list_vault_resources` | `tools/vault.py` | read | `/api/vault/*` | **Metadata only** — ids/names, never secret values. |
| `get_execution_histories` | `tools/execution.py` | read | `/api/execution-engine/executions/all/` | Paginated unified history; strips signed URLs. |
| `get_workflow_run` | `tools/execution.py` | read | `/api/execution-engine/workflows/runs/<id>/` + `/nodes/` | Merged run + nodes; used by investigation loop. |
| `get_script_run` | `tools/execution.py` | read | `/api/execution-engine/<id>/status/` | Script run status. |
| `read_run_logs` | `tools/execution.py` | read | signed GCS URLs (fetched server-side) | Fetches GCS log text, returns tailed stderr/stdout; signed URL never reaches model. |
| `preview_workflow_run` | `tools/execution.py` | exec | `/api/workflows/<id>/` | Side-effect-free preview; returns `needs_params`, masks password values, flags unresolvable secrets. |
| `run_workflow` | `tools/execution.py` | exec | `/api/execution-engine/workflows/<id>/run/` or `/run/intent/` | Ticks exec quota; sends `trigger_source="autobot"` + `Idempotency-Key`; drops password inputs; returns `{run_id, kind:"workflow", watch_url}` or `{status:"awaiting_secret", run_intent_id}` for param workflows. |
| `run_script` | `tools/execution.py` | exec | `/api/execution-engine/run/async/` | Ticks exec quota; nested body with script/vault/server/credential ids; masks secret-looking input keys by name heuristic. |
| `rerun_workflow` | `tools/execution.py` | exec | `/api/execution-engine/workflows/runs/<id>/rerun/` | Ticks exec quota; `Idempotency-Key`; optional inputs override. |

Each tool wrapper:
1. Validates inputs against its JSON Schema (LiteLLM also enforces — belt-and-braces).
2. Calls Django with the **forwarded user JWT**.
3. Catches non-2xx → `{"error": "<flattened field msg>"}` so the LLM can self-correct on the next round.
4. Per-tool timeout: 30s for read tools; **600s for run tools** (`run_workflow`, `run_script`, `rerun_workflow`).

### 16.7 Admin pool resilience

Two-tier fallback:

**Tier 1 — inside OpenRouter (free):** `OPENROUTER_FALLBACK_MODELS` (comma-sep ids like `google/gemini-2.0-flash-exp:free,meta-llama/llama-3.3-70b-instruct:free`). OpenRouter tries the listed free models server-side in a single request. Only include tool-capable models — non-tool models silently fail tool-using turns.

**Tier 2 — autobot's own chain:** `AUTOBOT_ADMIN_FALLBACKS` (comma-sep `provider/model`). If OpenRouter (or whichever primary) errors retryably, autobot moves to the next provider — round-1 only, before any tokens are streamed. BYO requests never fall back; the user's choice is final.

**Per-user daily quota:** `AUTOBOT_ADMIN_DAILY_LIMIT` (default 30) tracked in Redis at `autobot:admin_quota:<user_sub>:<yyyymmdd>` with 26-hour TTL (DST + skew margin). Counter ticks **once per chat turn**, not per tool-call round. BYO turns don't tick. At cap, the streaming endpoint emits `event: error code=admin_quota_exhausted` pointing at the Customize modal. Redis errors **fail-open** — better to let chat through than block everyone if Redis is down; slowapi still caps request volume.

### 16.8 Persistence model — Django owns the schema

The `server/autobot_api/` Django app owns all autobot tables. Models:

| Model | Notes |
|---|---|
| `LLMConfig` | User BYO config. Structured fields (`provider`, `model_name`, `api_version`, `base_url`, `system_instruction`) + Fernet-encrypted `api_key` via `vault.fields.EncryptedCharField`. **NOT in Vault** — Vault is for workflow-target auth material; LLMConfig is dedicated to the chat brain. `is_default` validated max-one-per-user. Reveal endpoint mirrors the Vault `/reveal/` pattern. |
| `Thread` | `user`, `title`, `model_slug`, `system_prompt_override` (APPENDS to base prompt under a `## User customizations` heading — never replaces; losing the Autosage grounding would let the LLM hallucinate), `llm_config_id (FK NULL)`, `is_archived`, `last_message_at`. |
| `Message` | `thread`, `role (user|assistant|system|tool)`, `content`, `content_type` (MIME — `text/plain` default for user, `text/markdown` for assistant), `prompt_tokens`, `completion_tokens`, `total_tokens`, `provider`, `model_name`, `is_byo`, `tool_calls (JSON)`, `tool_call_id`. |
| `Summary` | `thread`, `up_to_message`, `summary_text`, `summary_tokens`. |
| `UserSettings` | `user (OneToOne)`, `default_llm_config_id (FK NULL → LLMConfig)`, `tone`, `expertise`, `language`, `custom_instructions`. Same APPENDS rule as `system_prompt_override`. |

REST surface mounted at `path('api/autobot/', include('autobot_api.urls'))`. All endpoints use `ClerkAuthMiddleware` + `MiddlewareAuthentication` + `IsAuthenticated`; querysets filter by `user=request.user`. Throttle scopes added to `server/server/rate_limiters.py`: `autobot_burst` (30/min), `autobot_sustained` (500/day), `autobot_message_create` (60/min).

### 16.9 Frontend surface (`client/`)

- `client/src/lib/api/autobot.ts` — thread / settings / llm-config / dashboard helpers + `streamMessage()` (manual fetch + SSE frame parsing, mirrors `WorkflowExecution::streamLogs` — `EventSource` can't carry the Bearer token).
- Routes (in `App.tsx`, all under `<ProtectedRoute>`):
  - `/ai/autobot` → thread list landing
  - `/ai/autobot/:id` → chat surface (`Chat/Interface.tsx` + `Chat/ChatInput.tsx`)
  - `/ai/autobot/dashboard` → analytics page (Today / Last 7d / All-time + quota + model-usage chart via recharts)
  - `/ai/autobot/archived` → archived chats list (intentionally **NOT** in LeftNav; reached via "View archived chats" button on the dashboard)
- LeftNav has two entries: "Autobot" (chat) and "Autobot Dashboard" (analytics).
- `Chat/History.tsx` row menu: **active threads** → Rename / Archive / Delete; **archived threads** → Unarchive / Delete. Archived threads render a read-only banner with an inline Unarchive button and a disabled `ChatInput`.
- `Dashboard/Banners.tsx::AutobotTodayCard` — compact quota tile on the main Autosage Dashboard. `AutobotBanner` (older invite card) is intentionally retained alongside it.
- AI generator modals (`AIScriptGenerator.tsx`, `workflow/AIWorkflowGenerator.tsx`) now open a pre-filled Autobot thread with the relevant tool restricted, instead of hitting the dead `localhost:3001` legacy backend.

### 16.10 CI/CD & deployment

- `.github/workflows/deploy-autobot.yml` mirrors `deploy-server.yml`. Path filter: `autobot/**` and the workflow file itself. arm64 buildx → `ghcr.io/lagnajit09/autosage/autosage-autobot:latest`. Deploy is **surgical**: `docker compose pull autobot && docker compose up -d --no-deps autobot` — never touches nginx / django / celery.
- Compose service `autobot` lives in `docker-compose.oci.yml` alongside django. Healthcheck hits `/health/` (the bare `/` 404s — FastAPI doesn't auto-mount a root route).
- Host bind mount: `/home/ubuntu/autosage-server/autobot.env` (chmod 600). Required keys documented in `autobot.env.example`.
- First-time bootstrap: manually trigger `deploy-autobot.yml` via `workflow_dispatch` to seed the GHCR image **before** any `docker-compose.oci.yml` change that requires `docker compose pull` to succeed on the autobot service.
- `ALLOWED_HOSTS` on Django **must include `django`** — autobot calls `http://django:8000/...` and Django checks the `Host` header. CORS does not need an autobot entry (server-to-server httpx calls carry no `Origin`).

### 16.11 Execution copilot (v2 Pillar B)

**Gating:** Execution tools (`preview_workflow_run`, `run_workflow`, `run_script`, `rerun_workflow`) are in `_EXEC_TOOLS` and only advertised + dispatched in `execution` mode. `execution` mode is BYO-only (`_execution_mode_blocked` in `chat.py`). Mode floor is enforced at BOTH advertise (`get_tool_schemas`) and dispatch (`dispatch_tool`) — double lock.

**Quota:** `AUTOBOT_EXEC_DAILY_LIMIT` (per-user, per-day) tracked in Redis at `autobot:exec_quota:<sub>:<yyyymmdd>` (26h TTL, fail-open). Separate from the LLM admin quota so BYO users (uncapped LLM) are still bounded on real compute.

**Password safety — 4 layers:**
1. **L1 (tool boundary):** `read_workflow` + `preview_workflow_run` replace any `type=="password"` param `value` with `"*****"` before JSON reaches the model. Implemented in `tools/_security.py::mask_password_params`.
2. **L2 (tool boundary):** `run_workflow` / `rerun_workflow` drop any input key that maps to a `password`-typed param before POSTing.
3. **L3 (Django server):** `enqueue_workflow_run` drops password-typed inputs when `trigger_source=="autobot"`. Hard backstop; fires even if L1/L2 are bypassed.
4. **L4 (product):** Workflows needing a run-time password use the secure side-channel — the secret travels browser→Django directly (never through Autobot).

**RunPanel:** When a `tool_result` carries `{run_id, kind}`, `ToolResultRenderer.tsx` renders a `RunCard` that expands into a right-drawer `RunPanel`. The panel opens its **own** SSE connection to the pre-existing `/runs/<id>/stream/` endpoint (independent of the chat SSE). Workflow runs get Graph + Logs + Response tabs; script runs get Logs + Details. History rehydration is supported (past run messages re-render as RunCards).

**Investigation loop:** Post-run, the execution prompt directs the model to: call `get_workflow_run` (which node failed, exit code) → `read_run_logs` (GCS stderr/stdout text, fetched server-side) → diagnose → propose ONE fix → `update_script`/`update_workflow` → `rerun_workflow` ONCE → ask if still failing.

**Dedup:** `run_workflow` and `rerun_workflow` always send an `Idempotency-Key` header (= per-tool-call id). A duplicate call returns the original run id (`idempotent: true`) instead of launching a second run.

### 16.11b Secure password side-channel

Flow for a workflow that needs a run-time password:
1. `preview_workflow_run` returns `needs_params: [{param_id, name, type, has_default, is_secret, source}]`.
2. `run_workflow` detects password params without baked-in values → calls `POST /run/intent/` → returns `{status:"awaiting_secret", run_intent_id, needs_params}`. No `WorkflowRun` yet.
3. `ToolResultRenderer` renders an `AwaitingSecretCard`; `Interface.tsx` captures `pendingSecret` state and mounts `<SecretForm>` anchored above the chat input (`bottom-full`).
4. User fills ALL params (password rendered as `<input type=password>`, node-references as read-only chips, others as editable inputs). On submit, `SecretForm` POSTs `{ params: { param_id: value } }` directly to `/runs/intents/<id>/fulfill/` using a **raw `fetch`** (NOT `apiRequest` — `sanitizeInput` must not run on the password body).
5. Django `fulfill` endpoint merges intent inputs + browser params, calls `enqueue_workflow_run(..., trigger_source="manual")` — L3 drop does NOT fire (secret came from the user). Password is masked on the persisted row and in logs (same as a builder run).
6. `SecretForm.onSubmitted` opens the RunPanel drawer watching the new run. Autobot never sees the value; it polls by `run_id` only.

**Invariant:** secret travels **browser → Django over TLS**, never browser → Autobot → Django.

### 16.13 Architectural rules for autobot changes

When touching autobot code, preserve:

1. **JWT forwarding everywhere.** Every Django call must carry the user's raw Bearer. No service-account elevation, no `IsInternalCaller` bypass.
2. **Django is the single source of truth.** Don't add an autobot-side cache that becomes authoritative. Redis on `/2` is hot context only — Postgres is the system of record.
3. **Tool error contract.** A tool that fails returns `{"error": "..."}` so the LLM can self-correct. Don't raise exceptions across the dispatcher boundary — they end the turn.
4. **Cap tool rounds and per-turn quota.** Don't bypass `AUTOBOT_MAX_TOOL_ROUNDS` or the admin quota. Both exist to bound the worst-case cost of a single user turn.
5. **Never log Authorization values.** Use `install_log_redaction()` — don't add a new logger that bypasses the filter. Don't `print()` request headers.
6. **Never inline vault secrets into prompts.** The LLM references vault resources by **id** only; `list_vault_resources` returns metadata.
7. **SSE event vocabulary is fixed.** Reuse `token` / `tool_call_start` / `tool_result` / `done` / `error`. New event types require a coordinated client+server change.
8. **`/api/ai/` prefix stripping is in nginx.** Don't bake the prefix into application URLs. `X-Forwarded-Prefix` tells autobot what it's mounted under for self-URL building.

### Do NOT
- Add a route that bypasses `Depends(require_auth)` (other than `/health/`).
- Write directly to Postgres from autobot. Go through Django.
- Cache plaintext BYO api keys beyond the request lifecycle.
- Mix autobot keys onto Redis DB `/0` — that's Celery's namespace.
- Add execution tools outside the `_EXEC_TOOLS` floor or advertise them in non-execution modes.
- Allow execution mode for shared/admin-key users — the BYO gate is enforced in `chat.py::_execution_mode_blocked` and must not be bypassed.
- Let a password value reach the model — `mask_password_params()` in L1, input drop in L2, and Django drop in L3 are all required.
- Change the `is_byo` flag's meaning — the dashboard depends on it to split admin vs BYO tokens after the fact (provider names overlap).

### Do
- Add new tools by creating a module under `autobot/tools/`, registering via `tool_registry.register(...)`, and importing it (side-effect) in `tools/__init__.py`.
- Use the existing JSON-Schema validation + 30 s default timeout in `ToolDefinition`.
- Extend the system prompt in `llm/prompts.py` (not inline in `routers/chat.py`).
- For new providers, prefer LiteLLM's existing wrappers over a custom client. If a provider exposes server-side fallback (like OpenRouter), use it before falling back at the autobot layer.

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
