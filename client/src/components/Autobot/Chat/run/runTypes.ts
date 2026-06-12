/**
 * Shared types + status helpers for the chat execution renderer (Pillar B,
 * X14/X15).
 *
 * A "run" is a chat-initiated workflow run or script execution. The tool
 * results that seed one (`run_workflow`, `rerun_workflow`, `run_script`) all
 * carry `{run_id, kind, status, watch_url}`; this module normalizes the two
 * status vocabularies (workflow: queued/running/success/failed/cancelled;
 * script: pending/running/completed/failed/cancelled) into one visual model.
 */

import type { WorkflowRun, WorkflowNodeRun, ScriptExecution } from "@/utils/types";

export type RunKind = "workflow" | "script";

/**
 * One configured workflow parameter, as described by `needs_params` on a
 * `preview_workflow_run` / `run_workflow` result (X17). Drives the rows of the
 * composer-anchored confirmation form.
 */
export interface NeedsParam {
  param_id: string;
  name: string;
  /** "string" | "number" | "boolean" | "password" */
  type: string;
  /** A value is baked into the workflow JSON — the field can be left blank. */
  has_default: boolean;
  /** type === "password"; rendered as a masked input, value POSTs to Django. */
  is_secret: boolean;
  /** "manual" (editable) | "output" (a node reference; read-only). */
  source: "manual" | "output" | string;
  /** The step this value feeds — shown so the user knows where it's used. */
  node_id?: string;
  node_label?: string;
  node_type?: string;
}

/**
 * A `run_workflow` result that returned `status:"awaiting_secret"` — the run is
 * prepared (a single-use intent exists) but waits on the user confirming params
 * in the composer form. The secret never flows through Autobot; on submit the
 * form POSTs browser→Django directly to the fulfill endpoint.
 */
export interface PendingSecret {
  runIntentId: string;
  workflowName: string;
  params: NeedsParam[];
}

/** Extract a `PendingSecret` from a tool result, or null if it isn't one. */
export const parsePendingSecret = (result: unknown): PendingSecret | null => {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (r.status !== "awaiting_secret" || typeof r.run_intent_id !== "string")
    return null;
  const params = Array.isArray(r.needs_params)
    ? (r.needs_params as NeedsParam[])
    : [];
  return {
    runIntentId: r.run_intent_id,
    workflowName: typeof r.name === "string" && r.name ? r.name : "this workflow",
    params,
  };
};

/** What a `run_*`/`rerun_*` tool result hands us — the seed for a live run. */
export interface RunDescriptor {
  runId: string;
  kind: RunKind;
  /** Server status at tool-return time (queued/pending). */
  status?: string;
  /** Script-only metadata echoed by `run_script` (no extra fetch needed). */
  scriptName?: string;
  serverId?: string;
  inputsPreview?: Record<string, unknown>;
  /** True when an idempotent double-call collapsed to an existing run. */
  idempotent?: boolean;
}

/** Immutable snapshot a component reads via `useRunSnapshot`. Replaced (never
 * mutated) on every update so `useSyncExternalStore` ref-equality holds. */
export interface RunSnapshot {
  runId: string;
  kind: RunKind;
  status: string;
  /** Tagged log lines (`[START] …`, `[SUCCESS] …`) for the terminal. */
  logs: string[];
  /** node_id → status (running/success/failed/skipped). Workflow only. */
  nodeStatuses: Record<string, string>;
  /** node_id → seconds. Workflow only. */
  nodeDurations: Record<string, number>;
  /** ms epoch; used for the live elapsed counter. */
  startedAtMs: number | null;
  finishedAtMs: number | null;
  /** Run-level error message once known. */
  error: string | null;
  /** Whether an SSE/poll loop is currently attached. */
  live: boolean;

  // ── Lazily-hydrated detail (fetched once per run) ──────────────────
  /** Resolved workflow name (or echoed script name). */
  name: string | null;
  /** Workflow only — needed to fetch the graph layout for the Graph tab. */
  workflowId: string | null;
  /** Run-level detail once fetched (masked inputs, timestamps, …). */
  workflowRun: WorkflowRun | null;
  scriptRun: ScriptExecution | null;
  /** Per-node detail (exit codes, error messages) for finished/late runs. */
  nodeRuns: WorkflowNodeRun[];
  /** Script-only echoed metadata. */
  serverId: string | null;
  inputsPreview: Record<string, unknown> | null;
}

export type RunVisual = "queued" | "running" | "success" | "failed" | "cancelled";

const TERMINAL = new Set([
  "success",
  "completed",
  "failed",
  "error",
  "cancelled",
  "canceled",
  "skipped",
]);

/** Map either status vocabulary onto the 5-state visual model. */
export const toVisualStatus = (status: string | null | undefined): RunVisual => {
  const s = (status || "").toLowerCase();
  if (s === "success" || s === "completed") return "success";
  if (s === "failed" || s === "error") return "failed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "running") return "running";
  return "queued"; // queued | pending | "" | unknown
};

export const isTerminalStatus = (status: string | null | undefined): boolean =>
  TERMINAL.has((status || "").toLowerCase());

/** Tailwind class bundles per visual status — tuned to match the existing
 * execution/workflow palette (emerald/blue/amber/red), light + dark. */
export interface StatusTheme {
  label: string;
  /** pill background + text + border */
  pill: string;
  /** dot / accent color */
  dot: string;
  /** ReactFlow node ring + glow */
  ring: string;
  text: string;
}

export const STATUS_THEME: Record<RunVisual, StatusTheme> = {
  queued: {
    label: "Queued",
    pill: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/60 dark:text-gray-300 dark:border-gray-700",
    dot: "bg-gray-400",
    ring: "border-gray-300 dark:border-gray-600",
    text: "text-gray-500 dark:text-gray-400",
  },
  running: {
    label: "Running",
    pill: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60",
    dot: "bg-blue-500",
    ring: "border-blue-400 dark:border-blue-500 shadow-[0_0_18px_rgba(59,130,246,0.35)]",
    text: "text-blue-600 dark:text-blue-400",
  },
  success: {
    label: "Success",
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60",
    dot: "bg-emerald-500",
    ring: "border-emerald-400 dark:border-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.3)]",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  failed: {
    label: "Failed",
    pill: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60",
    dot: "bg-red-500",
    ring: "border-red-400 dark:border-red-500 shadow-[0_0_18px_rgba(239,68,68,0.35)]",
    text: "text-red-600 dark:text-red-400",
  },
  cancelled: {
    label: "Cancelled",
    pill: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800/60 dark:text-gray-400 dark:border-gray-700",
    dot: "bg-gray-400",
    ring: "border-gray-300 dark:border-gray-600 opacity-70",
    text: "text-gray-500 dark:text-gray-400",
  },
};

/** Per-node-kind accent (matches the workflow builder: emerald/blue/amber). */
export const NODE_KIND_ACCENT: Record<string, { tag: string; bar: string }> = {
  trigger: {
    tag: "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
    bar: "bg-emerald-400 dark:bg-emerald-500",
  },
  action: {
    tag: "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
    bar: "bg-blue-400 dark:bg-blue-500",
  },
  decision: {
    tag: "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
    bar: "bg-amber-400 dark:bg-amber-500",
  },
};

export const nodeKindAccent = (kind: string | undefined) =>
  NODE_KIND_ACCENT[(kind || "action").toLowerCase()] || NODE_KIND_ACCENT.action;

/** mm:ss for the live elapsed counter; `1m 04s` style for finished durations. */
export const formatElapsed = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
};
