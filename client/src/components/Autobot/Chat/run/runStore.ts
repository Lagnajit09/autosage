/**
 * RunStore — one live stream (or poll loop) per run id, shared between the
 * inline `RunCard` and the expanded `RunPanel` drawer.
 *
 * Why a store instead of per-component state: a chat-initiated run is shown in
 * two places at once (the compact card in the bubble + the drawer when
 * expanded) and must survive the drawer opening/closing. Two SSE connections
 * to the same run would double the load and race. So the stream lives here,
 * keyed by run id; components subscribe by id via `useSyncExternalStore`.
 *
 * The workflow SSE parse mirrors `WorkflowExecution.tsx::streamLogs` (AD-B2)
 * verbatim so the terminal renders identically. Scripts have no live stream
 * (AD-B4) → we poll `…/<id>/status/` until terminal, then fetch the signed log
 * URLs server-minted by Django.
 *
 * Reconnect safety: the server short-circuits a finished run's stream to a
 * single `status`+`done` (views_workflow.py), so reopening a terminal run is
 * cheap and never hangs. We still hydrate node colors from `…/nodes/` because
 * a finished run's stream replays no per-node events.
 */

import { API_BASE_URL, apiRequest } from "@/lib/api-client";
import type {
  ScriptExecution,
  WorkflowNodeRun,
  WorkflowRun,
} from "@/utils/types";
import {
  isTerminalStatus,
  type RunDescriptor,
  type RunSnapshot,
} from "./runTypes";

type Listener = () => void;
type TokenGetter = () => Promise<string | null>;

interface RunEntry {
  snap: RunSnapshot;
  listeners: Set<Listener>;
  abort: AbortController | null;
  pollTimer: ReturnType<typeof setTimeout> | null;
  started: boolean;
}

const SCRIPT_POLL_MS = 2500;

const authHeaders = (token: string | null): Record<string, string> => {
  if (!token) return {};
  const isJWT = token.split(".").length === 3;
  return { Authorization: isJWT ? `Bearer ${token}` : token };
};

const seedSnapshot = (d: RunDescriptor): RunSnapshot => ({
  runId: d.runId,
  kind: d.kind,
  status: d.status || (d.kind === "script" ? "pending" : "queued"),
  logs: [],
  nodeStatuses: {},
  nodeDurations: {},
  startedAtMs: Date.now(),
  finishedAtMs: null,
  error: null,
  live: true,
  logsFetched: false,
  logsLoading: false,
  name: d.scriptName ?? null,
  workflowId: null,
  workflowRun: null,
  scriptRun: null,
  nodeRuns: [],
  serverId: d.serverId ?? null,
  inputsPreview: d.inputsPreview ?? null,
});

export class RunStore {
  private runs = new Map<string, RunEntry>();
  private getToken: TokenGetter = async () => null;

  setTokenGetter(fn: TokenGetter): void {
    this.getToken = fn;
  }

  /** useSyncExternalStore subscribe — bound per run id at the call site. */
  subscribe = (runId: string, cb: Listener): (() => void) => {
    const entry = this.runs.get(runId);
    if (entry) entry.listeners.add(cb);
    return () => {
      this.runs.get(runId)?.listeners.delete(cb);
    };
  };

  /** Stable snapshot ref (replaced only on change) — safe for getSnapshot. */
  getSnapshot = (runId: string): RunSnapshot | undefined =>
    this.runs.get(runId)?.snap;

  /**
   * Idempotent. Creates the run's state synchronously (so the first render
   * sees the seed), merges late descriptor metadata, and kicks the stream /
   * poll exactly once — deferred so no I/O happens during render.
   */
  register(d: RunDescriptor): void {
    let entry = this.runs.get(d.runId);
    if (!entry) {
      entry = {
        snap: seedSnapshot(d),
        listeners: new Set(),
        abort: null,
        pollTimer: null,
        started: false,
      };
      this.runs.set(d.runId, entry);
    } else {
      // A later tool result (or history rehydrate) may carry richer metadata.
      // CRITICAL: only update when something ACTUALLY changes. `register` is
      // called during render by `useEnsureRun`, so an unconditional update
      // (which always builds a new snapshot object) would notify subscribers
      // on every render → infinite re-render loop → frozen page.
      const s = entry.snap;
      const name = s.name ?? d.scriptName ?? null;
      const serverId = s.serverId ?? d.serverId ?? null;
      const inputsPreview = s.inputsPreview ?? d.inputsPreview ?? null;
      if (
        name !== s.name ||
        serverId !== s.serverId ||
        inputsPreview !== s.inputsPreview
      ) {
        this.update(d.runId, (cur) => ({
          ...cur,
          name,
          serverId,
          inputsPreview,
        }));
      }
    }
    if (!entry.started) {
      entry.started = true;
      // Defer to a macrotask so the kickoff runs after React commits.
      setTimeout(() => void this.start(d.runId), 0);
    }
  }

  private update(runId: string, fn: (s: RunSnapshot) => RunSnapshot): void {
    const entry = this.runs.get(runId);
    if (!entry) return;
    const next = fn(entry.snap);
    if (next === entry.snap) return;
    entry.snap = next;
    entry.listeners.forEach((l) => l());
  }

  private appendLogs(runId: string, lines: string[]): void {
    if (!lines.length) return;
    this.update(runId, (s) => ({ ...s, logs: [...s.logs, ...lines] }));
  }

  private async start(runId: string): Promise<void> {
    const entry = this.runs.get(runId);
    if (!entry) return;
    if (entry.snap.kind === "script") {
      void this.pollScript(runId);
      return;
    }
    // Workflow: hydrate run-level + node detail, then stream if still live.
    await this.hydrateWorkflow(runId);
    const cur = this.runs.get(runId)?.snap;
    if (cur && isTerminalStatus(cur.status)) {
      this.update(runId, (s) => ({ ...s, live: false }));
      return;
    }
    void this.streamWorkflow(runId);
  }

  // ── Workflow ────────────────────────────────────────────────────────

  private async hydrateWorkflow(runId: string): Promise<void> {
    const token = await this.getToken();
    try {
      const res = await apiRequest(
        `/api/execution-engine/workflows/runs/${runId}/`,
        {},
        token,
      );
      const run: WorkflowRun | undefined = res?.data ?? res;
      if (run && typeof run === "object") {
        this.update(runId, (s) => ({
          ...s,
          name: run.workflow_name || s.name,
          workflowId: run.workflow_id || s.workflowId,
          status: isTerminalStatus(s.status) ? s.status : run.status || s.status,
          workflowRun: run,
          error: run.error_message || s.error,
          startedAtMs: run.started_at
            ? Date.parse(run.started_at)
            : s.startedAtMs,
          finishedAtMs: run.finished_at
            ? Date.parse(run.finished_at)
            : s.finishedAtMs,
        }));
      }
    } catch {
      /* run detail is best-effort; the stream still drives status */
    }
    await this.hydrateNodes(runId);
  }

  private async hydrateNodes(runId: string): Promise<void> {
    const token = await this.getToken();
    try {
      const res = await apiRequest(
        `/api/execution-engine/workflows/runs/${runId}/nodes/`,
        {},
        token,
      );
      const nodes: WorkflowNodeRun[] = res?.data ?? [];
      if (Array.isArray(nodes) && nodes.length) {
        this.update(runId, (s) => {
          const ns: Record<string, string> = {};
          const nd: Record<string, number> = { ...s.nodeDurations };
          for (const n of nodes) {
            if (!n?.node_id) continue;
            ns[n.node_id] = n.status;
            if (n.started_at && n.finished_at) {
              const dur =
                (Date.parse(n.finished_at) - Date.parse(n.started_at)) / 1000;
              if (dur >= 0) nd[n.node_id] = dur;
            }
          }
          // Live SSE statuses (already in s.nodeStatuses) win over hydrated.
          return {
            ...s,
            nodeRuns: nodes,
            nodeStatuses: { ...ns, ...s.nodeStatuses },
            nodeDurations: nd,
          };
        });
      }
    } catch {
      /* nodes are best-effort */
    }
  }

  private async streamWorkflow(runId: string): Promise<void> {
    const entry = this.runs.get(runId);
    if (!entry) return;
    const token = await this.getToken();
    const controller = new AbortController();
    entry.abort = controller;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/execution-engine/workflows/runs/${runId}/stream/`,
        { headers: authHeaders(token), signal: controller.signal },
      );
      if (!response.ok || !response.body) {
        this.update(runId, (s) => ({ ...s, live: false }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, "\n");
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          if (!frame.trim()) continue;
          this.handleWorkflowFrame(runId, frame);
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        this.update(runId, (s) => ({
          ...s,
          live: false,
          error: s.error || (e instanceof Error ? e.message : "Stream error."),
        }));
      }
    } finally {
      // Capture final per-node exit codes / error messages the SSE omits.
      await this.hydrateNodes(runId);
      this.update(runId, (s) => ({
        ...s,
        live: false,
        finishedAtMs: s.finishedAtMs ?? Date.now(),
      }));
    }
  }

  /** One SSE frame → state. Mirrors WorkflowExecution.tsx::streamLogs. */
  private handleWorkflowFrame(runId: string, frame: string): void {
    let eventName = "message";
    let dataStr = "";
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        if (dataStr) dataStr += "\n";
        dataStr += line.slice(5).trim();
      }
    }
    if (!dataStr) return;

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataStr);
    } catch {
      return;
    }

    const str = (k: string): string =>
      typeof data[k] === "string" ? (data[k] as string) : "";

    switch (eventName) {
      case "log":
      case "stdout":
      case "stderr":
        this.appendLogs(runId, [
          str("data") || str("stdout") || str("stderr") || JSON.stringify(data),
        ]);
        break;
      case "status":
        this.update(runId, (s) => ({ ...s, status: str("status") || s.status }));
        this.appendLogs(runId, [`[STATUS] Workflow: ${str("status")}`]);
        break;
      case "node_start": {
        const id = str("node_id");
        this.update(runId, (s) => ({
          ...s,
          nodeStatuses: { ...s.nodeStatuses, [id]: "running" },
        }));
        this.appendLogs(runId, [`[START] Node start: ${str("node_label")}`]);
        break;
      }
      case "node_complete": {
        const id = str("node_id");
        const status = str("status");
        const duration = data.duration;
        this.update(runId, (s) => {
          const nd = { ...s.nodeDurations };
          if (typeof duration === "number") nd[id] = duration;
          return {
            ...s,
            nodeStatuses: { ...s.nodeStatuses, [id]: status },
            nodeDurations: nd,
          };
        });
        const label = str("node_label");
        if (status === "skipped")
          this.appendLogs(runId, [`[SKIP] Node skipped: ${label}`]);
        else if (status === "success" || status === "running")
          this.appendLogs(runId, [`[SUCCESS] Node complete: ${label}`]);
        else this.appendLogs(runId, [`[ERROR] Node complete: ${label} (${status})`]);
        break;
      }
      case "done":
        this.appendLogs(runId, ["[DONE] Workflow execution finished"]);
        this.update(runId, (s) => ({
          ...s,
          status: str("status") && isTerminalStatus(str("status")) ? str("status") : s.status,
          live: false,
          finishedAtMs: s.finishedAtMs ?? Date.now(),
        }));
        break;
      case "error":
        this.update(runId, (s) => ({
          ...s,
          error: str("message") || s.error,
        }));
        this.appendLogs(runId, [`[ERROR] ${str("message")}`]);
        break;
    }
  }

  // ── Script ──────────────────────────────────────────────────────────

  private async pollScript(runId: string): Promise<void> {
    const token = await this.getToken();
    let terminal = false;
    try {
      const res = await apiRequest(
        `/api/execution-engine/${runId}/status/`,
        {},
        token,
      );
      const sr: ScriptExecution | undefined = res?.data ?? res;
      if (sr && typeof sr === "object") {
        terminal = isTerminalStatus(sr.status);
        this.update(runId, (s) => ({
          ...s,
          status: sr.status || s.status,
          name: sr.script_name || s.name,
          scriptRun: sr,
          error:
            sr.status === "failed"
              ? s.error || `Script failed (exit ${sr.exit_code ?? "?"}).`
              : s.error,
          startedAtMs: sr.started_at ? Date.parse(sr.started_at) : s.startedAtMs,
          finishedAtMs: sr.completed_at
            ? Date.parse(sr.completed_at)
            : s.finishedAtMs,
        }));
        if (terminal) {
          // Status line is cheap (no GCS read) so the card/terminal always
          // shows the outcome. The stdout/stderr blobs are the one billed
          // Class-B read — pulled ONLY when the user opens the Logs tab (see
          // `fetchScriptLogs`), never on card mount / thought-expand / reload.
          this.appendLogs(runId, [
            `[STATUS] Script ${sr.status}${sr.exit_code != null ? ` (exit ${sr.exit_code})` : ""}`,
          ]);
          this.update(runId, (s) => ({ ...s, live: false }));
        }
      }
    } catch {
      /* transient — keep polling */
    }
    if (terminal) return;
    const entry = this.runs.get(runId);
    if (!entry) return;
    entry.pollTimer = setTimeout(() => void this.pollScript(runId), SCRIPT_POLL_MS);
  }

  /**
   * Pull the script's stdout/stderr blobs from their signed GCS URLs — the one
   * billed Class-B read per run. Public + idempotent: the Logs tab calls it on
   * open, and `pollScript` calls it once for a live-session run. Guards on
   * `logsFetched`/`logsLoading` so concurrent triggers fetch at most once.
   *
   * The signed URLs ride on the cached `scriptRun` (minted by Django's status
   * serializer). If the poll hasn't populated it yet — e.g. a historical run
   * opened straight from a Logs click before any poll completed — fetch the
   * status once to obtain fresh, unexpired URLs.
   */
  async fetchScriptLogs(runId: string): Promise<void> {
    const entry = this.runs.get(runId);
    if (!entry || entry.snap.kind !== "script") return;
    if (entry.snap.logsFetched || entry.snap.logsLoading) return;

    this.update(runId, (s) => ({ ...s, logsLoading: true }));
    try {
      let sr = entry.snap.scriptRun;
      // Mint fresh URLs if we have none (or the cached ones may have expired).
      const token = await this.getToken();
      if (!sr || !sr.stdout_signed_url) {
        const res = await apiRequest(
          `/api/execution-engine/${runId}/status/`,
          {},
          token,
        );
        const fresh: ScriptExecution | undefined = res?.data ?? res;
        if (fresh && typeof fresh === "object") {
          sr = fresh;
          this.update(runId, (s) => ({ ...s, scriptRun: fresh }));
        }
      }

      // Past the bucket's retention the server blanks the URLs and flags the
      // run — the blobs are gone, so don't fetch (it'd 404) and say so plainly.
      if (sr?.logs_expired) {
        this.appendLogs(runId, [
          "[INFO] Logs are no longer available — execution logs are retained for 90 days.",
        ]);
        this.update(runId, (s) => ({ ...s, logsFetched: true }));
        return;
      }

      const lines: string[] = [];
      const out = await this.fetchSignedText(sr?.stdout_signed_url);
      if (out) lines.push(`[STDOUT] ${out.trimEnd()}`);
      const err = await this.fetchSignedText(sr?.stderr_signed_url);
      if (err) lines.push(`[STDERR] ${err.trimEnd()}`);
      if (!out && !err) lines.push("[INFO] No output captured for this run.");
      this.appendLogs(runId, lines);
      this.update(runId, (s) => ({ ...s, logsFetched: true }));
    } catch {
      // Leave logsFetched false so a later Logs open can retry.
    } finally {
      this.update(runId, (s) => ({ ...s, logsLoading: false }));
    }
  }

  private async fetchSignedText(url: string | null | undefined): Promise<string | null> {
    if (!url) return null;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.text();
    } catch {
      return null;
    }
  }

  // ── Cancellation ──────────────────────────────────────────────────────

  async cancel(runId: string): Promise<void> {
    const entry = this.runs.get(runId);
    if (!entry) return;
    const kind = entry.snap.kind;
    const token = await this.getToken();
    const path =
      kind === "workflow"
        ? `/api/execution-engine/workflows/runs/${runId}/cancel/`
        : `/api/execution-engine/${runId}/stop/`;
    this.appendLogs(runId, ["[INFO] Cancellation requested…"]);
    try {
      await apiRequest(path, { method: "POST" }, token);
    } catch {
      this.appendLogs(runId, ["[ERROR] Cancel request failed."]);
    }
  }

  dispose(): void {
    for (const entry of this.runs.values()) {
      entry.abort?.abort();
      if (entry.pollTimer) clearTimeout(entry.pollTimer);
    }
    this.runs.clear();
  }
}
