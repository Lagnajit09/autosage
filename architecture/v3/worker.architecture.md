# Autosage Execution Worker — Deployment Architecture v3

**Host**: Cloud Run (autoscale 0→2) · **Region**: `us-central1` · **Repo path**: `exec-worker/**`

> **What changed since v2**: Nothing. The execution plane is intentionally carried forward unchanged. Cloud Run's free tier, scale-to-zero, and OIDC-secured invocation remain the right shape for bursty, short-lived workflow executions. All v3 changes (Docs RAG, Execution Copilot, password side-channel) live in the control plane (Django + Autobot on OCI A1) and do not affect the exec-worker service, its API, its executors, or its CI/CD pipeline.
>
> v2 doc archived at [../v2/worker.architecture.md](../v2/worker.architecture.md).

---

## Architecture overview

```mermaid
flowchart TD
    classDef oci    fill:#e3f2fd,stroke:#1e88e5,color:#0d47a1
    classDef gcp    fill:#4285f4,stroke:#1565c0,color:#fff
    classDef cr     fill:#c8e6c9,stroke:#388e3c,color:#1b5e20
    classDef gh     fill:#24292e,stroke:#24292e,color:#fff
    classDef secret fill:#fff3e0,stroke:#ef6c00,color:#bf360c
    classDef ext    fill:#f6f8fa,stroke:#d1d5da,color:#000

    subgraph CallerOCI ["OCI Ampere A1 (control plane)"]
        DjangoCaller["django + celery containers<br/>(see server.architecture.md)<br/>━━━━━━<br/>build_worker_headers():<br/>• X-API-Key: WORKER_API_KEY<br/>• Authorization: Bearer OIDC id_token<br/>  aud = EXEC_WORKER_AUDIENCE<br/>• fetched via ADC (gcs_key.json SA)"]:::oci
    end

    subgraph GCP ["Google Cloud (autosagex01 · us-central1)"]
        subgraph CR ["Cloud Run service: execution-worker"]
            Worker["FastAPI :8020<br/>━━━━━━<br/>• verify X-API-Key header<br/>• --no-allow-unauthenticated<br/>  IAM validates OIDC before request arrives<br/>• run_in_threadpool for SSH/WinRM/SMTP<br/>• NDJSON streaming response<br/>━━━━━━<br/>Endpoints:<br/>• POST /api/worker/execute<br/>• POST /api/worker/execute/email<br/>• POST /api/worker/stop/{exec_id}<br/>• GET  /api/health<br/>━━━━━━<br/>autoscale: 0 → 2 instances<br/>1 vCPU / 512 MiB / port 8020"]:::cr
            CrSA["runtime SA:<br/>execution-worker-sa@<br/>autosagex01.iam.gserviceaccount.com<br/>━━━━━━<br/>roles: Secret Manager Secret Accessor<br/>       Storage Object Admin"]:::gcp
            Worker -.->|"impersonates"| CrSA
        end

        subgraph BuildSvc ["Build + registry"]
            CB["Cloud Build trigger<br/>event: push to main<br/>file filter: exec-worker/**<br/>config: cloudbuild.yaml"]:::gcp
            CBSA["build SA:<br/>cloudbuild-trigger-sa@<br/>autosagex01.iam.gserviceaccount.com"]:::gcp
            AR[("Artifact Registry<br/>execution-worker:SHA + :latest")]:::gcp
            CB -.->|"acts as"| CBSA
            CB -->|"build + push"| AR
            AR -->|"gcloud run deploy"| Worker
        end

        subgraph SM ["Secret Manager"]
            S1["WORKER_API_KEY:latest"]:::secret
            S2["ENVIRONMENT:latest (= PROD)"]:::secret
        end
        S1 -.->|"--set-secrets"| Worker
        S2 -.->|"--set-secrets"| Worker

        subgraph GCSStorage ["Cloud Storage"]
            GCS_D[("autosagex-drive<br/>script bodies")]:::gcp
            GCS_L[("autosagex-logs<br/>written by Django, not worker")]:::gcp
        end
    end

    Targets["Customer-owned target VMs<br/>Linux: SSH (paramiko) :22<br/>Windows: WinRM (pywinrm) :5985/:5986"]:::ext
    Gmail["Gmail SMTP<br/>smtp.gmail.com:587 STARTTLS"]:::ext

    subgraph GH ["GitHub"]
        Repo[("lagnajit09/autosage")]:::gh
    end

    Repo -->|"push exec-worker/**"| CB
    DjangoCaller -->|"streaming POST NDJSON"| Worker
    Worker -->|"fetch script body (fallback)"| GCS_D
    Worker -->|"SSH / WinRM"| Targets
    Worker -->|"SMTP"| Gmail
    Worker -.->|"Storage Object Admin (ADC)"| GCS_D
```

---

## Why Cloud Run (not OCI too)

| Property | Cloud Run | OCI Compute |
|---|---|---|
| Scale to zero | Native, billed per request-second | Paid by the minute even when idle |
| Cold-start | ~1–2 s for this Python image | n/a |
| Concurrent slots | 80/instance × 2 instances = 160 | Capped by VM cores |
| Free tier | 180K vCPU-s + 360K GiB-s + 2M req/month | No per-request free pricing |
| IAM-secured invocation | First-class via `--no-allow-unauthenticated` + OIDC | Must roll your own auth gateway |

The control plane (Django + Celery + Beat + Autobot) has persistent state, long-lived SSE connections, and a Redis sidecar — it belongs on a dedicated always-on VM. The execution plane is bursty, stateless, and short-lived — Cloud Run is the right fit.

---

## CI/CD flow (Cloud Build → Cloud Run)

```mermaid
flowchart LR
    classDef gh  fill:#24292e,stroke:#24292e,color:#fff
    classDef gcp fill:#4285f4,stroke:#1565c0,color:#fff
    classDef cr  fill:#c8e6c9,stroke:#388e3c,color:#1b5e20

    A["git push to main<br/>exec-worker/** changes"]:::gh
    A --> B["Cloud Build trigger fires"]:::gcp
    B --> C["docker build -t AR:SHA ./exec-worker"]:::gcp
    C --> D["docker push AR:SHA<br/>docker push AR:latest"]:::gcp
    D --> E["gcloud run deploy execution-worker<br/>--image AR:SHA<br/>--service-account execution-worker-sa<br/>--set-secrets WORKER_API_KEY,ENVIRONMENT<br/>--no-allow-unauthenticated<br/>--cpu 1 --memory 512Mi<br/>--max-instances 2 --min-instances 0<br/>--port 8020"]:::gcp
    E --> F["Cloud Run revision live<br/>100% traffic to new SHA<br/>(zero-downtime)"]:::cr
```

No GitHub Actions involvement for the worker — Cloud Build handles everything in GCP.

---

## Authentication: how Django on OCI calls Cloud Run

```mermaid
sequenceDiagram
    autonumber
    participant Django as django (OCI A1)
    participant ADC as Google ADC (gcs_key.json)
    participant Meta as Google STS
    participant CR as Cloud Run execution-worker
    participant Worker as FastAPI handler

    Django->>ADC: id_token.fetch_id_token(audience=EXEC_WORKER_AUDIENCE)
    ADC->>Meta: token request signed with SA key
    Meta-->>ADC: short-lived OIDC id_token (1h)
    Django->>Django: build_worker_headers()
    Django->>CR: POST /api/worker/execute
    CR->>CR: validate Authorization (aud + signer)
    CR-->>Worker: forward request
    Worker->>Worker: validate X-API-Key
    Worker-->>Django: NDJSON stream 200 OK
```

The same `gcs_key.json` SA used for GCS access also sources credentials for `fetch_id_token` via `GOOGLE_APPLICATION_CREDENTIALS`. `X-API-Key` is a defense-in-depth check: even if Cloud Run were accidentally made public, a caller would need both the OIDC token and the API key.

---

## Permissions matrix

### Cloud Run runtime SA — `execution-worker-sa@autosagex01.iam.gserviceaccount.com`

| Role | Scope | Why |
|---|---|---|
| `roles/secretmanager.secretAccessor` | `WORKER_API_KEY`, `ENVIRONMENT` | Inject env vars on revision boot |
| `roles/storage.objectAdmin` | `autosagex-drive`, `autosagex-logs` | Script read (fallback) + potential log write |
| `roles/iam.serviceAccountUser` | self | Token impersonation |

### Cloud Build trigger SA — `cloudbuild-trigger-sa@autosagex01.iam.gserviceaccount.com`

| Role | Why |
|---|---|
| `roles/cloudbuild.builds.editor` | Run the build |
| `roles/cloudbuild.builds.builder` | Use Cloud Build worker pool |
| `roles/run.admin` | Update the Cloud Run service |
| `roles/artifactregistry.writer` | Push images |
| `roles/logging.logWriter` | Write build logs |
| `roles/storage.objectAdmin` | Cloud Build temp storage |
| `roles/iam.serviceAccountUser` on `execution-worker-sa` | Allow `gcloud run deploy --service-account=...` |

### Caller (OCI Django) — uses `gcs_key.json` SA

| Role | Why |
|---|---|
| `roles/run.invoker` on `execution-worker` service | Invoke `--no-allow-unauthenticated` Cloud Run |
| `roles/storage.objectAdmin` | scripts + logs buckets |
