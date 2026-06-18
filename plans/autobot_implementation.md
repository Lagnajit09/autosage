# Autobot — How We Built It

## What Autobot Is

Autobot is Autosage's built-in AI assistant. It is a standalone FastAPI service (Python 3.12, Uvicorn) that runs on the same OCI A1 VM as Django, routed by nginx at `/api/ai/*`. Users interact with it through a streaming chat interface in the Autosage web app. The assistant can read and write scripts and workflows, run them against real infrastructure, investigate failures, and help diagnose broken executions — all from a conversational interface.

---

## Architecture Principles We Locked In

Before writing any code we settled a few hard rules that govern every piece of the system:

**Django owns the schema.** Autobot never writes directly to Postgres. Every persistent state change (thread creation, message append, tool-call side effects) goes through Django's REST surface with the user's own Clerk JWT forwarded as Bearer. This means Django's per-user query scoping enforces tenant isolation automatically — no second auth layer needed in Autobot.

**Redis `/2` is hot-only.** Autobot uses `redis://redis:6379/2` for conversation context caches (7200s TTL), quota counters, and summarization metadata. Celery is on `/0`. Volatile-lru eviction means Autobot's TTL'd keys can evict each other but never Celery's queue items.

**JWT forwarding on every Django call.** No service-account elevation. Autobot is just another Clerk-authed client from Django's point of view.

**Chat SSE vocabulary is fixed.** The events `token`, `tool_call_start`, `tool_result`, `done`, `error` are the only chat events. We never added a new type — the rich execution panel streams from a *separate*, pre-existing Django SSE endpoint, leaving the chat stream untouched.

**All trigger sources converge on `enqueue_workflow_run()`.** This helper in `server/execution_engine/helpers/run_builder.py` is the single place that validates the DAG, masks secrets, persists `WorkflowRun` rows, and dispatches the Celery task. The Autobot path goes through it like every other trigger.

---

## v1 — The Chat Foundation

### Phase 0: Infrastructure

Before writing a single line of Autobot logic we brought dev parity to the local environment. The original dev setup used Upstash Redis and had no nginx — neither matched production. We added a local Redis service, added nginx to the dev compose stack, and configured both with the same `volatile-lru` + 1 GB memory policy as prod. This meant we could exercise SSE buffering, Redis eviction, and Celery queue behavior locally without surprises in production.

We also added the `autobot` compose service as a scaffold early — an empty FastAPI app at port 8030 joined to the `autosage-net` bridge — and wired the nginx `location /api/ai/` block to strip the prefix and proxy to it. This let us validate the nginx → Autobot path before any real functionality existed.

### Phase 1: Django Schema

We created the `server/autobot_api/` Django app to own all Autobot-related tables. This app is intentionally separate from the core execution engine — Autobot's persistence concerns (conversation threads, BYO LLM configs, usage analytics) are different from workflow execution concerns.

**Models added:**
- `LLMConfig` — BYO LLM provider config per user. Structured fields (`provider`, `model_name`, `api_version`, `base_url`, `system_instruction`) plus a Fernet-encrypted `api_key` (reusing the same `EncryptedCharField` from the vault app). One `is_default` per user enforced in the serializer. An explicit `POST /reveal/` endpoint decrypts and returns the key — mirrors the Vault credential reveal pattern.
- `Thread` — a conversation context. Carries `system_prompt_override` which *appends* to the base prompt under a fenced `## User customizations` block, never replaces it (losing the Autosage grounding would let the LLM hallucinate).
- `Message` — every turn, both user and assistant. Stores `prompt_tokens`, `completion_tokens`, `total_tokens`, `provider`, `model_name`, and later `is_byo` for analytics bucketing.
- `Summary` — a compacted representation of older history, persisted so cold-reload threads can skip raw message replay.
- `UserSettings` — per-user tone, language, expertise level, `custom_instructions`, and `default_llm_config_id`. The same append-only rule as `system_prompt_override`.

Rate limit scopes `autobot_burst` (30/min), `autobot_sustained` (500/day), and `autobot_message_create` (60/min) were added to `rate_limiters.py` and `settings.py`.

### Phase 2: Autobot Service Foundation

We rewrote the scaffold into a real service:

- `settings.py` — pydantic-settings env loader. All tunables (`AUTOBOT_MAX_TOOL_ROUNDS`, `AUTOBOT_CTX_TTL_SECONDS`, `AUTOBOT_CONTEXT_TARGET_RATIO`, `AUTOBOT_KEEP_LAST_N`, `AUTOBOT_ADMIN_DAILY_LIMIT`) come from environment variables.
- `auth.py` — Clerk JWKS verification as a FastAPI `Depends`. Fetches JWKS once and caches for 1 hour. Extracts `sub` + raw JWT. A logging filter strips any `Authorization:` substring before emit to block JWT leakage in logs.
- `conversation/persistence.py` — httpx client wrapping all `/api/autobot/*` calls to Django, with the user's Bearer forwarded on every request.
- `conversation/cache.py` — aioredis client on DB `/2`. Thread context get/set/invalidate with TTL refresh on access.

### Phase 3: LLM + Streaming Chat

The chat loop lives in `routers/chat.py`. The flow per turn:

1. Verify JWT → `user_sub` + `raw_jwt`.
2. POST the user message to Django — this is also the authorization check (Django 404s on a thread the caller doesn't own, no pre-fetch needed).
3. `asyncio.gather(get_thread, get_history)` in parallel — one round-trip to fetch both.
4. Hydrate hot context from Redis, or build it from the history if the key is cold.
5. Pre-compaction: `tool` messages over 2 KB are collapsed to one-line digests in the in-memory context (raw payloads stay in Postgres). This defers summarization 5–10 turns.
6. Tiktoken count. If above `AUTOBOT_CONTEXT_TARGET_RATIO × context_window`, run `conversation/summarizer.py`: LLM-summarize all-but-the-last-N messages into a `system`-role block, persist a `Summary` row, replace those messages in-context.
7. Resolve the LLM client via `llm/client.py::resolve_for_thread`. BYO: one decrypt call per request, plaintext key never cached. Admin: try providers from `AUTOBOT_ADMIN_FALLBACKS` in order on retryable errors.
8. Stream deltas as `event: token`. On tool calls: emit `event: tool_call_start`, dispatch the tool (httpx → Django, timeout + error normalization), emit `event: tool_result`, loop. Hard cap `AUTOBOT_MAX_TOOL_ROUNDS=10`.
9. After the final assistant message: persist to Django with token counts, refresh Redis cache, emit `event: done`.

**Admin pool resilience (two tiers):**
- Tier 1 (inside OpenRouter): inject `extra_body={"models": [...], "route": "fallback"}` so OpenRouter tries multiple free models server-side in a single request.
- Tier 2 (autobot's chain): if the primary provider errors retryably, try each entry in `AUTOBOT_ADMIN_FALLBACKS` — round-1 only, before any token is streamed.
- Per-user daily quota: `AUTOBOT_ADMIN_DAILY_LIMIT` tracked in Redis at `autobot:admin_quota:<sub>:<yyyymmdd>` (26h TTL). Ticks once per turn, not per tool round. BYO turns don't tick. Redis errors fail-open.

### Phase 3: Tools (v1)

Tool definitions are JSON Schema objects in `autobot/llm/tools.py`. Implementations are in `autobot/tools/*.py`. Side-effect imports in `tools/__init__.py` register each module into the global registry on startup.

v1 tools:
- `list_scripts`, `read_script`, `create_script`, `update_script` — thin httpx wrappers around `/api/scripts/`.
- `list_workflows`, `read_workflow`, `create_workflow`, `update_workflow` — same pattern against `/api/workflows/`.
- `list_vault_resources` — metadata only. Returns vault/server/credential ids and names, never secret values. The LLM references auth material by id.

Every tool wrapper: validates inputs against its JSON schema, calls Django with the forwarded JWT, catches non-2xx and returns `{"error": "..."}` (LLM self-corrects rather than crashing the turn), and 30s timeout.

### Phase 4: Frontend Wiring

The SPA chat surface was already scaffolded with mock data. We replaced the hardcoded state:

- `client/src/lib/api/autobot.ts` — thread CRUD, settings, LLM config, dashboard helpers, and `streamMessage()`. Uses `fetch()` + manual SSE frame parsing (not `EventSource` — EventSource can't send the Bearer token).
- `Chat/Interface.tsx` wired to real thread state, streaming tokens, and tool-call inline badges.
- `Chat/History.tsx` wired to `listThreads`.
- `Chat/CustomizeModal.tsx` wired to `getSettings` / `patchSettings`.
- `AIScriptGenerator.tsx` and `AIWorkflowGenerator.tsx` repointed from the dead `localhost:3001` legacy backend to open a pre-filled Autobot thread with the relevant tool restricted.

### Phase 4a: Usage Dashboard + Archived Chats

We surfaced the token data we were already collecting:

- `Message.is_byo` field added — necessary because provider names overlap between BYO and admin-pool calls, so you can't distinguish them post-fact from `provider` alone.
- `GET /api/autobot/dashboard/` Django endpoint aggregates message rows into three time buckets (today / last 7d / all-time), splitting admin vs BYO token counts.
- `GET /api/ai/dashboard/` Autobot proxy merges the Django aggregation with the live Redis quota counter.
- `AutobotDashboard.tsx` page renders the three buckets, a quota progress bar (amber at 80%, red at 100%), and a recharts bar chart of model usage.
- Thread archive: `patchThread({ is_archived: true })` from the row menu. Archived threads render a non-dismissible banner with an inline Unarchive button and a disabled `ChatInput`. `/ai/autobot/archived` page (not in LeftNav — reached via the dashboard) lists them with Unarchive/Delete options.

---

## v2 Pillar B — Execution Copilot

The v1 system could *generate* scripts and workflows but couldn't *run* them. v2 Pillar B adds the execution surface: running, watching, investigating, fixing, and re-running from chat.

### The Core Architectural Decision

The RunPanel streams from the **pre-existing** workflow-run SSE endpoint (`GET /api/execution-engine/workflows/runs/<id>/stream/`), not from the chat SSE. The `run_workflow` tool returns `{run_id, kind:"workflow", watch_url}` in its `tool_result`. The chat client, seeing `kind:"workflow"`, mounts a `RunPanel` that opens its own SSE connection to that watch URL — independent of the chat stream. This meant we needed zero new chat events and could reuse the entire existing streaming infrastructure.

### Django Changes

**New `trigger_source="autobot"`** added to `WorkflowRun.TRIGGER_SOURCE_CHOICES`. The run endpoint's serializer restricts `trigger_source` to `{manual, autobot}` — a forged `"http"` or `"schedule"` value returns 400.

**Dedup guard** (`WorkflowRunIdempotencyKey` table, `unique(user, workflow, key)`). We rejected a Redis lock (weaker guarantee, extra round-trip on cost-billed Upstash, Postgres is the system of record). Instead we mirror the HTTP-trigger dedup pattern: optional `Idempotency-Key` header on the manual run endpoint, backed by a DB unique constraint. Race-safe via `IntegrityError` catch. The Autobot path always sends a key (the per-tool-call id); the builder Run button sends none and is unaffected.

**Script async endpoint** (`POST /api/execution-engine/run/async/`). We extracted shared helpers `resolve_run_targets` and `build_worker_payload` out of the existing streaming `execute_script` view into `helpers/script_execution/utils.py`, then built the async sibling that reuses them. A fire-and-forget Celery task drains the stream and discards SSE frames. Returns `202 { execution_id, status:"pending" }`. No live token streaming for chat-initiated scripts — the chat shows a static summary card with a status poll.

**Rerun endpoint** (`POST /api/execution-engine/workflows/runs/<run_id>/rerun/`). Fetches the prior run user-scoped, re-enqueues the same workflow via `enqueue_workflow_run`. Optional `inputs` override; otherwise reuses prior inputs. Hardcodes `trigger_source="autobot"`.

### Mode Hard-Floor

Execution tools must not be reachable in non-execution modes. We added `_MODE_ALLOWED_TOOLS` to `prompts.py` (mirroring the existing `_PANEL_ALLOWED_TOOLS` pattern) composed from named frozensets:

- `research` → read tools only (includes investigation tools).
- `generation` → read + write tools, no execution.
- `execution` → read + write + exec tools.

`_effective_allowed_tools(mode, panel)` in `chat.py` intersects the mode floor with the panel floor. This computed value is passed to both `get_tool_schemas` (advertise) and `dispatch_tool` (dispatch re-check). Double enforcement: the LLM can't be offered a hallucinated tool, and even if it somehow constructs one, dispatch refuses it.

**Execution mode is BYO-only.** `_execution_mode_blocked(mode, is_admin)` in `chat.py` checks upfront — before any LLM call or quota tick — whether the current turn is using a shared/admin key. If so, the streaming endpoint emits `event: error code=execution_requires_byo`. The client hides the execution mode button for non-BYO users so they never reach the refusal.

### Investigation Tools

Three read-only tools that are safe in both `research` and `execution` modes:

- `get_execution_histories` — paginated unified history; always sends `page`/`page_size` so the unbounded full-list branch never fires; strips signed URLs.
- `get_workflow_run` — merges run detail with per-node data (`GET .../workflows/runs/<id>/` + `.../nodes/`). This is the "which node failed and why" entry point.
- `get_script_run` — script execution status.
- `read_run_logs` — the investigation workhorse. Resolves the signed GCS URL server-side, fetches the log text via a raw no-JWT httpx GET, tails each stream to ~6 KB with a truncation marker. The model gets text, never a URL. Auto-selects the failed node when no `node_id` is specified.

### Execution Tools

Four tools gated to `execution` mode only:

- `preview_workflow_run` — side-effect-free. Reads the workflow, computes targets, masks password params, flags unresolvable secrets. Returns `{name, node_count, targets, inputs_preview, ready, blocking, needs_params}`. No enqueue.
- `run_workflow` — ticks exec quota before POSTing; sends `trigger_source:"autobot"` + `Idempotency-Key`; drops password inputs (Layer-2). Returns `{run_id, kind:"workflow", watch_url}` for normal workflows, or `{status:"awaiting_secret", run_intent_id}` for workflows needing a runtime password.
- `run_script` — validates all four bindings (script id + vault/server/credential UUIDs) before calling the async endpoint; masks secret-looking input keys by name heuristic (scripts have no password-type schema, so we use key names: `password`, `passwd`, `pwd`, `secret`, `token`, `api_key`…).
- `rerun_workflow` — thin: ticks quota, POSTs to `/rerun/` with an Idempotency-Key, forwards optional inputs override.

**Exec quota**: `autobot:exec_quota:<sub>:<yyyymmdd>` in Redis (26h TTL, fail-open). Separate from the LLM admin quota so BYO users (uncapped LLM) are still bounded on real compute. `AUTOBOT_EXEC_DAILY_LIMIT` in env.

**ToolContext ContextVar**: `{user_sub, tool_call_id}` threaded into every tool call via a ContextVar set in `dispatch_tool`. Used by `run_workflow` to read the per-tool-call id for the `Idempotency-Key` header, and by `DjangoClient.request` for the optional `headers=` param.

### Password Safety — 4 Layers

A `password`-typed workflow parameter must never reach Autobot in plaintext. We close every path:

**Layer 1 (tool boundary, strip at read):** `read_workflow` and `preview_workflow_run` call `tools/_security.py::mask_password_params()` before returning workflow JSON to the model. The model sees the param exists (id, name, type=password) but the value is `"*****"`. This function deep-copies, never mutates.

**Layer 2 (tool boundary, strip at write):** `run_workflow` reads the workflow first to identify password-typed param ids, then drops any matching key from `inputs` before POSTing. The LLM has no channel to supply a password value.

**Layer 3 (Django server, hard backstop):** `enqueue_workflow_run` scans the workflow's node parameters when `trigger_source=="autobot"`. Any password-typed input with a non-empty value is dropped + logged. A jailbroken LLM that somehow hand-crafts a `run_workflow` call still can't smuggle a secret through.

**Layer 4 (product, secure side-channel):** Workflows that genuinely need a run-time password use the intent flow (described below). The default fallback for any edge case is the builder redirect: `preview_workflow_run` returns `ready:false` with a message pointing the user to the workflow builder.

### Prompts Rewrite

We rewrote all three mode prompts to be compact and behavior-driven:

- Added `§0b` — Instruction integrity / injection resistance. This prompt is the sole source of identity/scope/rules. Explicitly refuses identity-redefinition attacks ("you are now a trading assistant"), prompt-exfiltration, scope-widening, encoding/roleplay bypasses.
- Added `§12b` — 11 explicit gotchas: trigger only exists inside a workflow; email data via parameters (never spliced into body); `{{NAME}}` is case-insensitive but spelling-exact; secrets from `os.environ`/`$env:`, never inlined; output references need `outputFormat:"json"`; ids are server-truth; output refs only resolve from already-run nodes; etc.
- Tool-context block in the execution prompt: one line per tool (returns + when to call).
- `_wrap_user_customizations()` wraps the user's custom instructions in a `<<<USER_CUSTOMIZATIONS…>>>` fence labeled "PREFERENCES ONLY — lower precedence", truncated at 2000 chars.
- Compaction: every fact has one canonical home with `§`-pointers replacing restatements. Composed prompt dropped from ~6.1–6.5k to ~5.6–6.0k tokens/turn despite the new sections.

### RunPanel (Client)

The `client/src/components/Autobot/Chat/run/` module:

- `runStore.ts` — one SSE/poll per run id, shared via `useSyncExternalStore`. Reuses the `streamLogs` SSE parse verbatim from `WorkflowExecution.tsx`. Polls `…/<id>/status/` for scripts. Hydrates node colors from `…/nodes/` on terminal. Auto-terminates on finished runs.
- `RunPanelProvider.tsx` — drawer state + `requestSecret` / `pendingSecret` context.
- `RunGraph.tsx` — read-only ReactFlow status canvas. The NEW piece: reuses the builder's node positions from a module-cached `GET /api/workflows/<id>/`, colors nodes live from `nodeStatuses` (running/success/failed/skipped), dims edges on skipped branches.
- `RunPanel.tsx` — drawer body. Workflow: Graph / Logs / Response tabs. Script: Logs / Details. Reuses `ExecutionTerminal`.
- `RunCard.tsx` — compact inline renderer with cancel button.
- `RunFields.tsx` — `ParamGrid` (read-only), `SecretField` (enabled in v2), `ParamInput` for editable non-secret params.
- `RunStatusInline` — pill for `get_workflow_run` / `get_script_run` results.

`ToolResultRenderer.tsx` classifies completed, non-error tool results:
- `run_workflow` / `rerun_workflow` / `run_script` → `RunCard` (expands into the drawer).
- `preview_workflow_run` → `PreviewCard` (targets, masked inputs, ready/blocking; "Run it now" prefills the composer — confirmation is its own turn).
- `get_workflow_run` / `get_script_run` → `RunStatusInline` pill.
- `get_execution_histories` → selectable list; row click seeds "investigate `<kind>` run `<id>`".
- `awaiting_secret` state → `AwaitingSecretCard`.
- Everything else (and errors, in-flight calls) → plain `ToolCallBadge`.

History rehydration: `role=tool` messages are parsed into a `tool_call_id → result` map so past runs re-render as RunCards (reconnecting their stream if the run is still live).

**Failure-investigation loop.** The execution prompt directs the model: after a run finishes failed, call `get_workflow_run` (which node, exit code) → `read_run_logs` (GCS stderr text) → diagnose in plain language → propose ONE fix → `update_script` / `update_workflow` → `rerun_workflow` ONCE → ask if still failing. The "rerun ONCE" cap prevents ping-pong; the exec quota bounds total compute even in a loop.

---

## v2 Pillar B — Secure Password Side-Channel

The last major piece: letting a user run a password-requiring workflow from chat without the secret ever touching Autobot.

### The Problem

Autobot's Layer-4 default was a builder redirect: `preview_workflow_run` returns `ready:false, blocking:[..."run this one from the builder"]`. Safe, but breaks the user out of the chat context.

### The Solution

A separate execution path where the secret travels **browser → Django over TLS** only. Autobot only ever holds a `run_intent_id`.

**Backend — two new endpoints:**

`POST /api/execution-engine/workflows/<id>/run/intent/` (autobot path): creates a `WorkflowRunIntent` row (no `WorkflowRun` yet). Stores only the non-secret inputs the model proposed. Strips any password inputs at creation time (defense in depth). Sets `expires_at = now + 5 min`. Returns `{ run_intent_id, needs_params: [...] }` — the full param list for the confirmation form.

`POST /api/execution-engine/workflows/runs/intents/<id>/fulfill/` (browser path, secret-carrying): Clerk-authed, owner-scoped. Validates `is_valid()` (not fulfilled, not expired). Accepts `{ params: { param_id: value } }` from the browser. Merges intent inputs with browser params (browser is authoritative). Calls `enqueue_workflow_run(..., trigger_source="manual")` — `"manual"` is the crux: the Layer-3 drop does NOT fire because the secret came from the user's browser, not the model. Marks intent `fulfilled_at`. Returns `{ workflow_run_id, status }`. Reuses the `Idempotency-Key` guard so a double-submit collapses to one run.

**Model: `WorkflowRunIntent`** — `id (uuid)`, `user`, `workflow`, `inputs (JSON, non-secret)`, `send_email`, `notification_email`, `created_at`, `fulfilled_at`, `expires_at`. Helper `is_valid()`. Single-use (fulfilled intents return 409, expired return 410).

**Tool layer changes:**

`preview_workflow_run` extended to return `needs_params: [{param_id, name, type, has_default, is_secret, source}]` — the full param description for the form.

`run_workflow` on a param workflow: instead of refusing or running blind, calls the create-intent endpoint and returns `{kind:"workflow", status:"awaiting_secret", run_intent_id, needs_params}`. A no-param workflow keeps the direct-enqueue fast path. Exec quota is ticked at `run_workflow` time (when the intent is created), not on fulfill — the fulfill endpoint has no Autobot context to read the quota from.

**Client — `SecretForm.tsx`:**

A panel positioned `bottom-full` above the chat input box (same position as the `@`-menu), styled to match the composer. One row per param:
- `type==="password"` → real `<input type=password>` (the now-enabled `SecretField`).
- `source==="output"` (node-reference) → read-only chip labeled "from previous node".
- Else → editable input pre-filled with defaults.

"Run securely" submit POSTs directly to the fulfill endpoint using a **raw `fetch`** (NOT `apiRequest`). This is deliberate: `apiRequest` runs `sanitizeInput` on the body, which would escape or strip a password value. The raw `fetch` carries the Clerk JWT in `Authorization` and `Idempotency-Key: <runIntentId>`.

On 202: `onSubmitted(workflow_run_id, "workflow")` opens the RunPanel drawer watching the new run. The secret value lives only in the browser → Django request body, never in Autobot's memory or the conversation thread.

`Interface.tsx` captures `pendingSecret` state when a `tool_result` has `status==="awaiting_secret"`. Renders `<SecretForm>` at the composer. `onCancel` clears the state. Only one pending form at a time.

`ToolResultRenderer` adds an `AwaitingSecretCard` in the bubble: "This run needs your confirmation — fill the form below the message box."

**Security invariant:** The secret travels **browser → Django over TLS only**. It never enters the Autobot service. Autobot polls status by `run_id` only.

---

## What Autobot Can Do Today

| Capability | How |
|---|---|
| Multi-turn streaming chat | SSE, LiteLLM, tiktoken-based summarization |
| BYO LLM key | `LLMConfig` model, Fernet-encrypted, reveal-only endpoint |
| Admin pool fallback | OpenRouter server-side cascade + autobot-level provider chain |
| Per-user admin quota | Redis counter, fail-open |
| Script CRUD from chat | `create_script`, `update_script`, `read_script`, `list_scripts` |
| Workflow CRUD from chat | `create_workflow`, `update_workflow`, `read_workflow`, `list_workflows` |
| Vault metadata lookup | `list_vault_resources` (ids/names only) |
| Run a workflow | `run_workflow` — async, dedup, exec quota, password-safe |
| Run a script | `run_script` — fire-and-forget async, exec quota |
| Rerun a failed workflow | `rerun_workflow` — idempotent, whole-workflow |
| Live RunPanel (workflows) | ReactFlow graph + logs drawer, independent SSE |
| Script run status | `run_script` card, poll-based |
| Investigate past runs | `get_execution_histories`, `get_workflow_run`, `get_script_run` |
| Read log content | `read_run_logs` — fetches GCS text server-side, tails to 6 KB |
| Failure-investigation loop | automatic post-failure offer: diagnose → fix → rerun |
| Password-safe execution | 4-layer guarantee; secure browser→Django side-channel for runtime secrets |
| Usage dashboard | today/7d/all-time token counts, admin vs BYO split, quota tile |
| Archived chats | archive/unarchive, read-only banner, dedicated page |

---

## What's Next

**Pillar A — Docs RAG + Docusaurus embed:** pgvector in Supabase, a `search_docs` tool, a public (no-Clerk) docs chat SSE endpoint, and an embedded Autobot widget on the Docusaurus documentation site. Not started.

**v3 — Cloud infrastructure tools:** AWS/Ansible/Vault cloud-secret types + new exec-worker executors. Requires new Vault credential types designed deliberately; separate track.
