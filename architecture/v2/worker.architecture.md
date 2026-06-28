# Autosage Execution Worker — Deployment Architecture v2

**Host**: Cloud Run (autoscale 0→2) · **Region**: `us-central1` · **Repo path**: `exec-worker/**`

> **What changed since v1**: Essentially nothing. The execution plane was
> intentionally NOT migrated — Cloud Run's free tier scales to zero, so it's
> already optimal, and its OIDC-secured calling convention is something the
> OCI Django side now plays well with too (via the same `build_worker_headers()`
> helper that's been there all along). v1 doc archived at
> [./v1/worker.architecture.md](./v1/worker.architecture.md).
>
> The only relevance to the GCP→OCI migration: now that Django runs on OCI,
> requests still go _out_ to a GCP service (`https://execution-worker-<hash>.run.app`),
> authenticated by a Google OIDC identity token Django fetches from ADC.

---

## Architecture overview

```mermaid
flowchart TD
    classDef oci fill:#e3f2fd,stroke:#1e88e5,color:#0d47a1
    classDef gcp fill:#4285f4,stroke:#1565c0,color:#fff
    classDef cr fill:#c8e6c9,stroke:#388e3c,color:#1b5e20
    classDef gh fill:#24292e,stroke:#24292e,color:#fff
    classDef secret fill:#fff3e0,stroke:#ef6c00,color:#bf360c
    classDef ext fill:#f6f8fa,stroke:#d1d5da,color:#000

    subgraph CallerOCI [" OCI Ampere A1 (control plane)"]
        DjangoCaller["django + celery containers<br/>(see server.architecture.md)<br/>━━━━━━<br/>build_worker_headers():<br/>• X-API-Key: WORKER_API_KEY<br/>• Authorization: Bearer <OIDC id_token><br/>&nbsp;&nbsp;aud=EXEC_WORKER_AUDIENCE<br/>• fetched via ADC"]:::oci
    end

    subgraph GCP [" Google Cloud (autosagex01 · us-central1)"]
        subgraph CR [" Cloud Run service: execution-worker"]
            Worker["FastAPI · :8020<br/>━━━━━━<br/>• verify X-API-Key header<br/>• --no-allow-unauthenticated → IAM verifies OIDC<br/>• run_in_threadpool for SSH/WinRM/SMTP<br/>• NDJSON streaming response<br/>• /api/worker/execute<br/>• /api/worker/execute/email<br/>• /api/worker/stop/{exec_id}<br/>• /api/health<br/>━━━━━━<br/>autoscale: 0..2 instances<br/>1 vCPU / 512 MiB<br/>port: 8020"]:::cr
            CrSA["runtime SA:<br/>execution-worker-sa@<br/>autosagex01.iam.gserviceaccount.com<br/>━━━━━━<br/>roles: Secret Manager Secret Accessor,<br/>Storage Object Admin"]:::gcp
            Worker -.->|"impersonates"| CrSA
        end

        subgraph BuildSvc [" Build + registry"]
            CB["Cloud Build trigger:<br/>autosage-exec-worker-deploy<br/>━━━━━━<br/>event: push to main<br/>file filter: exec-worker/**<br/>config: cloudbuild.yaml (root)"]:::gcp
            CBSA["build SA:<br/>cloudbuild-trigger-sa@<br/>autosagex01.iam.gserviceaccount.com<br/>━━━━━━<br/>roles: Cloud Build SA,<br/>Cloud Run Admin,<br/>Artifact Registry Writer,<br/>Service Account User"]:::gcp
            AR[("Artifact Registry<br/>autosage-exec-worker/<br/>execution-worker:$SHA + :latest")]:::gcp
            CB -.->|"acts as"| CBSA
            CB -->|"build & push"| AR
            AR -->|"gcloud run deploy"| Worker
        end

        subgraph SM [" Secret Manager"]
            S1["WORKER_API_KEY:latest"]:::secret
            S2["ENVIRONMENT:latest<br/>(= PROD)"]:::secret
        end
        S1 -.->|"--set-secrets"| Worker
        S2 -.->|"--set-secrets"| Worker

        subgraph GCSStorage [" Cloud Storage"]
            GCS_D[("autosagex-drive<br/>script bodies")]:::gcp
            GCS_L[("autosagex-logs<br/>(written by Django, not worker)")]:::gcp
        end
    end

    Targets[" Customer-owned target VMs<br/>━━━━━━<br/>Linux: SSH (paramiko) :22<br/>Windows: WinRM (pywinrm) :5985/5986"]:::ext
    Gmail[" Gmail SMTP<br/>smtp.gmail.com:587 STARTTLS"]:::ext

    subgraph GH [" GitHub"]
        Repo[("lagnajit09/autosage")]:::gh
    end

    %% Flows
    Repo -->|"push exec-worker/**"| CB
    DjangoCaller -->|"streaming POST<br/>NDJSON response<br/>1 line per stdout/stderr/exit"| Worker
    Worker -->|"fetch script body if Django<br/>didn't inline it (fallback path)"| GCS_D
    Worker -->|"SSH / WinRM"| Targets
    Worker -->|"SMTP"| Gmail
    Worker -.->|"GCS via Storage Object Admin<br/>(ADC on Cloud Run, no key file)"| GCS_D
```

---

## Why Cloud Run (not OCI too)

| Property                   | Cloud Run                                           | OCI Compute / Container Instances                                  |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Scale to zero              | ✅ native, billed per request-second                | ❌ paid by the minute even when idle                               |
| Cold-start                 | ~1–2 s for our Python image                         | n/a                                                                |
| Concurrent execution slots | 80 per instance, max 2 instances → 160 concurrent   | Capped by VM cores                                                 |
| Free tier ceiling          | 180K vCPU-s + 360K GiB-s + 2M req / month           | A1 has no per-request free pricing — would burn the instance hours |
| IAM-secured invocation     | First-class via `--no-allow-unauthenticated` + OIDC | Need to roll your own auth gateway                                 |

Verdict for this workload: most workflow runs are bursty and short-lived, so paying _only when running_ via Cloud Run is the right shape. The control plane (Django + Celery + Beat) has very different characteristics — long-running, persistent state, SSE connections — and benefits from a dedicated always-on VM (A1).

---

## CI/CD flow (Cloud Build → Cloud Run)

```mermaid
flowchart LR
    classDef gh fill:#24292e,stroke:#24292e,color:#fff
    classDef gcp fill:#4285f4,stroke:#1565c0,color:#fff
    classDef cr fill:#c8e6c9,stroke:#388e3c,color:#1b5e20

    A["git push to main<br/>exec-worker/** changes"]:::gh
    A --> B["Cloud Build trigger fires<br/>(path filter match)"]:::gcp
    B --> C["docker build -t AR:$SHA ./exec-worker"]:::gcp
    C --> D["docker push AR:$SHA<br/>docker push AR:latest"]:::gcp
    D --> E["gcloud run deploy execution-worker<br/>--image AR:$SHA<br/>--service-account execution-worker-sa<br/>--set-secrets WORKER_API_KEY,ENVIRONMENT<br/>--no-allow-unauthenticated<br/>--cpu 1 --memory 512Mi<br/>--max-instances 2 --min-instances 0<br/>--port 8020"]:::gcp
    E --> F["Cloud Run revision live<br/>100% traffic to new SHA<br/>(zero-downtime)"]:::cr
```

The build runs entirely in GCP. There is **no GitHub Actions involvement** for the worker — different CI than client/server.

---

## Authentication: how Django on OCI calls Cloud Run

Even though Django no longer runs on GCP infrastructure, it still authenticates to Cloud Run with a Google OIDC ID token. The flow:

```mermaid
sequenceDiagram
    autonumber
    participant Django as django (OCI A1 container)
    participant ADC as Google ADC<br/>(in-container service-account key)
    participant Meta as Google STS
    participant CR as Cloud Run<br/>execution-worker
    participant Worker as FastAPI handler

    Django->>ADC: id_token.fetch_id_token(audience=EXEC_WORKER_AUDIENCE)
    ADC->>Meta: token request signed with SA key
    Meta-->>ADC: short-lived OIDC id_token (1h)
    Django->>Django: build_worker_headers():<br/>X-API-Key, Authorization: Bearer <id_token>
    Django->>CR: POST /api/worker/execute
    CR->>CR: validate Authorization<br/>(aud matches service URL, signer is Google)
    CR-->>Worker: forward request
    Worker->>Worker: validate X-API-Key
    Worker-->>Django: NDJSON stream (200 OK)
```

The same `gcs_key.json` that the Django container uses for GCS access is also the source of credentials for `fetch_id_token` — because Application Default Credentials picks up `GOOGLE_APPLICATION_CREDENTIALS` automatically.

`X-API-Key` is a _defense-in-depth_ check on top of IAM: even if a misconfiguration somehow flipped Cloud Run to public, a stray HTTP caller still wouldn't have the API key, and even if they had the key, they wouldn't have the OIDC token. Either layer alone would reject the request.

---

## Permissions matrix

### Cloud Run runtime SA — `execution-worker-sa@autosagex01.iam.gserviceaccount.com`

| Role                                 | Scope                                       | Why                                                                                                  |
| ------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `roles/secretmanager.secretAccessor` | secrets WORKER_API_KEY, ENVIRONMENT         | Inject env vars on revision boot                                                                     |
| `roles/storage.objectAdmin`          | buckets `autosagex-drive`, `autosagex-logs` | Worker reads scripts (fallback path) and could write logs (not currently used — Django uploads logs) |
| `roles/iam.serviceAccountUser`       | self                                        | Required so the SA can act as itself for token impersonation                                         |

### Cloud Build trigger SA — `cloudbuild-trigger-sa@autosagex01.iam.gserviceaccount.com`

| Role                                                      | Why                                             |
| --------------------------------------------------------- | ----------------------------------------------- |
| `roles/cloudbuild.builds.editor`                          | Run the build                                   |
| `roles/cloudbuild.builds.builder`                         | Use Cloud Build worker pool                     |
| `roles/run.admin`                                         | Update the Cloud Run service                    |
| `roles/artifactregistry.writer`                           | Push images                                     |
| `roles/logging.logWriter`                                 | Write build logs                                |
| `roles/storage.objectAdmin`                               | Cloud Build temp storage                        |
| `roles/iam.serviceAccountUser` _on_ `execution-worker-sa` | Allow `gcloud run deploy --service-account=...` |

### Caller (OCI Django) — uses `gcs_key.json` SA

| Role                                                | Why                                                   |
| --------------------------------------------------- | ----------------------------------------------------- |
| `roles/run.invoker` _on_ `execution-worker` service | Invoke `--no-allow-unauthenticated` Cloud Run service |
| `roles/storage.objectAdmin`                         | scripts + logs buckets                                |

---
