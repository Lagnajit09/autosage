/**
 * Inline execution renderer — the compact card that appears in the assistant
 * bubble when a `run_workflow` / `rerun_workflow` / `run_script` tool result
 * lands. It streams live (via the shared store) and stays deliberately small:
 * status + a one-line live summary + buttons that expand the rich view into
 * the right-sidebar drawer (Graph / Logs / Response). "Don't overdesign it."
 */

import {
  Activity,
  ListTree,
  Loader2,
  Network,
  ScrollText,
  Terminal,
  Workflow,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { useEnsureRun, useRunPanel, useRunSnapshot } from "./RunPanelProvider";
import { StatusPill, useElapsed } from "./runUi";
import {
  formatDuration,
  formatElapsed,
  toVisualStatus,
  type RunDescriptor,
  type RunVisual,
} from "./runTypes";

const ACCENT_BORDER: Record<RunVisual, string> = {
  queued: "border-l-gray-300 dark:border-l-gray-600",
  running: "border-l-blue-400 dark:border-l-blue-500",
  success: "border-l-emerald-400 dark:border-l-emerald-500",
  failed: "border-l-red-400 dark:border-l-red-500",
  cancelled: "border-l-gray-300 dark:border-l-gray-600",
};

interface PanelButtonProps {
  onClick: () => void;
  icon: typeof Network;
  label: string;
}

const PanelButton = ({ onClick, icon: Icon, label }: PanelButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:border-purple-700 dark:hover:bg-purple-950/30 dark:hover:text-purple-300"
  >
    <Icon className="h-3.5 w-3.5" />
    {label}
  </button>
);

export const RunCard = ({ descriptor }: { descriptor: RunDescriptor }) => {
  useEnsureRun(descriptor);
  const snap = useRunSnapshot(descriptor.runId);
  const { openRun } = useRunPanel();

  const { kind, runId } = descriptor;
  const status = snap?.status || descriptor.status || (kind === "script" ? "pending" : "queued");
  const live = snap?.live ?? true;
  const elapsed = useElapsed(
    snap?.startedAtMs ?? null,
    snap?.finishedAtMs ?? null,
    live,
  );
  const v = toVisualStatus(status);
  const name =
    snap?.name ||
    descriptor.scriptName ||
    (kind === "workflow" ? "Workflow run" : "Script run");

  const Icon = kind === "workflow" ? Workflow : Terminal;
  const serverId = snap?.serverId || descriptor.serverId || null;
  const paramKeys = Object.keys(snap?.inputsPreview || descriptor.inputsPreview || {});

  // One-line live summary.
  let summary: React.ReactNode;
  if (kind === "script") {
    summary = (
      <>
        Executing <span className="font-medium text-gray-700 dark:text-gray-200">{name}</span>
        {serverId && (
          <>
            {" "}on <span className="font-mono text-[11px]">{serverId.slice(0, 8)}</span>
          </>
        )}
        {paramKeys.length > 0 && (
          <> · params: {paramKeys.slice(0, 4).join(", ")}{paramKeys.length > 4 ? "…" : ""}</>
        )}
      </>
    );
  } else if (v === "running" || v === "queued") {
    const last = snap?.logs[snap.logs.length - 1];
    summary = (
      <span className="flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500" />
        <span className="truncate">{last ? last.replace(/^\[[A-Z]+\]\s*/, "") : "Starting execution…"}</span>
      </span>
    );
  } else if (v === "success") {
    const n = snap?.nodeRuns.length || 0;
    summary = (
      <>Finished{n ? ` · ${n} node${n === 1 ? "" : "s"}` : ""} · {formatDuration(elapsed)}</>
    );
  } else if (v === "failed") {
    summary = (
      <span className="text-red-600 dark:text-red-400">
        {snap?.error || "Run failed."}
      </span>
    );
  } else {
    summary = <>Cancelled.</>;
  }

  return (
    <div className="my-1 w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
      <div className={cn("border-l-4 px-3.5 py-3", ACCENT_BORDER[v])}>
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
            <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {name}
            </span>
            <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">
              #{runId.slice(0, 8)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill status={status} live={live} />
            <span className="font-mono text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
              {formatElapsed(elapsed)}
            </span>
          </div>
        </div>

        {/* Live summary */}
        <p className="mt-1.5 truncate text-xs text-gray-500 dark:text-gray-400">
          {summary}
          {descriptor.idempotent && (
            <span className="ml-1.5 rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              already running
            </span>
          )}
        </p>

        {/* Expand buttons → drawer */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {kind === "workflow" && (
            <PanelButton
              onClick={() => openRun(runId, kind, "graph")}
              icon={Network}
              label="Graph"
            />
          )}
          <PanelButton
            onClick={() => openRun(runId, kind, "logs")}
            icon={ScrollText}
            label="Logs"
          />
          <PanelButton
            onClick={() => openRun(runId, kind, "response")}
            icon={kind === "workflow" ? Activity : ListTree}
            label={kind === "workflow" ? "Response" : "Details"}
          />
        </div>
      </div>
    </div>
  );
};

export default RunCard;
