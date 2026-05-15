# Autosage Full-Stack Architecture

This document provides a high-level overview of the entire Autosage ecosystem, illustrating how the React frontend, Django backend, and FastAPI execution worker integrate to deliver a seamless developer experience — all while running on a $0/month cost structure.

---

## High-Level Architecture Diagram

The diagram below shows the interaction between the user, the cloud hosting providers, and the automated CI/CD pipelines.

```mermaid
flowchart TD
    %% Node Style Definitions
    classDef user fill:#f6f8fa,stroke:#d1d5da,color:#000
    classDef github fill:#24292e,stroke:#24292e,color:#fff
    classDef firebase fill:#ffca28,stroke:#f57c00,color:#000
    classDef gcp fill:#4285f4,stroke:#1565c0,color:#fff
    classDef supabase fill:#3ecf8e,stroke:#066b3d,color:#fff
    classDef clerk fill:#6c47ff,stroke:#5531e2,color:#fff
    classDef server fill:#e3f2fd,stroke:#1e88e5,color:#0d47a1
    classDef worker fill:#e8f5e9,stroke:#43a047,color:#1b5e20

    subgraph Users ["🌐 Public Internet"]
        Browser[Client Browser]:::user
    end

    subgraph GitHub ["🐙 GitHub (Source & CI/CD)"]
        Repo[(lagnajit09/autosage)]:::github
        GHA[GitHub Actions]:::github
        GHCR[GitHub Container Registry]:::github
    end

    subgraph Firebase ["🔥 Firebase Hosting"]
        FBCDN[Global CDN]:::firebase
        Hosting[Static Assets]:::firebase
    end

    subgraph GCP ["☁️ Google Cloud Platform (Backend)"]
        subgraph VM ["🖥️ Always-Free VM (e2-micro)"]
            Nginx[Nginx Reverse Proxy\nSSL Termination]:::server
            Django[Django Server\nGunicorn]:::server
        end

        subgraph CloudRun ["⚡ Cloud Run"]
            Worker[Execution Worker\nFastAPI]:::worker
        end

        subgraph Storage ["📦 Cloud Storage"]
            GCS[(GCS Buckets)]:::gcp
        end

        subgraph Build ["🛠️ Build Services"]
            CB[Cloud Build]:::gcp
            AR[Artifact Registry]:::gcp
        end
    end

    subgraph External ["🔐 External Services"]
        Clerk[Clerk Auth]:::clerk
        Supabase[(Supabase\nPostgreSQL DB)]:::supabase
    end

    %% Client Flow
    Browser -->|HTTPS| FBCDN
    FBCDN --> Hosting
    Browser -.->|Authenticate| Clerk
    Browser -->|API Calls + SSE| Nginx

    %% Server Flow
    Nginx -->|Proxy| Django
    Django -->|CRUD Ops| Supabase
    Django -->|Trigger Task| Worker
    Django -->|Scripts & Logs| GCS
    Worker -->|Read/Write| GCS

    %% CI/CD Flow
    Repo -->|Push to client/| GHA
    Repo -->|Push to server/| GHA
    Repo -->|Push to exec-worker/| CB

    GHA -->|Build & Deploy| Hosting
    GHA -->|Push Image| GHCR
    GHCR -->|Pull Image| VM

    CB -->|Build Image| AR
    AR -->|Deploy| Worker
```

---

## 🏗️ System Components

### 1. **Client (React + Vite)**

- **Role**: The user interface where developers build and manage workflows.
- **Hosting**: Served via **Firebase Hosting** for global edge performance and automatic SSL.
- **Auth**: Uses **Clerk** for secure, passwordless authentication.
- **Detailed Docs**: [client.architecture.md](./client.architecture.md)

### 2. **Server (Django + Gunicorn)**

- **Role**: The "Brain" of the system. Manages state, handles API requests, coordinates workflow execution, and provides real-time updates via SSE (Server-Sent Events).
- **Database**: Communicates exclusively with **Supabase (PostgreSQL)** to store all application data.
- **Hosting**: Runs in a Docker container on a **GCP e2-micro VM** (Always Free tier).
- **Proxy**: **Nginx** acts as an HTTPS terminator and handles SSE buffering optimizations.
- **Detailed Docs**: [server.architecture.md](./server.architecture.md)

### 3. **Execution Worker (FastAPI)**

- **Role**: Handles heavy-duty code execution and specialized tasks. It is decoupled from the main server to allow for independent scaling.
- **Hosting**: Deployed on **Serverless Cloud Run**, scaling to zero when not in use to maintain $0 cost.
- **Detailed Docs**: [worker.architecture.md](./worker.architecture.md)

---

## 📡 Cross-Component Communication

1. **Client → Server**: Standard REST API calls and persistent SSE connections for streaming logs/outputs.
2. **Server → Database**: The Django server connects to **Supabase** for all primary data persistence (Users, Workflows, States).
3. **Server → Worker**: The Django server invokes the Cloud Run worker using IAM-authenticated HTTP requests.
4. **Server/Worker → Storage**:
   - **GCS** is used specifically for storing **Script-Files** and generated **Logs data**.
   - Both components interact with GCS using Service Account keys for authorized access.

---

## 🚀 Unified CI/CD Strategy

Autosage uses a multi-cloud CI/CD approach to optimize for speed and cost:

- **Frontend**: GitHub Actions builds the React app and deploys it to Firebase channels.
- **Backend (Server)**: GitHub Actions builds a Docker image, pushes it to GHCR, and signals the GCP VM to pull and restart.
- **Backend (Worker)**: Google Cloud Build triggers on repo changes, builds the image via Artifact Registry, and updates the Cloud Run revision.

---

## 🔒 Security Summary

- **HTTPS Throughout**: All traffic is encrypted via SSL (Firebase-managed for frontend, Nginx/Self-signed for backend).
- **Secrets Management**: Sensitive keys are stored in GitHub Repository Secrets (for CI/CD) and GCP Secret Manager (for runtime).
- **Least Privilege**: Components use dedicated Google Service Accounts with minimal required permissions.

---

## 💰 The "$0" Philosophy

The entire architecture is designed to stay within the **GCP Always-Free tier**, **Firebase Spark plan**, and **Supabase Free tier**. By utilizing e2-micro instances, Cloud Run's free quota, and edge hosting, the system scales reliably at zero operational cost for individual developers.
