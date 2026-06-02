# Autobot

Autobot is Autosage's built-in AI assistant. It chats with you, generates scripts and workflows, helps you reason about your automation library, and reads from your existing setup to give grounded answers — all from inside your Autosage account.

This README is for **users** of Autosage. If you're looking for the architectural reference (service topology, internal APIs, deploy pipeline, rules for code changes), see Section 16 of the root `AGENTS.md`.

---

## What Autobot can do

- **Chat about automation** — ask how to approach a problem, get an explanation of a script you already have, brainstorm a workflow design.
- **Generate scripts** — Python, PowerShell, or shell. Autobot writes them and (with one click) saves them straight into your Script library, ready to be used in a workflow.
- **Generate workflows** — describe what you want ("every weekday at 7am, run the cleanup script on staging-1, then email me"), and Autobot builds the node/edge graph and saves it as a draft workflow.
- **Read your existing library** — list your scripts, workflows, vaults, servers, and credentials so its suggestions match what you already have. It references vault resources by name and id only; **it never sees secret values**.
- **Stream responses in real time** — answers appear token-by-token, and tool calls (like "creating script…") show up inline as they happen.
- **Remember the conversation** — each thread keeps full history. Older turns get summarized automatically when a chat gets long, so it stays coherent without blowing the model's context window.

### What Autobot will *not* do in v1

- It will **not execute workflows or scripts for you**. That's by design — execution is a higher-trust action and stays gated to the explicit Run buttons in the UI.
- It will **not reveal vault secrets** to you or to the model. Credentials are referenced by id only.
- It does **not** manage cloud infrastructure, write Ansible playbooks, or upload files.

These are deliberate v1 boundaries, not bugs.

---

## Getting started

### 1. Open Autobot

From the left navigation, click **Autobot**. You'll land on the chat surface.

- **New chat** — type into the input at the bottom. The first message creates a new thread; the thread title is auto-generated from your prompt.
- **Open an existing chat** — pick one from the **History** panel on the left.

### 2. Ask for what you want

Some prompts that work well:

> *"Write me a Python script that pings a list of servers and prints any that are unreachable."*

> *"Show me the workflows I have and tell me which ones don't have a trigger configured."*

> *"Build a workflow: every weekday at 7am UTC, run `db-backup.sh` on `prod-db-1`, and email me when it finishes."*

> *"What does the script `cleanup-logs.py` actually do? Walk me through it."*

> *"I have a credential called `aws-readonly` — which workflows use it?"*

When Autobot performs an action (creating a script, building a workflow, listing your library), you'll see an inline badge — e.g. *"Creating script: ping_servers.py"* — and the result appears immediately afterward.

### 3. Find what Autobot built

- **Scripts** Autobot creates land in your normal Script library — open the Scripts page and they'll be there, owned by you.
- **Workflows** Autobot creates land in your Workflows page as drafts. Open them in the workflow builder to review the node graph before running them.

---

## Customizing Autobot

Open the **Customize** modal from the Autobot page header.

### Tone, expertise, language

Tell Autobot how you want it to talk to you (concise / detailed, beginner / expert, what language you prefer). These settings layer **on top of** the base instructions — they don't replace them, so Autobot keeps its knowledge of how Autosage works.

### Custom instructions

A free-text field for anything you want Autobot to remember across every conversation: "I work in UTC", "always default to Python over shell", "scripts should include a header comment with the date and a one-line description". Same rule: this appends to the base prompt; it doesn't override it.

### Per-thread overrides

Inside an individual chat, you can also set a one-off system prompt override (Thread settings) that only affects that conversation. Useful when you want a specific tone for one project without changing your global default.

---

## Bring your own LLM key (BYO)

By default, Autobot uses a shared Autosage admin pool (Gemini / Groq / OpenRouter). That pool has a **daily quota per user** — the Autobot Dashboard shows your current `used / limit`. When you hit the cap, the chat surface tells you so and points you here.

You can connect your own provider key so your conversations don't tick the shared quota:

1. Customize → **LLM Configurations** → **Add new**.
2. Pick a provider (Gemini, Groq, OpenRouter, Anthropic, OpenAI, Azure OpenAI, or a custom OpenAI-compatible endpoint).
3. Paste your API key. It's stored **encrypted at rest** (Fernet, same pattern as Vault credentials) and never returned to the browser in plaintext.
4. Optionally set this config as your **default**.

Once a BYO key is the default, every chat turn uses it — those turns are uncapped by Autosage's quota (you pay your own provider directly), and they don't share usage with the shared pool.

You can have multiple BYO configs and switch defaults at any time. Deleting a config that's currently your default falls back to the admin pool.

---

## Threads, history, archive

### Active chats

The **History** panel lists your active threads, newest first. Each row's `⋯` menu lets you:

- **Rename** — change the auto-generated title.
- **Archive** — hide the thread from the active list without losing it.
- **Delete** — permanently remove the thread and its messages.

### Archived chats

Archive doesn't delete. Archived threads stay around so you can revisit decisions or copy a turn into a new chat.

- Open the **Autobot Dashboard** and click **View archived chats**.
- From the archived view, each thread can be **Unarchived** (returns it to History) or **Deleted**.
- You can still **open** an archived thread to read it, but you **can't send new messages** to it. The chat surface shows a banner with an Unarchive button — click it to resume the conversation.

The Archived Chats page is intentionally **not** in the main navigation — it's reachable only from the dashboard, to keep your sidebar focused on active work.

---

## The Autobot Dashboard

Open **Autobot Dashboard** from the left navigation. You'll see three time buckets:

| Bucket | What it shows |
|---|---|
| **Today** | Requests, total tokens, average tokens per request, admin vs BYO token split, models used, your remaining admin quota. |
| **Last 7 days** | Same shape, rolling 7-day window. |
| **All-time** | Lifetime totals since you first used Autobot. |

The **model usage** chart breaks down which provider/model handled how many turns. Useful when you have BYO configs across multiple providers and want to know which one you actually use.

The **admin quota** tile (Today only) shows your `used / limit` with a progress bar — amber at 80 %, red at 100 %. Hides itself if you're on BYO exclusively (limit is effectively 0).

---

## Tips for getting good results

**Be specific about your environment.** "Run on `prod-db-1`" works better than "run on the database server" — Autobot can look up `prod-db-1` in your vault and use the right credential.

**Mention names of things that exist.** Script names, workflow names, credential names. Autobot can read your library, but only when prompted to.

**Iterate.** Ask Autobot to build a draft, then say "now add error handling" or "use the `aws-readonly` credential instead". Each turn refines the same thread.

**For long debugging sessions, use BYO.** Tool-using chats (especially workflow generation) can burn through tokens quickly. The shared admin quota is meant as a starter — heavy users should plug in their own provider key.

**Trust but verify.** Autobot generates first drafts. Review the script body before running it; open the generated workflow in the builder to check the node graph and triggers. The chat is a copilot, not autopilot.

---

## Limits and quotas

| Limit | Default | Why it exists |
|---|---|---|
| Admin daily quota | 30 chat turns / user / day | Keeps the shared LLM pool fair. BYO turns don't count toward this. |
| Burst rate | 30 requests / minute | Catches runaway clients. Applies per user. |
| Sustained rate | 500 requests / day | Catches scripted abuse. Applies per user. |
| Tool-call rounds per turn | 10 | Stops the model from looping forever on a single message. A typical multi-step turn ("create a workflow with 3 scripts") is 5–6 rounds. |
| Per-tool timeout | 30 s | GCS uploads on very large scripts can run long; this is the ceiling. |

If you hit the daily quota, the chat surface tells you and prompts you to set up a BYO key in Customize. All other limits are normally invisible — they only fire if something is misbehaving.

---

## Privacy & security

- **Your conversations are private to you.** Per-user data scoping is enforced server-side; no other Autosage user can see your threads, generated scripts, or settings.
- **Authentication is the same Clerk sign-in you use everywhere else in Autosage.** Autobot verifies your token on every request.
- **API keys (BYO) are encrypted at rest** using Fernet, the same encryption Autosage uses for vault credentials. They're decrypted only in-memory at chat time, never logged, and never returned to the browser as plaintext.
- **Vault secrets stay in Vault.** Autobot can see resource **metadata** (names, ids, types) but never plaintext passwords, SSH keys, or certificates. Scripts and workflows it generates reference vault resources by id — same way you'd build them by hand.
- **Authorization headers are stripped from logs.** A redaction filter runs before any log line is emitted, so even at DEBUG level your Bearer token never lands in a log file.

---

## Troubleshooting

**"Stats unavailable" on the Today card or Dashboard.**
The analytics endpoint is briefly unreachable. Refresh the page in a minute. The chat itself still works.

**The assistant says I've hit my daily quota.**
You've used your share of the shared admin pool for today. Options:
- Wait until 00:00 UTC for the counter to reset.
- Connect your own LLM key in Customize → LLM Configurations.

**A tool call fails with "permission denied" or "not found".**
Autobot is acting under your account. If you can't access a resource through the normal UI (script, workflow, vault), Autobot can't either. Make sure the resource exists and is owned by you.

**Streaming response cuts off mid-sentence.**
Your network may have closed the connection, or your Clerk session expired during a long tool-using turn. Refresh the page (or close and reopen the chat) and re-ask. The partial assistant message is dropped — only completed turns persist.

**The model picked the wrong provider / model.**
Open Customize, set the BYO config you want as the **default**, and start a new chat. Existing threads stick with the provider that was active when they were created.

**Generated workflow has the wrong trigger.**
Open it in the workflow builder and edit the trigger node, or ask Autobot in the same chat: *"change the trigger to a webhook"* — it'll edit the workflow in place.

---

## Status & roadmap

This is **Autobot v1**. Future enhancements being considered:

- A `run_workflow` tool so Autobot can kick off executions on your behalf (gated, opt-in).
- Cloud-infra tools (AWS / GCP / Azure SDKs) so Autobot can also suggest infrastructure changes — currently it sticks to scripts, workflows, and SMTP-bound tasks.
- Multi-modal — uploading a screenshot of an error to ask "what's broken here?".
- Embeddings / RAG over your script library so suggestions can lean on patterns from your existing code.
- Shareable / public threads.

If you have feedback or hit a bug, please raise it through the same channel you use for the rest of Autosage.
