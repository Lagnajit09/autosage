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

## 2. High-Level Architecture

Autosage is split into two main backend responsibilities:

1. **Control plane** — the Django server.
2. **Execution plane** — the FastAPI exec-worker.

This separation is important because the web/API layer should remain lightweight while execution work can be slow, bursty, and resource-intensive.

### 2.1 Request Flow Summary

Typical request flow:

- User opens the React client.
- User signs in through Clerk.
- React uses the authenticated session/token to call the Django API.
- Django validates identity/authorization, stores metadata, prepares workflow execution state, and coordinates with downstream services.
- For execution, Django delegates to the exec-worker rather than running scripts directly inside the web process.
- Execution outputs, logs, artifacts, and metadata are persisted using Supabase DB and GCS as appropriate.

### 2.2 Recommended Queue-Oriented Execution Flow

For architecture-aware agents, the preferred long-term flow is:

- User requests a workflow run.
- Django creates a workflow run record with a state such as `queued`.
- Django publishes a job to a queue.
- The exec-worker consumes the job asynchronously.
- The exec-worker performs script execution and updates run state to `running`, `success`, or `failed`.
- Logs, outputs, and artifacts are stored and linked back to the run record.

This pattern is preferred over synchronous end-to-end waiting from Django because Autosage is an execution platform and burst handling matters.

## 3. Repository Structure

This repository contains multiple projects with different technology stacks.

### 3.1 Frontend (`/client`)

- **Technologies:** React, TypeScript, Vite, Radix UI, Tailwind CSS.
- **Purpose:** User-facing web application.

### 3.2 Current Backends (`/server` and `/exec-worker`)

- **`/server`**: Django backend.
- **`/exec-worker`**: FastAPI execution worker.
- **Note:** These are the active backend services in the current version.

### 3.3 Legacy Backend (`/server_v1`)

- **Technologies:** Node.js, Express, OpenAI, Azure AI Inference.
- **Status:** Old backend, not used in the current version.

## 4. Django Server Responsibilities (`/server`)

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

### 4.1 Django Deployment Model

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

### 4.2 How Django Should Handle Workflow Executions

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

## 5. Exec-Worker Responsibilities (`/exec-worker`)

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

### 5.1 Exec-Worker Deployment Model

Current/expected deployment characteristics:

- The exec-worker is deployed separately from Django.
- It runs on **Google Cloud Run**.
- This separation lets execution scale independently from the Django control plane.
- Cloud Run is a better place for elastic execution workloads than the small Django VM.

Agents should design worker-facing changes with the expectation that:

- Worker instances may scale up/down independently.
- Requests/jobs may be concurrent.
- Long-running executions should not depend on Django keeping an open HTTP request alive.

### 5.2 Queue Placement

For Autosage, the queue mechanism belongs around the execution path between Django and the exec-worker.

Recommended model:

- Django acts as producer/orchestrator.
- A queue/broker carries execution jobs.
- The exec-worker consumes jobs asynchronously.

This is preferable to using Django as a long-lived synchronous caller of the worker for every execution.

## 6. Authentication: Clerk

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

## 7. Data Layer: Supabase DB

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

## 8. File/Object Storage: GCS

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

## 9. Current Deployment View

### 9.1 Frontend

- React application deployed separately from backend services.
- Uses Clerk for auth and calls the Django API.

### 9.2 Django Server

- Deployed on a Google Compute Engine VM.
- Current context suggests a small **e2-micro** instance.
- Suitable for control-plane/API responsibilities, not heavy job execution.

### 9.3 Exec-Worker

- Deployed on Google Cloud Run.
- Handles actual script/workflow execution.
- Can be scaled more independently than the Django VM.

### 9.4 Storage and Data

- Supabase DB for relational/application state.
- GCS for files and execution artifacts.

## 10. Concurrency and Scaling Model

Autosage is an execution platform, so concurrency design matters.

### 10.1 What to Optimize For

- Multiple users launching workflows at the same time.
- Long-running remote executions.
- Isolation between API traffic and execution traffic.
- Clear lifecycle tracking for every run.

### 10.2 Preferred Scaling Direction

Scale these independently:

- **Frontend/UI traffic** via the React deployment.
- **Control plane/API** via Django instances if needed.
- **Execution plane** via worker-side scaling and queue consumption.

If load balancing is introduced for Django, it should improve API concurrency but should not be treated as the main solution for execution load. Queue-based async execution is more important for Autosage’s architecture.

## 11. Guidance for Agents Making Changes

When modifying Autosage, agents should preserve these architectural boundaries:

### 11.1 Put logic in the right service

- Put product/business/orchestration logic in Django.
- Put execution/runtime/remote-script logic in exec-worker.
- Put UI logic in the React client.

### 11.2 Avoid architectural drift

Do **not**:

- Move long-running execution logic into Django request handlers.
- Store large artifacts directly in DB rows when GCS is available.
- Assume synchronous execution is acceptable for all workflow runs.
- Mix identity verification with authorization shortcuts.

### 11.3 Favor explicit lifecycle tracking

When building run/execution features, prefer explicit fields for:

- `status`
- `started_at`
- `finished_at`
- `error_message`
- `artifact_reference`
- `triggered_by`
- `execution_target`

### 11.4 Think in control plane vs execution plane

If a feature is about:

- policy, permissions, metadata, configuration, templates, workflow creation -> Django.
- job pickup, script runtime, shell/powershell/python execution, remote VM activity, streaming logs -> exec-worker.

## 12. Build, Lint, and Test Commands

### 12.1 Frontend (Client - JavaScript/TypeScript/React)

- **Location:** `/client`
- **Install Dependencies:** `npm install`
- **Build (Production):** `npm run build` or `vite build`
- **Build (Development):** `npm run build:dev` or `vite build --mode development`
- **Lint:** `npm run lint` or `eslint .`
- **Run a Single Test:** infer from repository setup if tests exist, for example:
  - `npx vitest <path/to/test-file.test.ts>`
  - `npx jest <path/to/test-file.test.ts>`

### 12.2 Python Backends (Server & Exec-Worker)

- **Locations:** `/server` and `/exec-worker`
- **Install Dependencies:** `pip install -r requirements.txt`
- **Lint:** `flake8 .` or `ruff check .`
- **Test:** `pytest`
- **Run a Single Test:** `pytest <path/to/test_file.py::test_function_name>`

### 12.3 Legacy Node.js Backend (`/server_v1`)

- **Install Dependencies:** `npm install`
- **Start Server:** `npm start` or `node server.js`
- **Development Server:** `npm run dev` or `nodemon server.js`
- **Lint:** `npm run lint` or `eslint .`
- **Lint (Fix):** `npm run lint:fix` or `eslint . --fix`
- **Test:** `npm test` or `jest`
- **Run a Single Test:** `npx jest <path/to/test-file.test.js>`

## 13. Code Style and Conventions

### 13.1 Naming Conventions

- **Variables and Functions:** `camelCase` for JavaScript/TypeScript, `snake_case` for Python.
- **Classes and Types:** `PascalCase`.
- **Constants:** `UPPER_SNAKE_CASE`.

### 13.2 Error Handling

- Handle errors gracefully and provide informative messages.
- Use `try-catch` in JavaScript/TypeScript.
- Use `try-except` in Python.
- Handle promise rejections and asynchronous failures explicitly.

### 13.3 Comments

- Explain complex logic and important design decisions.
- Focus comments on **why**, not just **what**.
- Keep comments concise and updated.

### 13.4 Frontend Code Style

- Absolute imports are preferred when configured.
- Follow ESLint rules.
- Use TypeScript interfaces/types explicitly.
- Use functional React components with hooks.
- Use Tailwind CSS as the primary styling approach.

### 13.5 Python Backend Code Style

- Prefer absolute imports.
- Organize imports by standard library, third-party, then local modules.
- Adhere to PEP 8.
- Use Python type hints.
- Use `snake_case` for variables, functions, and modules; `PascalCase` for classes.

### 13.6 Legacy Node Backend Style

- Use CommonJS `require()`.
- Follow ESLint rules.
- Use centralized Express error handling patterns where applicable.

## 14. Operational Notes for Future Agents

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

## 15. Cursor/Copilot Rules

No specific `.cursor/rules/` or `.github/copilot-instructions.md` files were found in this repository. Agents should rely on this document as the primary architecture and coding guidance unless more specific repository-local instructions are added later.
