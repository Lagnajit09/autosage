# Autosage Django Server — Deployment Architecture v3

**Host**: OCI Ampere A1 (Ubuntu 22.04 aarch64) · **Public name**: `autosagex-api.duckdns.org` · **Repo path**: `server/**` + `autobot/**` + `nginx/**` + `docker-compose.oci.yml`

> **What changed since v2**: Two new capability pillars, all on the same OCI host — no new VMs or cloud services.
>
> **Pillar A (Docs RAG)**: `DocChunk` model + pgvector extension in Supabase; `fastembed` (BAAI/bge-base-en-v1.5, 768-dim) baked into the Django image as a lazy singleton; `POST /api/autobot/docs/search/` gated by `X-Internal-Secret`; Autobot gains `search_docs` tool + `POST /api/ai/docs/chat/stream/` (public, no auth, IP-throttled).
>
> **Pillar B (Execution Copilot)**: `WorkflowRunIntent` model + `POST /api/execution-engine/workflows/<id>/run/intent/` + `POST /api/execution-engine/workflows/runs/intents/<id>/fulfill/`; `POST /api/execution-engine/run/async/` for fire-and-forget script runs; Autobot gains four execution tools and three investigation tools; execution mode is BYO-key only (refused upfront for admin/shared keys).
>
> v2 doc archived at [../v2/server.architecture.md](../v2/server.architecture.md).

---

## Architecture overview

```mermaid
flowchart TD
    classDef external fill:#f6f8fa,stroke:#d1d5da,color:#000
    classDef proxy   fill:#fce4ec,stroke:#c2185b,color:#880e4f
    classDef django  fill:#bbdefb,stroke:#1976d2,color:#0d47a1
    classDef autobot fill:#e8d5ff,stroke:#7c3aed,color:#3b0764
    classDef worker  fill:#c8e6c9,stroke:#388e3c,color:#1b5e20
    classDef volume  fill:#fff9c4,stroke:#fbc02d,color:#5d4037
    classDef extdata fill:#e1bee7,stroke:#8e24aa,color:#4a148c
    classDef docs    fill:#c8e6c9,stroke:#388e3c,color:#1b5e20

    Net["Internet :80/:443 only<br/>(OCI VCN + iptables)"]:::external
    DDNS["DuckDNS<br/>autosagex-api.duckdns.org → A1 IP"]:::external
    DocsWidget["Autosage-docs widget<br/>(anonymous, public)"]:::docs

    subgraph A1Host ["OCI Ampere A1  ·  Ubuntu 22.04 aarch64  ·  ~/autosage-server/"]
        subgraph Compose ["docker compose  (autosage-net bridge)"]

            Nginx["nginx :80/:443<br/>image: nginx:1.27-alpine<br/>publishes host ports 80, 443<br/>━━━━━━<br/>• HTTP → HTTPS 301<br/>• /api/* → http://django:8000<br/>• /api/ai/* → http://autobot:8030<br/>  (strips /api/ai prefix)<br/>• proxy_buffering off (SSE)<br/>• /.well-known/acme-challenge → certbot vol"]:::proxy

            Django["django (Uvicorn ASGI :8000)<br/>image: autosage-server:latest (arm64)<br/>expose only — NOT host-mapped<br/>━━━━━━<br/>• Django 5.2 + DRF<br/>• ClerkAuthMiddleware (JWKS 1h cache)<br/>• SECURE_PROXY_SSL_HEADER<br/>• Native async SSE views<br/>• fastembed lazy singleton (query-only)<br/>  model baked into image — no cold download<br/>━━━━━━<br/>New in v3:<br/>• DocChunk model + pgvector cosine search<br/>• POST /api/autobot/docs/search/<br/>  X-Internal-Secret gated · IP throttle<br/>• WorkflowRunIntent model<br/>• POST /workflows/id/run/intent/<br/>• POST /runs/intents/id/fulfill/<br/>• POST /run/async/ (fire-and-forget script)"]:::django

            Autobot["autobot (Uvicorn :8030)<br/>image: autosage-autobot:latest (arm64)<br/>expose only — NOT host-mapped<br/>━━━━━━<br/>• FastAPI AI service<br/>• Clerk JWT verify (JWKS 1h cache)<br/>• Redis DB/2: ctx + exec-quota + admin-quota<br/>• LiteLLM: admin pool + BYO LLM<br/>━━━━━━<br/>Pillar B (v2) — execution copilot:<br/>• run_workflow / rerun_workflow<br/>• run_script / preview_workflow_run<br/>• get_execution_histories<br/>• get_workflow_run / get_script_run<br/>• read_run_logs (GCS text server-side)<br/>• execution mode: BYO-key only<br/>━━━━━━<br/>Pillar A (v3) — docs RAG:<br/>• search_docs tool (X-Internal-Secret)<br/>• POST /api/ai/docs/chat/stream/<br/>  no auth · IP burst + daily cap<br/>  admin LLM only · single tool"]:::autobot

            Celery["celery worker<br/>queue: celery · concurrency 4<br/>━━━━━━<br/>• workflows.execute_workflow<br/>• DAG traversal (networkx)<br/>• streams NDJSON from exec-worker<br/>• publishes to Redis Pub/Sub<br/>• uploads logs to GCS<br/>• 1800s soft / 3600s hard timeout<br/>  (never loads fastembed)"]:::worker

            Beat["celery beat<br/>single instance · DatabaseScheduler<br/>━━━━━━<br/>• reads django_celery_beat tables<br/>• dispatches fire_scheduled_workflow<br/>  to scheduler queue<br/>  (never loads fastembed)"]:::worker

            Sched["celery worker (dedicated)<br/>queue: scheduler · concurrency 2<br/>━━━━━━<br/>• triggers.fire_scheduled_workflow<br/>• enforces no-overlap policy<br/>• calls enqueue_workflow_run()<br/>  (never loads fastembed)"]:::worker

            Certbot["certbot (profile: tools)<br/>image: certbot/certbot<br/>━━━━━━<br/>• one-shot, NOT started by 'up -d'<br/>• ACME http-01 via webroot<br/>• daily renewal cron 03:17 UTC"]:::worker

            LEVol[("named vol: letsencrypt<br/>/etc/letsencrypt")]:::volume
            WRVol[("named vol: certbot-webroot<br/>/var/www/certbot")]:::volume
        end

        subgraph BindMounts ["host bind mounts (read-only)"]
            ServerEnv[("server.env<br/>chmod 600")]:::external
            AutobotEnv[("autobot.env<br/>chmod 600<br/>incl. DOCS_INTERNAL_SECRET<br/>AUTOBOT_EXEC_DAILY_LIMIT")]:::external
            GcsKey[("gcs_key.json<br/>chmod 600")]:::external
            NginxCfg[("nginx/active.conf")]:::external
        end
    end

    Supabase[("Supabase Postgres + pgvector<br/>workflows · runs · node_runs<br/>vault · triggers · celery beat<br/>WorkflowRunIntent<br/>DocChunk (768-dim embeddings)")]:::extdata
    Redis[("Upstash Redis (rediss://)<br/>DB/0: Celery broker + results<br/>DB/2: Autobot hot-ctx (7200s TTL)<br/>      exec quota + admin quota<br/>      Docs anon sessions (TTL)")]:::extdata
    GCS_D[("GCS autosagex-drive<br/>script bodies")]:::extdata
    GCS_L[("GCS autosagex-logs<br/>stdout · stderr · logs.json")]:::extdata
    ExecWorker["Cloud Run execution-worker<br/>(see worker.architecture.md)"]:::worker
    Clerk["Clerk JWKS"]:::external

    %% Ingress
    Net -->|"DNS"| DDNS
    DDNS -->|"A record"| Net
    Net -->|"TCP 443 → TLS"| Nginx
    DocsWidget -->|"no auth · IP-throttled"| Nginx

    %% nginx routing
    Nginx -->|"/api/* → django:8000"| Django
    Nginx -->|"/api/ai/* → autobot:8030"| Autobot

    %% Autobot
    Autobot -.->|"JWKS (1h cache)"| Clerk
    Autobot <-->|"hot-ctx + quotas + docs sessions"| Redis
    Autobot -->|"Bearer JWT forwarded (all tool calls)"| Django
    Autobot -->|"X-Internal-Secret (docs search only)"| Django

    %% Django
    Django -.->|"JWKS (1h cache)"| Clerk
    Django <-->|"ORM conn_max_age=600s + pgvector"| Supabase
    Django <-->|"Celery enqueue + Pub/Sub"| Redis
    Django <-->|"script bodies + log upload"| GCS_D
    Django -->|"X-API-Key + OIDC<br/>streaming POST"| ExecWorker

    %% Workers
    Celery <-->|"celery queue"| Redis
    Sched  <-->|"scheduler queue"| Redis
    Beat   -->|"enqueue periodic tasks"| Redis
    Beat   -->|"read PeriodicTask"| Supabase
    Celery -->|"X-API-Key + OIDC"| ExecWorker
    Celery -->|"final log bundle"| GCS_L

    %% Certbot
    Certbot <-->|"ACME http-01"| Nginx
    Certbot --> LEVol
    Nginx --> LEVol
    Nginx <--> WRVol
    Certbot --> WRVol

    %% Env mounts
    ServerEnv -.->|"env_file"| Django
    ServerEnv -.->|"env_file"| Celery
    ServerEnv -.->|"env_file"| Beat
    ServerEnv -.->|"env_file"| Sched
    AutobotEnv -.->|"env_file"| Autobot
    GcsKey -.->|"ro mount"| Django
    GcsKey -.->|"ro mount"| Celery
    GcsKey -.->|"ro mount"| Beat
    GcsKey -.->|"ro mount"| Sched
    NginxCfg -.->|"ro mount"| Nginx
```

---

## CI/CD pipeline

```mermaid
flowchart LR
    classDef github   fill:#24292e,stroke:#24292e,color:#fff
    classDef build    fill:#fff3e0,stroke:#ef6c00,color:#bf360c
    classDef host     fill:#fce4ec,stroke:#c2185b,color:#880e4f
    classDef registry fill:#0366d6,stroke:#0366d6,color:#fff

    A["git push origin main<br/>(server/**, autobot/**, nginx/**,<br/>docker-compose.oci.yml)"]:::github

    subgraph J1 ["Job: build-and-push (ubuntu-latest)"]
        B1["actions/checkout"]:::build
        B2["docker/setup-qemu (arm64)"]:::build
        B3["docker/setup-buildx"]:::build
        B4["build autosage-server:latest (arm64)<br/>context: ./server<br/>cache: type=gha<br/>Note: fastembed model pre-downloaded in image"]:::build
        B5["build autosage-autobot:latest (arm64)<br/>context: ./autobot<br/>cache: type=gha"]:::build
        B1 --> B2 --> B3 --> B4
        B3 --> B5
    end

    subgraph J2 ["Job: deploy (needs: build-and-push)"]
        D1["actions/checkout"]:::host
        D2["sed DUCKDNS_DOMAIN into nginx conf"]:::host
        D3["scp docker-compose.oci.yml<br/>+ nginx configs → A1"]:::host
        D4["ssh on A1:<br/>• docker login ghcr.io<br/>• docker compose pull (server + autobot)<br/>• docker compose up -d --remove-orphans<br/>• nginx -t and nginx -s reload<br/>• docker image prune -f"]:::host
        D1 --> D2 --> D3 --> D4
    end

    subgraph J3 ["Job: health-check (needs: deploy)"]
        H1["ssh: docker exec django /api/health/"]:::host
        H2["curl https://autosagex-api.duckdns.org/api/health/"]:::host
        H1 --> H2
    end

    GHCR_S[("GHCR autosage-server:latest (arm64)")]:::registry
    GHCR_A[("GHCR autosage-autobot:latest (arm64)")]:::registry

    A --> B1
    B4 --> GHCR_S
    B5 --> GHCR_A
    GHCR_S -.->|"docker compose pull"| D4
    GHCR_A -.->|"docker compose pull"| D4
    D4 --> H1
```

---

## New Django endpoints (v3)

### Pillar A — Docs RAG

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/autobot/docs/search/` | `X-Internal-Secret` header (constant-time compare, fails closed when unset) | Called only by Autobot's `search_docs` tool; IP-throttled as defense-in-depth; embeds query via fastembed, runs pgvector cosine top-k over `DocChunk` |

### Pillar B — Execution Copilot

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/execution-engine/workflows/<id>/run/intent/` | Clerk JWT | Creates `WorkflowRunIntent` (no `WorkflowRun` yet); strips password inputs; returns `{run_intent_id, needs_params}`; TTL 5 min, single-use |
| `POST /api/execution-engine/workflows/runs/intents/<id>/fulfill/` | Clerk JWT | Owner-scoped; validates `is_valid()` (not fulfilled, not expired); merges intent inputs + browser params; calls `enqueue_workflow_run(trigger_source="manual")` so Layer-3 password drop does NOT fire; marks intent fulfilled |
| `POST /api/execution-engine/run/async/` | Clerk JWT | Fire-and-forget script run for Autobot path; Celery task drains stream, discards SSE frames; returns `202 {execution_id, status:"pending"}` |

---

## fastembed resource model

The `fastembed` BAAI/bge-base-en-v1.5 model is **baked into the Django image** at build time (pre-downloaded into a cache directory inside the image).

| Concern | Detail |
|---|---|
| RAM | Loaded **lazily** on first embed call; only the Django web worker (query path) and the `ingest_docs` management command ever embed. Celery, Beat, and scheduler workers never embed and pay **zero extra RAM**. |
| Disk | ~hundreds of MB on the image; Docker layers are shared, so it is one copy on the host regardless of how many containers run from it. |
| Cold start | No egress download on first container start — model is already on-disk in the layer. |
| Query asymmetry | BGE instruction prefix is applied to **query** vectors only; passage vectors at ingest time use no prefix. The helper applies this exactly once on the query side. |

---

## TLS bootstrap & renewal

```mermaid
sequenceDiagram
    autonumber
    participant Admin as Admin (manual, once)
    participant Compose as docker compose
    participant Nginx as nginx
    participant CB as certbot
    participant LE as Let's Encrypt
    participant Cron as cron daemon

    Admin->>Compose: cp autosage-bootstrap.conf active.conf
    Admin->>Compose: docker compose up -d --no-deps nginx
    Compose-->>Nginx: start with HTTP-only config
    Admin->>Compose: docker compose run --rm certbot certonly --webroot
    Compose-->>CB: launch with letsencrypt + webroot vols
    CB->>LE: ACME order autosagex-api.duckdns.org
    LE->>CB: http-01 challenge token
    CB->>Nginx: write token to /var/www/certbot/.well-known/acme-challenge/
    LE->>Nginx: HTTP GET token
    Nginx-->>LE: 200 OK
    LE-->>CB: cert + chain + key
    CB->>CB: write to /etc/letsencrypt/live/...

    Note over Admin,Cron: First git push to main
    Admin->>Compose: GHA deploy → docker compose up -d
    Compose-->>Nginx: all services up
    Compose->>Compose: cp autosage.conf → active.conf
    Compose->>Nginx: nginx -s reload

    Note over Cron,LE: 60 days later — renewal window
    Cron->>Compose: docker compose run --rm certbot renew --quiet
    CB->>LE: ACME renew
    LE-->>CB: new cert
    CB->>CB: write new fullchain.pem
    Cron->>Compose: docker compose exec nginx nginx -s reload
    Compose-->>Nginx: pick up new cert
```

---

## Host directory layout

```
/home/ubuntu/autosage-server/
├── server.env                  # Django + Celery secrets (chmod 600, $$ escaped)
├── autobot.env                 # Autobot secrets (chmod 600)
│                               #   DOCS_INTERNAL_SECRET (must match Django's)
│                               #   AUTOBOT_EXEC_DAILY_LIMIT
│                               #   AUTOBOT_ADMIN_FALLBACKS
├── gcs_key.json                # GCS SA key → /app/creds/service-account.json (chmod 600)
├── docker-compose.oci.yml      # scp'd by deploy workflow
├── certbot.log                 # cron renewal output
└── nginx/
    ├── autosage.conf           # production TLS config (scp'd, DUCKDNS_DOMAIN substituted)
    ├── autosage-bootstrap.conf # HTTP-only bootstrap (scp'd as-is)
    └── active.conf             # whichever conf is live
```

**Docker named volumes:**

| Volume | Mounted by | Purpose |
|---|---|---|
| `letsencrypt` | nginx (ro), certbot (rw) | `/etc/letsencrypt` — live certs + ACME account state |
| `certbot-webroot` | nginx (ro), certbot (rw) | `/var/www/certbot` — http-01 challenge files |

---

## SSE request flow through nginx

```mermaid
sequenceDiagram
    participant Browser
    participant Nginx as nginx :443
    participant Django as django :8000
    participant Redis
    participant Celery as celery worker

    Browser->>Nginx: GET /api/.../runs/abc/stream/<br/>Accept: text/event-stream
    Nginx->>Nginx: TLS terminate<br/>X-Forwarded-Proto: https
    Nginx->>Django: HTTP/1.1 GET ...stream/
    Django->>Django: SECURE_PROXY_SSL_HEADER → scheme = https
    Django->>Django: ClerkAuth verifies JWT
    Django->>Redis: SUBSCRIBE workflow_run:abc:logs
    Django-->>Nginx: 200 Content-Type: text/event-stream<br/>X-Accel-Buffering: no
    Nginx-->>Browser: SSE stream begin

    loop each node
        Celery->>Redis: PUBLISH workflow_run:abc:logs {event:log}
        Redis-->>Django: pubsub message
        Django-->>Nginx: data: {...}\n\n
        Nginx-->>Browser: flushed immediately (proxy_buffering off)
    end

    Celery->>Redis: PUBLISH {event:done}
    Redis-->>Django: done message
    Django-->>Nginx: data: {event:done}\n\n + close
    Nginx-->>Browser: connection close
```

The three nginx settings that make SSE work: `proxy_buffering off`, `proxy_read_timeout 3600s`, `proxy_http_version 1.1` + `proxy_set_header Connection ""`.

---

## GitHub Actions secrets

| Secret | Used by | Purpose |
|---|---|---|
| `GHCR_PAT` | build-and-push, deploy | docker login to ghcr.io |
| `VM_HOST` | deploy, health-check | DuckDNS hostname or A1 public IP |
| `VM_USER` | deploy, health-check | `ubuntu` |
| `VM_SSH_KEY` | deploy, health-check | private key (full PEM) |
| `VM_SSH_PORT` | deploy, health-check | `22` |
| `DUCKDNS_DOMAIN` | deploy, health-check | `autosagex-api.duckdns.org` (no scheme) |
