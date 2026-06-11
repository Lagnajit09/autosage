/**
 * RunPanel — the expanded execution view that lives in the right-sidebar
 * drawer (X14). Driven by the shared `RunStore`, so it shows the SAME live
 * state as the inline card without opening a second stream.
 *
 *   • workflow → tabs: Graph (live ReactFlow status canvas) · Logs (terminal)
 *     · Response (run metadata, masked inputs, per-node breakdown)
 *   • script   → tabs: Logs (terminal, populated once the poll completes) ·
 *     Details (script/server, status, masked parameters) — no live token
 *     stream (AD-B4).
 */

import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  ListTree,
  Network,
  ScrollText,
  Square,
  Terminal,
  Workflow,
  X,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import ExecutionTerminal from "@/components/Execution/ExecutionTerminal";
import { cn } from "@/lib/utils";

import { type ActiveRun, useRunPanel, useRunSnapshot } from "./RunPanelProvider";
import { RunGraph } from "./RunGraph";
import { ParamGrid } from "./RunFields";
import { ElapsedBadge, StatusPill, useElapsed } from "./runUi";
import { formatDuration, isTerminalStatus, type RunSnapshot } from "./runTypes";

const fmtTime = (ms: number | null): string =>
  ms == null ? "—" : new Date(ms).toLocaleString();

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
    {children}
  </h4>
);

const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5">
    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{label}</span>
    <span className="min-w-0 break-words text-right text-xs font-medium text-gray-800 dark:text-gray-200">
      {value}
    </span>
  </div>
);

const ErrorBanner = ({ message }: { message: string }) => (
  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span className="break-words">{message}</span>
  </div>
);

const NODE_STATUS_DOT: Record<string, string> = {
  success: "bg-emerald-500",
  failed: "bg-red-500",
  error: "bg-red-500",
  running: "bg-blue-500",
  skipped: "bg-gray-400",
  pending: "bg-gray-300 dark:bg-gray-600",
};

const NodeBreakdown = ({ snap }: { snap: RunSnapshot }) => {
  if (!snap.nodeRuns.length) return null;
  const ordered = [...snap.nodeRuns].sort(
    (a, b) => (a.execution_order ?? 0) - (b.execution_order ?? 0),
  );
  return (
    <div className="space-y-1.5">
      {ordered.map((n) => (
        <div
          key={n.id || n.node_id}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900/50"
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                NODE_STATUS_DOT[n.status] || NODE_STATUS_DOT.pending,
              )}
            />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800 dark:text-gray-200">
              {n.node_label || n.node_id}
            </span>
            <span className="text-[11px] capitalize text-gray-500 dark:text-gray-400">
              {n.status}
            </span>
            {n.exit_code != null && (
              <span className="font-mono text-[10px] text-gray-400">
                exit {n.exit_code}
              </span>
            )}
          </div>
          {n.error_message && (
            <p className="mt-1 break-words pl-4 text-[11px] text-red-600 dark:text-red-400">
              {n.error_message}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

const WorkflowResponse = ({ snap, elapsed }: { snap: RunSnapshot; elapsed: number }) => (
  <ScrollArea className="h-full">
    <div className="space-y-5 p-4">
      <section>
        <SectionTitle>
          <Activity className="h-3.5 w-3.5" /> Summary
        </SectionTitle>
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-1 dark:border-gray-800 dark:bg-gray-900/50">
          <DetailRow label="Status" value={<StatusPill status={snap.status} live={snap.live} />} />
          <DetailRow label="Started" value={fmtTime(snap.startedAtMs)} />
          <DetailRow label="Finished" value={fmtTime(snap.finishedAtMs)} />
          <DetailRow label="Duration" value={formatDuration(elapsed)} />
        </div>
      </section>

      {snap.error && (
        <section>
          <SectionTitle>
            <AlertTriangle className="h-3.5 w-3.5" /> Error
          </SectionTitle>
          <ErrorBanner message={snap.error} />
        </section>
      )}

      <section>
        <SectionTitle>
          <ListTree className="h-3.5 w-3.5" /> Inputs
        </SectionTitle>
        <ParamGrid values={snap.workflowRun?.inputs as Record<string, unknown>} />
      </section>

      {snap.nodeRuns.length > 0 && (
        <section>
          <SectionTitle>
            <Network className="h-3.5 w-3.5" /> Nodes
          </SectionTitle>
          <NodeBreakdown snap={snap} />
        </section>
      )}
    </div>
  </ScrollArea>
);

const ScriptDetails = ({ snap, elapsed }: { snap: RunSnapshot; elapsed: number }) => {
  const sr = snap.scriptRun;
  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4">
        <section>
          <SectionTitle>
            <Activity className="h-3.5 w-3.5" /> Summary
          </SectionTitle>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-1 dark:border-gray-800 dark:bg-gray-900/50">
            <DetailRow label="Script" value={snap.name || "—"} />
            <DetailRow
              label="Server"
              value={<span className="font-mono">{snap.serverId || "—"}</span>}
            />
            <DetailRow label="Status" value={<StatusPill status={snap.status} live={snap.live} />} />
            {sr?.exit_code != null && (
              <DetailRow label="Exit code" value={<span className="font-mono">{sr.exit_code}</span>} />
            )}
            <DetailRow label="Started" value={fmtTime(snap.startedAtMs)} />
            <DetailRow label="Finished" value={fmtTime(snap.finishedAtMs)} />
            <DetailRow label="Duration" value={formatDuration(elapsed)} />
          </div>
        </section>

        {snap.error && (
          <section>
            <SectionTitle>
              <AlertTriangle className="h-3.5 w-3.5" /> Error
            </SectionTitle>
            <ErrorBanner message={snap.error} />
          </section>
        )}

        <section>
          <SectionTitle>
            <ListTree className="h-3.5 w-3.5" /> Parameters
          </SectionTitle>
          <ParamGrid values={snap.inputsPreview} />
        </section>
      </div>
    </ScrollArea>
  );
};

interface RunPanelProps {
  activeRun: ActiveRun;
}

export const RunPanel = ({ activeRun }: RunPanelProps) => {
  const { runId, kind } = activeRun;
  const { setTab, closeRun, store } = useRunPanel();
  const snap = useRunSnapshot(runId);
  const elapsed = useElapsed(
    snap?.startedAtMs ?? null,
    snap?.finishedAtMs ?? null,
    snap?.live ?? false,
  );

  const status = snap?.status || "queued";
  const terminal = isTerminalStatus(status);
  const live = snap?.live ?? false;

  // Script never has a graph tab; coerce a stale "graph" selection.
  const tab = useMemo(() => {
    if (kind === "script" && activeRun.tab === "graph") return "logs";
    return activeRun.tab;
  }, [kind, activeRun.tab]);

  const HeaderIcon = kind === "workflow" ? Workflow : Terminal;
  const title =
    snap?.name || (kind === "workflow" ? "Workflow run" : "Script run");

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5 rounded-lg bg-purple-50 p-1.5 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
            <HeaderIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h3>
            <div className="mt-1 flex items-center gap-2">
              <StatusPill status={status} live={live} />
              <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
                #{runId.slice(0, 8)}
              </span>
              <ElapsedBadge seconds={elapsed} />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {live && !terminal && (
            <button
              type="button"
              onClick={() => void store.cancel(runId)}
              title="Cancel run"
              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/40"
            >
              <Square className="h-3 w-3" />
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={closeRun}
            title="Close panel"
            className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as ActiveRun["tab"])}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b border-gray-200 px-3 dark:border-gray-800">
          <TabsList className="h-11 gap-1 bg-transparent">
            {kind === "workflow" && (
              <TabsTrigger
                value="graph"
                className="rounded-md px-3 text-xs data-[state=active]:bg-gray-100 data-[state=active]:text-purple-600 dark:data-[state=active]:bg-gray-800 dark:data-[state=active]:text-purple-400"
              >
                <Network className="mr-1.5 h-3.5 w-3.5" />
                Graph
              </TabsTrigger>
            )}
            <TabsTrigger
              value="logs"
              className="rounded-md px-3 text-xs data-[state=active]:bg-gray-100 data-[state=active]:text-purple-600 dark:data-[state=active]:bg-gray-800 dark:data-[state=active]:text-purple-400"
            >
              <ScrollText className="mr-1.5 h-3.5 w-3.5" />
              Logs
            </TabsTrigger>
            <TabsTrigger
              value="response"
              className="rounded-md px-3 text-xs data-[state=active]:bg-gray-100 data-[state=active]:text-purple-600 dark:data-[state=active]:bg-gray-800 dark:data-[state=active]:text-purple-400"
            >
              <Activity className="mr-1.5 h-3.5 w-3.5" />
              {kind === "workflow" ? "Response" : "Details"}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1">
          {kind === "workflow" && (
            <TabsContent value="graph" className="m-0 h-full data-[state=inactive]:hidden">
              {snap?.workflowId ? (
                <RunGraph
                  workflowId={snap.workflowId}
                  nodeStatuses={snap.nodeStatuses}
                  nodeDurations={snap.nodeDurations}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-sm text-gray-500 dark:text-gray-400">
                  Resolving workflow graph…
                </div>
              )}
            </TabsContent>
          )}

          <TabsContent value="logs" className="m-0 h-full data-[state=inactive]:hidden">
            <ExecutionTerminal
              logs={snap?.logs ?? []}
              elapsedSeconds={live ? elapsed : null}
              runId={runId}
            />
          </TabsContent>

          <TabsContent value="response" className="m-0 h-full data-[state=inactive]:hidden">
            {snap ? (
              kind === "workflow" ? (
                <WorkflowResponse snap={snap} elapsed={elapsed} />
              ) : (
                <ScriptDetails snap={snap} elapsed={elapsed} />
              )
            ) : null}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default RunPanel;
