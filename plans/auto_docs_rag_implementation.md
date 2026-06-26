# Autosage Docs RAG + Docusaurus Assistant — Implementation (Pillar A)

End-to-end record of how the public, no-login documentation assistant
("Ask Autobot") was built. It answers questions grounded in the Autosage
documentation using retrieval-augmented generation (RAG), and is embedded as an
expandable side panel on the Docusaurus docs site.

This document is general context — it describes architecture and steps, not
secrets, keys, hostnames, or credentials. All sensitive values live only in env
files / CI secrets and are referenced here by name.

---

## 1. Goal & shape

A visitor on the public docs site can open a chat panel and ask "how do I create
a workflow trigger?". The assistant retrieves the most relevant documentation
passages and answers from them, citing source links. No login, no Clerk, no user
account — it is the first and only unauthenticated surface on the AI backend, so
it is bounded on every axis.

Two repositories are involved:

- **`autosage/`** — the backend monorepo: Django (`server/`) and the FastAPI AI
  service "autobot" (`autobot/`).
- **`autosage-docs/`** — the Docusaurus documentation site (sibling repo).

### High-level flow

```
Docusaurus site (public)
  └─ "Ask Autobot" panel ──HTTPS──▶ nginx ──▶ autobot
                                              POST /api/ai/docs/chat/stream/   (PUBLIC, throttled)
                                                ├─ Redis: anonymous session history (TTL)
                                                ├─ admin LLM chain (one tool only: search_docs)
                                                └─ search_docs ──(internal secret, no user token)──▶ Django
                                                                  POST /api/autobot/docs/search/
                                                                    ├─ embed the query locally (fastembed)
                                                                    └─ pgvector cosine top-k over doc chunks

Ingestion (offline / one-off command):
  autosage-docs/{docs,tutorials}/*.md ──▶ manage.py ingest_docs ──▶ chunk + embed ──▶ doc chunks table (pgvector)
```

### Core decisions

- **Retrieval:** pgvector cosine top-k in Postgres. No reranking/hybrid — the
  corpus is small and the simple path is sufficient.
- **Embeddings:** a **local** model (`fastembed`, BAAI/bge-base-en-v1.5,
  768-dim) running on the Django box. Zero cost, zero rate limits, no API key —
  important because the search path is public. The same model embeds both
  ingested passages and live queries (cosine distance is only meaningful if they
  match).
- **Conversation memory:** anonymous Redis sessions keyed by a client-generated
  session id with a TTL, so a visitor's thread survives page navigation without
  new database tables.

---

## 2. Phase 1 — Django: data model, embeddings, search

The foundation. Everything else depends on a populated, queryable vector store
owned by Django.

1. **Dependencies** — added `pgvector` (Postgres vector column + cosine distance
   ORM helpers), `python-frontmatter` (parse the YAML headers on each doc), and
   `fastembed` (local ONNX embedding model, no torch).
2. **Enable the vector extension** — a migration turning on the Postgres
   `vector` extension, ordered to run before the table that uses it.
3. **`DocChunk` model** — one row per chunk: source (docs/tutorials), doc path,
   title, resolved URL, heading breadcrumb, content, a content hash (drives
   idempotent re-ingest), chunk index, token count, and the 768-dim embedding
   vector. Deliberately **no per-user field** — docs are global and identical for
   everyone. Indexed for re-ingest lookups and an optional vector index for
   growth.
4. **Embedding helper** — a single module wrapping the local model as a lazy,
   process-local singleton. It exposes "embed passages" (ingestion) and "embed
   query" (search). The model loads **only on the first embed call**, so
   processes that never embed never pay the memory cost (see §6).
   - bge retrieval is asymmetric: the query gets an instruction prefix, passages
     do not. The helper applies that prefix exactly once on the query side.
5. **Search endpoint** — `POST /api/autobot/docs/search/`. Public-permission but
   gated by an **internal shared secret** header, constant-time compared and
   failing closed when unset. It embeds the query, runs cosine top-k, and returns
   the matching chunks with their URLs.
6. **Throttle** — an IP-keyed rate limit on the search endpoint, independent of
   the secret (defense in depth).
7. **Ingestion command** — `manage.py ingest_docs` reads the docs + tutorials
   markdown trees, strips MDX/JSX noise, chunks by heading with a size cap,
   resolves each chunk's public URL from the Docusaurus routing rules, embeds the
   chunks, and writes the rows (idempotent by content hash). It runs inside
   Django, so writing rows is legitimate (the AI service never writes the
   schema).

**Verified in isolation** by curling the search endpoint directly before any
AI-service work began.

---

## 3. Phase 2 — Autobot: the search tool + public chat endpoint

The serving layer. One retrieval tool and one public streaming endpoint, reusing
the existing LLM client, tool dispatcher, and streaming helpers. Because this is
the first unauthenticated endpoint, the safety pieces are load-bearing.

### 3.1 Two auth modes for the Django client (the key security design)

Every existing AI-service → Django call forwards the end user's auth token. The
docs path has **no user**, so the client needed a second mode: present the
**internal secret** header instead of a user token.

The client was changed so a request carries **exactly one** of: a user token
(default) **or** the internal secret. The two modes are mutually exclusive, and
a request carrying **neither** is refused before it leaves the process
(fail-closed).

**Why the secret cannot bypass authentication on protected routes** (the
explicit security requirement): authorization is decided **server-side**, per
route, by Django. Protected routes require an authenticated user and never even
read the internal-secret header — presenting it there does nothing. Only the one
public search view checks the secret. The two gates are disjoint, and a client
cannot influence which gate a route uses. So a client sending the secret at a
protected endpoint is simply rejected as unauthenticated — it does not "unlock"
anything.

The header is also added to the log-redaction filter so the secret never reaches
logs.

### 3.2 The `search_docs` tool

A single tool that calls the Django search endpoint using the **internal secret,
no user token**. It validates and bounds its inputs, reshapes the response into a
compact form for the model (title / url / heading path / snippet), and on any
failure returns a normal error object so the model can recover gracefully rather
than crashing the turn. A misconfigured/empty secret fails closed with a generic
message (and a loud operator log).

### 3.3 The docs system prompt

A **standalone** prompt (not the in-app composer, which layers write/exec
capabilities). It scopes the assistant tightly: answer **Autosage documentation**
questions using `search_docs`, cite the source links, never invent. It states
plainly what it **cannot** do (run scripts/workflows, touch accounts) so it never
implies capabilities it lacks, and it treats retrieved passages as **data, not
instructions** (prompt-injection resistance).

### 3.4 The public docs-chat endpoint

`POST /api/ai/docs/chat/stream/` — no login. Bounded on every axis:

- IP-keyed burst rate limit + a per-IP daily cap (fail-open) to bound abuse of
  the free model quota.
- **Admin LLM chain only** (never a user-supplied key on a public path).
- Exactly **one** tool advertised _and_ enforced at dispatch: `search_docs`. A
  hallucinated tool name is refused.
- Bounded message length, replayed-history length, and tool-call rounds.
- Anonymous session memory in Redis keyed by a **client-generated session id**.
  That id is untrusted: it only names a Redis key (length/charset clamped), never
  addresses a database row, and carries no authorization weight.

The stream emits the same event vocabulary as the in-app chat
(token / tool-call-start / tool-result / done / error), so the widget reuses a
familiar frame format. The final event carries the full answer text (no database
message row exists on this anonymous path).

### 3.5 Settings & env

New tunables/secret added to the AI service settings and documented in both env
examples (the internal secret must match on both sides). The docs origin is
allow-listed in the AI service's CORS list (the browser calls the AI service
directly).

---

## 4. Phase 3 — Docusaurus widget ("Ask Autobot")

A self-contained chat panel on the docs site, independent of the SPA's
login-bound chat UI.

1. **Global mount** — the docs theme's Root wrapper is ejected so the widget
   mounts once on every route. It is wrapped so it renders **only in the
   browser** (it is purely client-interactive — streaming fetch, cookies), which
   keeps it out of static site generation cleanly.
2. **The widget** — an **expandable right sidebar** (not a floating overlay).
   Opening it **shrinks the page content** on wide screens by reserving a right
   gutter the whole page reflows into; below the tablet breakpoint it overlays
   full-width instead (shrinking would make the docs unreadable). A small
   floating button opens it; the header matches the navbar's height and bottom
   border so they line up. It renders streamed tokens live, shows a "searching
   the docs…" affordance during retrieval, lists source links, and renders
   answers via a small **safe** markdown renderer (React elements only — no raw
   HTML injection).
   - **Session id** is stored in a **first-party cookie** (`SameSite=Lax`,
     `Secure` on https, ~30-day expiry). It is intentionally **not** HttpOnly:
     the widget must read it to send in the request body, and it is not a
     credential — it only names an anonymous Redis key. The value is re-validated
     against the server's charset contract on read.
   - A persistent disclaimer line notes the assistant is AI and may be wrong.
3. **API URL config** — the backend origin is build-time configurable via a
   Docusaurus custom field (from an `AUTOBOT_API_URL` build env var) with a safe
   default, so each environment can point at its own backend.

**Important routing note:** in the dev stack the browser reaches the AI service
**through nginx**, not directly. nginx publishes a host port and proxies the
`/api/ai/` prefix to the AI service; the AI service container is only exposed on
the internal network. So the widget's API URL must point at the nginx host
origin, not the AI service's internal port.

---

## 5. Phase 4 — Infra & rollout

- **CORS / secret env** — settled in Phase 2's env work: the internal secret is
  documented (and must be identical) on both the AI service and Django; the docs
  origin is in the AI service's CORS list. Django needs no CORS change (it is
  only called server-to-server).
- **Model baked into the Django image** — the Docker build pre-downloads the
  embedding model into a cache directory inside the image, so the first request
  in a fresh container doesn't block on a download. See §6 for the
  resource-impact reasoning.
- **Initial ingestion** — `ingest_docs` must be run once against the live
  database, or search returns nothing.
- **Deploy order** — migration (extension → table) → ingest → deploy the AI
  service → deploy the docs site with its API URL set.

A focused automated test exercises the public chat endpoint's orchestration
(frame order, the one-tool floor, the quota gate, input validation, and graceful
LLM-error handling) without touching Redis, Django, or a real model.

---

## 6. Resource impact of the baked model (RAM vs disk)

There are two distinct costs, and only one was ever a concern:

- **RAM (~hundreds of MB at runtime): guarded, unchanged.** The model loads
  **lazily**, only on the first embed call, and only the web worker (query
  embedding) and the ingestion command ever embed. Celery, beat, and the
  scheduler worker never embed, so they never load the model and pay **no extra
  RAM**. Baking a file into the image does not change this — a file on disk costs
  zero RAM until opened.
- **Disk (~hundreds of MB on the image): shared, one-time.** The same image runs
  Django + celery + beat + scheduler, so the file ships in that one image. But
  it is disk, not memory; Docker layers are shared, so it is one copy on the host
  regardless of how many containers run from it. Redis uses a stock image and is
  unaffected.

Conclusion: baking the model keeps cold starts deterministic and egress-free
without reintroducing the per-worker memory waste we designed against.

---

## 7. Safety summary

- Public endpoint is bounded: IP burst limit + per-IP daily cap, admin model
  chain only, single tool, bounded message/history/rounds.
- The internal secret cannot escalate privileges: auth is decided server-side per
  route; protected routes ignore the secret; only the public search view checks
  it; it fails closed when unset; it is redacted from logs.
- The session id is a non-credential, untrusted Redis key (clamped charset/length,
  never a database key).
- Retrieved passages are treated as data, not instructions; the prompt forbids
  invention and states the assistant's limits.
- Answer rendering injects no raw HTML.
