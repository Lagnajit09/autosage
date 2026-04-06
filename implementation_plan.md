# Async Workflow Execution with Celery + Redis

## Background & Goal

Autosage already supports executing **individual scripts** via the `execution_engine` app (Django → exec-worker SSE stream). The goal is to extend this to execute **entire workflows** — where a workflow is a directed acyclic graph (DAG) of script nodes connected by edges.

Execution must be:
- **Fully asynchronous** — Django returns immediately after queuing
- **DAG-aware** — nodes execute in topological order; parallel-ready independent nodes
- **Resilient** — per-node status tracking, full audit trail
- **Observable** — frontend can poll or stream per-node progress in real time

---

## Queue Recommendation: Redis (via Celery)

> [!IMPORTANT]
> **Recommended broker: Redis**
>
> - The exec-worker already has `redis==7.2.0` and `aioredis==2.0.1` installed — it's already part of the stack.
> - Redis is **free and open-source**. Use Redis Cloud free tier (30 MB) or self-host via Docker.
> - Celery + Redis is the industry-standard Django async task stack — battle-tested, excellent documentation, no vendor lock-in.
> - Alternatives considered: RabbitMQ (heavier, more ops), Google Cloud Tasks (vendor-locked), Google Cloud Pub/Sub (more complex, overkill here).

---

## System Architecture

```
React Client
  │
  ▼  POST /api/workflows/{id}/run/
Django (Control Plane)
  │  1. Parse nodes+edges → NetworkX DAG
  │  2. Topological sort → execution order
  │  3. Create WorkflowRun (status: queued)
  │  4. Create WorkflowNodeRun per node (status: pending)
  │  5. Enqueue Celery task → Redis
  │  6. Return { workflow_run_id } immediately
  ▼
Redis (Broker)
  │
  ▼  Celery Worker (Django Celery process)
  │  For each node in topological order:
  │    a. Mark WorkflowNodeRun → running
  │    b. POST to exec-worker /api/worker/execute
  │    c. Consume NDJSON stream → collect logs
  │    d. Upload logs to GCS
  │    e. Mark WorkflowNodeRun → success | failed
  │    f. If fail_on_error: abort remaining nodes
  │  Finally: Mark WorkflowRun → success | failed
  ▼
exec-worker (Execution Plane — unchanged)
  │  Executes the script on the target VM
  │  Streams NDJSON (stdout/stderr/exit_code)
  ▼
GCS (Log Storage)
  │  Per-node stdout/stderr logs stored at
  │  executions/{user_id}/workflow-runs/{run_id}/nodes/{node_id}/…

React Client (polling)
  GET /api/workflows/runs/{run_id}/          → WorkflowRun status
  GET /api/workflows/runs/{run_id}/nodes/    → all WorkflowNodeRun statuses + log URLs
```

---

## Proposed Changes

### Phase 1 — Database Models

---

#### [MODIFY] [models.py](file:///d:/codingISFun/autogen/server/workflows/models.py)

Add two new models to the `workflows` app:

**`WorkflowRun`** — top-level workflow run record:
```python
class WorkflowRun(models.Model):
    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('success', 'Success'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]
    id              = UUIDField(primary_key=True)
    workflow        = ForeignKey(Workflow, on_delete=CASCADE)
    user            = ForeignKey(AUTH_USER_MODEL, on_delete=CASCADE)
    status          = CharField(choices=STATUS_CHOICES, default='queued')
    celery_task_id  = CharField(max_length=255, blank=True)  # Celery task ID for revocation
    vault_id        = UUIDField()      # snapshot of which vault/server to use
    server_id       = UUIDField()
    credential_id   = UUIDField()
    inputs          = JSONField(default=dict)   # global workflow inputs
    error_message   = TextField(blank=True)
    started_at      = DateTimeField(null=True)
    finished_at     = DateTimeField(null=True)
    created_at      = DateTimeField(auto_now_add=True)
    db_table        = "workflow_runs"
```

**`WorkflowNodeRun`** — per-node execution record:
```python
class WorkflowNodeRun(models.Model):
    STATUS_CHOICES = [('pending','Pending'),('running','Running'),
                      ('success','Success'),('failed','Failed'),('skipped','Skipped')]
    id              = UUIDField(primary_key=True)
    workflow_run    = ForeignKey(WorkflowRun, related_name='node_runs', on_delete=CASCADE)
    node_id         = CharField(max_length=255)  # matches node.id in the JSON graph
    node_label      = CharField(max_length=255)
    script_id       = UUIDField(null=True)
    status          = CharField(choices=STATUS_CHOICES, default='pending')
    execution_order = IntegerField()             # topological position
    stdout_log_url  = URLField(blank=True)
    stderr_log_url  = URLField(blank=True)
    logs_url        = URLField(blank=True)
    exit_code       = IntegerField(null=True)
    error_message   = TextField(blank=True)
    started_at      = DateTimeField(null=True)
    finished_at     = DateTimeField(null=True)
    db_table        = "workflow_node_runs"
```

#### [NEW] Migration file
Auto-generated via `python manage.py makemigrations workflows`.

---

### Phase 2 — DAG Engine

---

#### [NEW] [graph.py](file:///d:/codingISFun/autogen/server/workflows/graph.py)

Pure utility module — no Django dependencies, easily testable.

```python
import networkx as nx
from typing import List, Dict, Any

def build_dag(nodes: List[Dict], edges: List[Dict]) -> nx.DiGraph:
    """
    Convert workflow nodes+edges JSON → a NetworkX DiGraph.
    Raises ValueError if the graph has cycles (not a DAG).
    """
    G = nx.DiGraph()
    for node in nodes:
        G.add_node(node['id'], **node)
    for edge in edges:
        G.add_edge(edge['source'], edge['target'])
    if not nx.is_directed_acyclic_graph(G):
        raise ValueError("Workflow graph contains a cycle — cannot execute.")
    return G

def topological_order(G: nx.DiGraph) -> List[str]:
    """Return node IDs in topological execution order."""
    return list(nx.topological_sort(G))

def validate_all_nodes_have_scripts(nodes: List[Dict]) -> List[str]:
    """Return list of node IDs missing a script binding."""
    return [n['id'] for n in nodes if not n.get('data', {}).get('script_id')]
```

Key library: **NetworkX** (already widely used in Python ecosystems, MIT license, pip install networkx).

---

### Phase 3 — Celery Setup

---

#### [NEW] [celery.py](file:///d:/codingISFun/autogen/server/server/celery.py)

```python
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings')

app = Celery('autosage')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
```

#### [MODIFY] [settings.py](file:///d:/codingISFun/autogen/server/server/settings.py)

Add Celery + Redis configuration block:
```python
# Celery / Redis
CELERY_BROKER_URL        = env('CELERY_BROKER_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND    = env('CELERY_RESULT_BACKEND', default='redis://localhost:6379/0')
CELERY_ACCEPT_CONTENT    = ['json']
CELERY_TASK_SERIALIZER   = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE          = 'UTC'
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_SOFT_TIME_LIMIT = 3600   # 1 hour per workflow
CELERY_TASK_TIME_LIMIT      = 7200   # hard kill after 2 hours
```

#### [MODIFY] [__init__.py](file:///d:/codingISFun/autogen/server/server/__init__.py)

```python
from .celery import app as celery_app
__all__ = ('celery_app',)
```

---

### Phase 4 — Celery Task (Workflow Executor)

---

#### [NEW] [tasks.py](file:///d:/codingISFun/autogen/server/workflows/tasks.py)

This is the **heart** of the implementation. The Celery task:

1. Loads the `WorkflowRun` and its parent `Workflow`
2. Builds the DAG via `graph.py`
3. Iterates nodes in topological order
4. For each node: calls exec-worker (`/api/worker/execute`), consumes the NDJSON stream synchronously (httpx sync client in the Celery worker), collects logs, uploads to GCS, updates `WorkflowNodeRun`
5. Marks `WorkflowRun` final status

```python
@shared_task(bind=True, name='workflows.execute_workflow')
def execute_workflow(self, workflow_run_id: str):
    """
    Celery task — runs in the Celery worker process (not Django request cycle).
    Executes each node of the workflow in DAG order.
    """
    # 1. Load run + workflow
    # 2. Build DAG, topological sort
    # 3. For each node_id in order:
    #      a. Look up script, server, credential from node data + run snapshot
    #      b. Mark WorkflowNodeRun → running
    #      c. Call exec-worker (sync httpx stream)
    #      d. Collect stdout/stderr, upload to GCS
    #      e. Mark WorkflowNodeRun → success | failed
    #      f. If failed and fail_fast=True: mark remaining as skipped, break
    # 4. Mark WorkflowRun final status
    # Error handling: wrap in try/except, use self.retry() for transient failures
```

> [!NOTE]
> The Celery task uses **synchronous** `httpx.Client` (not async) because Celery workers are synchronous by default. The exec-worker streaming call collects the full NDJSON stream before moving to the next node.

---

### Phase 5 — Django API Endpoints

---

#### [NEW] [workflow_run_views.py](file:///d:/codingISFun/autogen/server/workflows/workflow_run_views.py)

New REST endpoints for workflow execution lifecycle:

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `/api/workflows/{id}/run/` | Trigger a workflow run (returns immediately) |
| `GET` | `/api/workflows/runs/` | List all workflow runs for the user |
| `GET` | `/api/workflows/runs/{run_id}/` | Get WorkflowRun status + metadata |
| `GET` | `/api/workflows/runs/{run_id}/nodes/` | Get all WorkflowNodeRun statuses |
| `POST` | `/api/workflows/runs/{run_id}/cancel/` | Revoke the Celery task (cancel run) |

**POST `/api/workflows/{id}/run/`** flow:
```
1. Validate user owns workflow
2. Validate nodes+edges form a valid DAG (graph.py)
3. Validate all nodes have script_id, server and credentials specified
4. Create WorkflowRun (status=queued)
5. Create WorkflowNodeRun for each node (status=pending, execution_order=topo_index)
6. task = execute_workflow.delay(str(workflow_run.id))
7. workflow_run.celery_task_id = task.id; workflow_run.save()
8. Return {workflow_run_id, status: 'queued'}
```

#### [MODIFY] [urls.py](file:///d:/codingISFun/autogen/server/workflows/urls.py)

Add new URL patterns for the run endpoints.

#### [MODIFY] [serializers.py](file:///d:/codingISFun/autogen/server/workflows/serializers.py)

Add `WorkflowRunSerializer` and `WorkflowNodeRunSerializer`.

---

### Phase 6 — Node Data Schema (Frontend + Backend Agreement)

---

> [!IMPORTANT]
> Each node in `Workflow.nodes` JSONField must carry execution metadata. The frontend workflow builder must save nodes with this structure:

```json
{
  "id": "node-1",
  "type": "scriptNode",
  "data": {
    "label": "Run deployment script",
    "script_id": "uuid-of-script",
    "script_name": "deploy.sh",
    "pathname": "scripts/user_id/deploy.sh",
    "url": "https://storage.googleapis.com/bucket/…"
  },
  "position": { "x": 100, "y": 200 }
}
```

The `WorkflowRun` request body must include:
```json
{
  "vault_id": "uuid",
  "server_id": "uuid",
  "credential_id": "uuid",
  "inputs": {}
}
```
(Server + credential are applied globally to all nodes for now; per-node overrides can be Phase 2.)

---

### Phase 7 — Frontend Updates

---

#### [MODIFY] [WorkflowExecution.tsx](file:///d:/codingISFun/autogen/client/src/pages/WorkflowExecution.tsx)

Currently shows workflow details statically. Update to:

1. **"Run Workflow" button** → `POST /api/workflows/{id}/run/` with vault/server/credential selection
2. **Run status panel** — polls `GET /api/workflows/runs/{run_id}/` every 2 seconds while status is `queued` or `running`
3. **Node progress list** — polls `GET /api/workflows/runs/{run_id}/nodes/` to show per-node status with icons (⏳ pending, ▶️ running, ✅ success, ❌ failed, ⏭️ skipped)
4. **Log viewer** — clicking a node opens its stdout/stderr log URL
5. **Cancel button** — `POST /api/workflows/runs/{run_id}/cancel/`

---

### Phase 8 — Infrastructure Updates

---

#### [MODIFY] [requirements.txt](file:///d:/codingISFun/autogen/server/requirements.txt)

Add:
```
celery==5.3.6
redis==5.0.3
networkx==3.2.1
```

#### [MODIFY] [docker-compose.yml](file:///d:/codingISFun/autogen/docker-compose.yml)

Add Redis service + Celery worker service:
```yaml
redis:
  image: redis:7-alpine
  ports: ["6379:6379"]

celery-worker:
  build: ./server
  command: celery -A server worker --loglevel=info --concurrency=4
  environment:
    - CELERY_BROKER_URL=redis://redis:6379/0
  depends_on: [redis, django]
```

#### [MODIFY] [cloudbuild.yaml](file:///d:/codingISFun/autogen/cloudbuild.yaml)

Add a build step for the Celery worker Docker image (separate deployment target or co-deployed with Django on Compute Engine).

#### [MODIFY] [.env.server](file:///d:/codingISFun/autogen/.env.server)

Add:
```
CELERY_BROKER_URL=redis://<redis-host>:6379/0
CELERY_RESULT_BACKEND=redis://<redis-host>:6379/0
```

---

## Open Questions

> [!IMPORTANT]
> **Q1: Per-node server/credential OR global?**
> Current plan: one server+credential applies to ALL nodes in a run. Should individual nodes be able to target different servers? This affects both the node schema and the `WorkflowRun` model.

> [!IMPORTANT]
> **Q2: Parallel node execution?**
> The initial plan executes nodes strictly sequentially (topological order). NetworkX can identify nodes with no remaining dependencies that can run in parallel. Do you want parallel execution for independent branches in the DAG?

> [!NOTE]
> **Q3: Fail-fast vs continue-on-error?**
> Should a failed node abort the rest of the workflow, or should independent downstream nodes still run? Initial plan: fail-fast (stop on first failure). Should this be configurable per workflow?

> [!NOTE]
> **Q4: Redis hosting?**
> For DEV: Docker Redis (already in docker-compose). For PROD on GCP: Use **Memorystore for Redis** (Google's managed Redis — has a small free-tier equivalent on Basic tier) or Redis Cloud free tier (30 MB). Which do you prefer?

---

## Verification Plan

### Automated Tests
- `pytest server/workflows/tests/test_graph.py` — DAG construction, cycle detection, topo sort
- `pytest server/workflows/tests/test_tasks.py` — mock exec-worker, verify node run state transitions
- `pytest server/workflows/tests/test_run_views.py` — API endpoint integration tests

### Manual Verification
1. Start Redis + Celery worker locally (`celery -A server worker --loglevel=debug`)
2. Create a 3-node workflow in the UI (A → B → C)
3. Hit "Run Workflow" — confirm immediate response with `workflow_run_id`
4. Poll `/runs/{run_id}/nodes/` — verify nodes transition: `pending → running → success`
5. Check GCS for uploaded logs per node
6. Test failure: use a script that exits with code 1 — confirm node fails, run fails, remaining nodes skipped

### Migration
```bash
python manage.py makemigrations workflows
python manage.py migrate
```
