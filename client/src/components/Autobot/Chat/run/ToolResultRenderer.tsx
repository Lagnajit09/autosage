/**
 * Routes an autobot tool result to its rich renderer (X15). Anything not
 * matched here falls back to the plain `ToolCallBadge` in the bubble.
 *
 *   run_workflow / rerun_workflow / run_script → <RunCard>   (live panel)
 *   preview_workflow_run                       → <PreviewCard>
 *   get_execution_histories                    → <ExecutionHistoryList>
 *   get_workflow_run / get_script_run          → <RunStatusInline>
 *
 * Errors and in-flight calls are NOT rich-rendered — the badge surfaces those.
 */

import { ArrowUpRight, History as HistoryIcon, Terminal, Workflow } from "lucide-react";

import { cn } from "@/lib/utils";

import RunCard from "./RunCard";
import PreviewCard from "./PreviewCard";
import { useRunPanel } from "./RunPanelProvider";
import { StatusPill } from "./runUi";
import type { RunDescriptor, RunKind } from "./runTypes";

export interface ToolCallView {
  id: string;
  name: string;
  argumentsJson: string;
  status: "running" | "done" | "error";
  result?: Record<string, unknown>;
}

export type RichKind = "run" | "preview" | "history" | "run_status";

const str = (o: Record<string, unknown>, k: string): string | undefined =>
  typeof o[k] === "string" ? (o[k] as string) : undefined;

/** Classify a completed, non-error tool result; null → use the plain badge. */
export const richToolKind = (tc: ToolCallView): RichKind | null => {
  if (tc.status !== "done") return null;
  const r = tc.result;
  if (!r || typeof r !== "object" || "error" in r) return null;
  const runId = r.run_id;
  const kind = r.kind;
  if (
    (tc.name === "run_workflow" ||
      tc.name === "rerun_workflow" ||
      tc.name === "run_script") &&
    runId
  )
    return "run";
  if (runId && (kind === "workflow" || kind === "script")) return "run";
  if (tc.name === "preview_workflow_run") return "preview";
  if (tc.name === "get_execution_histories" && Array.isArray(r.executions))
    return "history";
  if (tc.name === "get_workflow_run" || tc.name === "get_script_run")
    return "run_status";
  return null;
};

const buildDescriptor = (result: Record<string, unknown>): RunDescriptor => ({
  runId: String(result.run_id),
  kind: result.kind === "script" ? "script" : "workflow",
  status: str(result, "status"),
  scriptName: str(result, "script_name"),
  serverId: str(result, "server_id"),
  inputsPreview:
    result.inputs_preview && typeof result.inputs_preview === "object"
      ? (result.inputs_preview as Record<string, unknown>)
      : undefined,
  idempotent: result.idempotent === true,
});

// ── get_execution_histories ──────────────────────────────────────────

interface HistoryRow {
  id?: string;
  name?: string;
  status?: string;
  tag?: string;
  duration?: string | number;
  created_at?: string;
  workflow_id?: string;
}

const fmtWhen = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const ExecutionHistoryList = ({ result }: { result: Record<string, unknown> }) => {
  const { seedPrompt, openRun } = useRunPanel();
  const rows = (Array.isArray(result.executions) ? result.executions : []) as HistoryRow[];
  const total =
    typeof result.total_count === "number" ? result.total_count : rows.length;
  const shown = rows.slice(0, 8);

  return (
    <div className="my-1 w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3.5 py-2.5 dark:border-gray-800">
        <HistoryIcon className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Recent executions
        </span>
        <span className="ml-auto text-[11px] text-gray-400">{total} total</span>
      </div>

      {shown.length === 0 ? (
        <p className="px-3.5 py-4 text-xs text-gray-500 dark:text-gray-400">
          No executions found.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {shown.map((row, i) => {
            const kind: RunKind = row.tag === "script" ? "script" : "workflow";
            const Icon = kind === "script" ? Terminal : Workflow;
            return (
              <li key={row.id || i}>
                <button
                  type="button"
                  onClick={() =>
                    row.id && seedPrompt(`Investigate ${kind} run ${row.id}`)
                  }
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700 dark:text-gray-200">
                    {row.name || `${kind} run`}
                  </span>
                  {row.status && (
                    <StatusPill status={row.status} />
                  )}
                  {row.created_at && (
                    <span className="hidden shrink-0 text-[11px] text-gray-400 sm:inline">
                      {fmtWhen(row.created_at)}
                    </span>
                  )}
                  {row.id && (
                    <span
                      role="button"
                      tabIndex={0}
                      title="Open run panel"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (row.id) openRun(row.id, kind);
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && row.id) {
                          e.stopPropagation();
                          openRun(row.id, kind);
                        }
                      }}
                      className="shrink-0 rounded p-0.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {total > shown.length && (
        <p className="border-t border-gray-100 px-3.5 py-1.5 text-[11px] text-gray-400 dark:border-gray-800">
          Showing {shown.length} of {total}. Ask to see more or filter by status.
        </p>
      )}
    </div>
  );
};

// ── get_workflow_run / get_script_run ────────────────────────────────

const RunStatusInline = ({
  name,
  result,
  argsJson,
}: {
  name: string;
  result: Record<string, unknown>;
  argsJson: string;
}) => {
  const { openRun } = useRunPanel();
  const kind: RunKind = name === "get_script_run" ? "script" : "workflow";
  const Icon = kind === "script" ? Terminal : Workflow;

  let runId = str(result, "id");
  if (!runId) {
    try {
      runId = JSON.parse(argsJson)?.run_id;
    } catch {
      runId = undefined;
    }
  }
  const status = str(result, "status") || "queued";
  const title = str(result, "workflow_name") || str(result, "script_name") || `${kind} run`;
  const error = str(result, "error_message");

  return (
    <div className="my-1 w-full max-w-xl rounded-xl border border-gray-200 bg-white px-3.5 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </span>
        <StatusPill status={status} />
        {runId && (
          <button
            type="button"
            onClick={() => openRun(runId as string, kind)}
            title="Open run panel"
            className={cn(
              "shrink-0 rounded p-0.5 text-gray-400 transition-colors",
              "hover:text-purple-600 dark:hover:text-purple-400",
            )}
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
        )}
      </div>
      {error && (
        <p className="mt-1.5 break-words text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
};

// ── Dispatcher ────────────────────────────────────────────────────────

export const ToolResultCard = ({ tc }: { tc: ToolCallView }) => {
  const kind = richToolKind(tc);
  if (!kind || !tc.result) return null;
  switch (kind) {
    case "run":
      return <RunCard descriptor={buildDescriptor(tc.result)} />;
    case "preview":
      return <PreviewCard result={tc.result} argsJson={tc.argumentsJson} />;
    case "history":
      return <ExecutionHistoryList result={tc.result} />;
    case "run_status":
      return (
        <RunStatusInline name={tc.name} result={tc.result} argsJson={tc.argumentsJson} />
      );
    default:
      return null;
  }
};

export default ToolResultCard;
