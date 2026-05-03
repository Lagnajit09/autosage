# AGENT GUIDELINES FOR AUTOSAGE REPOSITORY

This document explains the repository conventions, system architecture, deployment model, and operational boundaries for Autosage so coding agents can understand the application before making changes.

## 1. What Autosage Is

Autosage is a remote script automation and workflow execution platform.

Users can:

- Create, save, and execute workflows.
- Run Python, PowerShell, and shell scripts against target VMs.
- Reuse and fork execution templates.
- Use **Autobot**, the built-in AI assistant, to generate scripts, generate workflows, support troubleshooting, and help execute automation tasks.

At a high level, Autosage has:

- A React frontend for the user interface.
- Clerk for authentication and user identity.
- A Django backend that acts as the control plane and application API.
- A FastAPI-based execution worker that performs actual script execution.
- Supabase Postgres as the main relational database.
- Google Cloud Storage (GCS) for file/object storage.
- Redis as the message broker for Celery and for real-time log pub/sub.

## 2. High-Level Architecture

Autosage is split into two main backend responsibilities:

1. **Control plane** — the Django server (`/server`).
2. **Execution plane** — the FastAPI exec-worker (`/exec-worker`).

This separation ensures the web/API layer remains responsive while heavy execution work is handled by the worker.

### 2.1 The Execution Flow

Typical workflow execution flow:

1.  **Trigger**: A workflow is triggered via the UI (manual), an HTTP webhook, or a Cron schedule.
2.  **Enqueuing**: The Django server creates a `WorkflowRun` and its constituent `NodeRun` records in the database.
3.  **Celery Task**: Django enqueues a `workflows.execute_workflow` task to Redis.
4.  **DAG Traversal**: A Celery worker picks up the task, builds a Directed Acyclic Graph (DAG) from the workflow definition, and determines the execution order.
5.  **Node Execution**: For each node:
    - **Action Node**: Django resolves parameters (masking secrets), fetches the script from GCS, and makes a streaming HTTP POST request to the `exec-worker`.
    - **Decision Node**: Django evaluates conditions based on upstream node outputs and prunes branches accordingly.
6.  **Streaming Logs**: The `exec-worker` streams stdout/stderr back to Django, which publishes them to Redis Pub/Sub.
7.  **SSE**: The React client subscribes to a Server-Sent Events (SSE) endpoint on Django, which relays logs from Redis Pub/Sub in real-time.
8.  **Completion**: Once finished, Django uploads the full log bundle to GCS and marks the run as `success` or `failed`.

## 3. Celery & Redis Configuration

Celery is the backbone of background execution in Autosage.

### 3.1 Broker & Backend
- **Broker**: Redis is used as the message broker (`CELERY_BROKER_URL`).
- **Result Backend**: Redis is also used to store task results (`CELERY_RESULT_BACKEND`).

### 3.2 Stability & Robustness
Because Autosage often uses remote Redis (like Upstash) and runs on Windows in development, specific settings are applied in `settings.py`:
- `visibility_timeout`: Set to 3600s (1 hour) to allow long-running workflows to complete without being re-enqueued.
- `socket_timeout` & `socket_connect_timeout`: Set to 30s to handle network latency.
- `retry_on_timeout`: Enabled for robustness.
- `CELERY_BROKER_POOL_LIMIT`: Disabled (`None`) to avoid stale connection issues in long-lived workers.

### 3.3 Task Routing
To ensure system responsiveness, tasks are routed to specific queues:
- **`scheduler` queue**: Reserved for the lightweight `fire_scheduled_workflow` task. This prevents cron triggers from being blocked by a backlog of long-running workflow executions.
- **Default queue**: Used for the heavy `execute_workflow` tasks.

## 4. Trigger System

Autosage supports multiple ways to trigger automation.

### 4.1 HTTP Trigger (Webhooks)
Allows external systems (GitHub, CI/CD, etc.) to trigger workflows.
- **Authentication**: Uses a per-trigger `trigger_token` in the URL and an `X-Trigger-Secret` header. Only the bcrypt hash of the secret is stored in the DB.
- **Idempotency**: Requires an `Idempotency-Key` header. Repeat requests with the same key return the original `WorkflowRun` metadata instead of starting a new one.
- **Public Polling**: Callers receive a `polling_url` to check run status without needing Clerk authentication.

### 4.2 Cron Scheduler (Celery Beat)
Allows workflows to run on a recurring schedule.
- **Database Scheduler**: Uses `django_celery_beat.schedulers:DatabaseScheduler`. Schedules are stored in the database, allowing them to be managed dynamically via the UI/API without restarting the service.
- **Sync Logic**: When a user creates/updates a schedule in the UI, Django idempotently syncs a `PeriodicTask` and a `CrontabSchedule` in the `django-celery-beat` tables.
- **Overlap Policy**: By default, if a scheduled run is already queued or running, the next scheduled fire for that specific workflow is skipped to prevent resource exhaustion.

## 5. Repository Structure

This repository contains multiple projects with different technology stacks.

### 5.1 Frontend (`/client`)

- **Technologies:** React, TypeScript, Vite, Radix UI, Tailwind CSS.
- **Purpose:** User-facing web application.

### 5.2 Current Backends (`/server` and `/exec-worker`)

- **`/server`**: Django backend.
- **`/exec-worker`**: FastAPI execution worker.
- **Note:** These are the active backend services in the current version.

### 5.3 Legacy Backend (`/server_v1`)

- **Technologies:** Node.js, Express, OpenAI, Azure AI Inference.
- **Status:** Old backend, not used in the current version.

## 6. Django Server Responsibilities (`/server`)

The Django server is the primary application backend and should be treated as the **control plane**.

It is responsible for:

- Receiving authenticated API requests from the React client.
- Validating users and permissions using Clerk identity information.
- Managing application/business logic.
- Managing workflow definitions, templates, and run metadata.
- Orchestrating execution requests.
- Coordinating with storage and database services.
- Returning status/results metadata back to the frontend.
- Serving as the source of truth for system state, user actions, and run lifecycle state.

The Django server should **not** be the place where long-running script execution happens directly. That work belongs in the exec-worker or an asynchronous execution pipeline.

### 6.1 Django Deployment Model

Current/expected deployment characteristics:

- Django is deployed on a small Compute Engine VM.
- The server mentioned in discussion is an **e2-micro** instance, which is low-resource and should be reserved for lightweight API/orchestration work.
- Django should remain stateless at the app-instance level as much as possible.
- If multiple Django instances are ever run, they should sit behind a reverse proxy/load balancer such as NGINX.

For Autosage, Django should be optimized for:

- Fast request handling.
- Authentication and authorization checks.
- Metadata creation and retrieval.
- Delegation of execution work.

Agents should avoid introducing heavy synchronous processing into Django request handlers.

### 6.2 How Django Should Handle Workflow Executions

Preferred pattern:

- Accept execution request.
- Validate the authenticated user.
- Validate access to template/workflow/VM target.
- Create a workflow run record.
- Push execution work to the downstream execution system.
- Return a response immediately with run status and identifiers.

Avoid pattern:

- Accept request.
- Perform the full remote script execution inside the Django request/response cycle.
- Hold the request open until execution is complete.

Because the host is resource-constrained, the avoid pattern can easily cause slowdowns under concurrent usage.

## 7. Exec-Worker Responsibilities (`/exec-worker`)

The exec-worker is the **execution plane** and should be treated as the service responsible for actual runtime automation work.

It is responsible for:

- Receiving execution jobs or execution requests from Django or a queue.
- Running Python, PowerShell, and shell scripts.
- Interacting with remote VMs/targets.
- Executing workflow steps in order.
- Capturing logs, outputs, exit codes, and failure states.
- Returning or persisting execution results.
- Managing execution-specific concerns such as timeouts, retries, and environment/runtime handling.

The exec-worker should contain execution logic, not product-level business logic that belongs in Django.

### 7.1 Exec-Worker Deployment Model

Current/expected deployment characteristics:

- The exec-worker is deployed separately from Django.
- It runs on **Google Cloud Run**.
- This separation lets execution scale independently from the Django control plane.
- Cloud Run is a better place for elastic execution workloads than the small Django VM.

Agents should design worker-facing changes with the expectation that:

- Worker instances may scale up/down independently.
- Requests/jobs may be concurrent.
- Long-running executions should not depend on Django keeping an open HTTP request alive.

### 7.2 Queue Placement

For Autosage, the queue mechanism belongs around the execution path between Django and the exec-worker.

Recommended model:

- Django acts as producer/orchestrator.
- A queue/broker carries execution jobs.
- The exec-worker consumes jobs asynchronously.

This is preferable to using Django as a long-lived synchronous caller of the worker for every execution.

## 8. Authentication: Clerk

Clerk handles authentication and user identity for Autosage.

Clerk-related responsibilities include:

- Sign-in and sign-up flows.
- Session and token handling on the client.
- Passing authenticated identity context to the backend.

Expected backend behavior:

- Django verifies and trusts Clerk-backed identity according to the integration in the codebase.
- Backend authorization must still be enforced by the server even when the frontend is authenticated.
- User-specific resources such as workflows, templates, runs, and artifacts must always be checked against the authenticated identity.

Agents should treat Clerk as the identity provider and Django as the enforcement point for authorization/business rules.

## 9. Data Layer: Supabase DB

Supabase is used for the database layer.

Expected role of Supabase DB:

- Store users or user-linked application records.
- Store workflow definitions.
- Store templates and template metadata.
- Store workflow run metadata and statuses.
- Store execution history.
- Store references to artifacts/logs stored externally in GCS.

Typical entities agents should expect to exist or be needed:

- Users
- Workflows
- Templates
- Workflow runs
- Execution steps
- Execution logs/metadata references
- Artifact references

Suggested workflow run statuses:

- `queued`
- `running`
- `success`
- `failed`
- `cancelled` (if cancellation exists)

Agents should preserve data integrity and avoid schema changes that blur the line between metadata in DB and large binary artifacts in object storage.

## 10. File/Object Storage: GCS

Google Cloud Storage (GCS) is used for object storage.

Expected role of GCS:

- Store execution artifacts.
- Store uploaded files or generated output bundles.
- Store logs or large execution outputs when they are too large or unsuitable for direct relational storage.
- Store files referenced by workflow runs, templates, or execution results.

Best practice expectations:

- Large files belong in GCS, not inline in relational tables.
- Database records should store paths, URLs, metadata, content hashes, or object references rather than large blobs.
- Access control for stored artifacts should be handled carefully and consistently with authenticated user permissions.

## 11. Current Deployment View

### 11.1 Frontend

- React application deployed separately from backend services.
- Uses Clerk for auth and calls the Django API.

### 11.2 Django Server

- Deployed on a Google Compute Engine VM.
- Current context suggests a small **e2-micro** instance.
- Suitable for control-plane/API responsibilities, not heavy job execution.

### 11.3 Exec-Worker

- Deployed on Google Cloud Run.
- Handles actual script/workflow execution.
- Can be scaled more independently than the Django VM.

### 11.4 Storage and Data

- Supabase DB for relational/application state.
- GCS for files and execution artifacts.

## 12. Concurrency and Scaling Model

Autosage is an execution platform, so concurrency design matters.

### 12.1 What to Optimize For

- Multiple users launching workflows at the same time.
- Long-running remote executions.
- Isolation between API traffic and execution traffic.
- Clear lifecycle tracking for every run.

### 12.2 Preferred Scaling Direction

Scale these independently:

- **Frontend/UI traffic** via the React deployment.
- **Control plane/API** via Django instances if needed.
- **Execution plane** via worker-side scaling and queue consumption.

If load balancing is introduced for Django, it should improve API concurrency but should not be treated as the main solution for execution load. Queue-based async execution is more important for Autosage’s architecture.

## 13. Guidance for Agents Making Changes

When modifying Autosage, agents should preserve these architectural boundaries:

### 13.1 Put logic in the right service

- Put product/business/orchestration logic in Django.
- Put execution/runtime/remote-script logic in exec-worker.
- Put UI logic in the React client.

### 13.2 Avoid architectural drift

Do **not**:

- Move long-running execution logic into Django request handlers.
- Store large artifacts directly in DB rows when GCS is available.
- Assume synchronous execution is acceptable for all workflow runs.
- Mix identity verification with authorization shortcuts.

### 13.3 Favor explicit lifecycle tracking

When building run/execution features, prefer explicit fields for:

- `status`
- `started_at`
- `finished_at`
- `error_message`
- `artifact_reference`
- `triggered_by`
- `execution_target`

### 13.4 Think in control plane vs execution plane

If a feature is about:

- policy, permissions, metadata, configuration, templates, workflow creation -> Django.
- job pickup, script runtime, shell/powershell/python execution, remote VM activity, streaming logs -> exec-worker.

## 14. Build, Lint, and Test Commands

### 14.1 Frontend (Client - JavaScript/TypeScript/React)

- **Location:** `/client`
- **Install Dependencies:** `npm install`
- **Build (Production):** `npm run build` or `vite build`
- **Build (Development):** `npm run build:dev` or `vite build --mode development`
- **Lint:** `npm run lint` or `eslint .`
- **Run a Single Test:** infer from repository setup if tests exist, for example:
  - `npx vitest <path/to/test-file.test.ts>`
  - `npx jest <path/to/test-file.test.ts>`

### 14.2 Python Backends (Server & Exec-Worker)

- **Locations:** `/server` and `/exec-worker`
- **Install Dependencies:** `pip install -r requirements.txt`
- **Lint:** `flake8 .` or `ruff check .`
- **Test:** `pytest`
- **Run a Single Test:** `pytest <path/to/test_file.py::test_function_name>`

### 14.3 Legacy Node.js Backend (`/server_v1`)

- **Install Dependencies:** `npm install`
- **Start Server:** `npm start` or `node server.js`
- **Development Server:** `npm run dev` or `nodemon server.js`
- **Lint:** `npm run lint` or `eslint .`
- **Lint (Fix):** `npm run lint:fix` or `eslint . --fix`
- **Test:** `npm test` or `jest`
- **Run a Single Test:** `npx jest <path/to/test-file.test.js>`

## 15. Code Style and Conventions

### 15.1 Naming Conventions

- **Variables and Functions:** `camelCase` for JavaScript/TypeScript, `snake_case` for Python.
- **Classes and Types:** `PascalCase`.
- **Constants:** `UPPER_SNAKE_CASE`.

### 15.2 Error Handling

- Handle errors gracefully and provide informative messages.
- Use `try-catch` in JavaScript/TypeScript.
- Use `try-except` in Python.
- Handle promise rejections and asynchronous failures explicitly.

### 15.3 Comments

- Explain complex logic and important design decisions.
- Focus comments on **why**, not just **what**.
- Keep comments concise and updated.

### 15.4 Frontend Code Style

- Absolute imports are preferred when configured.
- Follow ESLint rules.
- Use TypeScript interfaces/types explicitly.
- Use functional React components with hooks.
- Use Tailwind CSS as the primary styling approach.

### 15.5 Python Backend Code Style

- Prefer absolute imports.
- Organize imports by standard library, third-party, then local modules.
- Adhere to PEP 8.
- Use Python type hints.
- Use `snake_case` for variables, functions, and modules; `PascalCase` for classes.

### 15.6 Legacy Node Backend Style

- Use CommonJS `require()`.
- Follow ESLint rules.
- Use centralized Express error handling patterns where applicable.

## 16. Operational Notes for Future Agents

Before making major changes, agents should answer these questions:

- Is this change control-plane logic or execution-plane logic?
- Should this data live in Supabase DB or GCS?
- Will this increase synchronous load on Django?
- Does this preserve tenant/user authorization boundaries?
- Does this improve or weaken observability of workflow run state?

Preferred direction for future work:

- Keep Django lean.
- Keep execution isolated.
- Keep storage responsibilities separated.
- Keep run status explicit.
- Design for bursty concurrent execution.

## 17. Cursor/Copilot Rules

No specific `.cursor/rules/` or `.github/copilot-instructions.md` files were found in this repository. Agents should rely on this document as the primary architecture and coding guidance unless more specific repository-local instructions are added later.
