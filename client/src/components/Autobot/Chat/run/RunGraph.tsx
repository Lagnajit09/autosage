/**
 * Live execution graph (the new piece in X14). A read-only ReactFlow canvas
 * that reuses the workflow's saved node/edge LAYOUT (positions from the
 * builder) and colors each node live from the run's `nodeStatuses`:
 * running (blue, pulsing edges) → success (emerald) / failed (red) / skipped
 * (dimmed branch). It is intentionally NOT the editable builder canvas — no
 * drag, connect, or select — just a status view.
 *
 * The layout is fetched once per workflow id (`GET /api/workflows/<id>/`) and
 * module-cached, so reopening the drawer is instant.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge as RFEdge,
  type Node as RFNode,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CheckCircle2,
  Circle,
  GitBranch,
  Loader2,
  MinusCircle,
  Play,
  Terminal,
  XCircle,
} from "lucide-react";
import { useAuth } from "@clerk/clerk-react";

import { apiRequest } from "@/lib/api-client";
import { useTheme } from "@/contexts/theme/theme-context";
import { cn } from "@/lib/utils";
import type { WorkflowData } from "@/utils/types";
import {
  STATUS_THEME,
  formatDuration,
  nodeKindAccent,
  toVisualStatus,
  type RunVisual,
} from "./runTypes";

const graphCache = new Map<string, WorkflowData>();

interface RunNodeData {
  label: string;
  kind: string;
  status: string;
  duration?: number;
  [key: string]: unknown; // ReactFlow v12 requires Record<string, unknown>
}
type RunFlowNodeType = RFNode<RunNodeData, "run">;

const kindIcon = (kind: string) =>
  kind === "trigger" ? Play : kind === "decision" ? GitBranch : Terminal;

const StatusGlyph = ({ v }: { v: RunVisual }) => {
  switch (v) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
    case "success":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case "cancelled":
      return <MinusCircle className="h-3.5 w-3.5 text-gray-400" />;
    default:
      return <Circle className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />;
  }
};

const handleCls =
  "!h-2.5 !w-2.5 !border-2 !border-white dark:!border-gray-900 !bg-gray-300 dark:!bg-gray-600";

const RunFlowNode = ({ data }: NodeProps<RunFlowNodeType>) => {
  const v = toVisualStatus(data.status);
  const accent = nodeKindAccent(data.kind);
  const theme = STATUS_THEME[v];
  const Icon = kindIcon(data.kind);
  const isDecision = data.kind === "decision";
  const lit = v === "running" || v === "success" || v === "failed";

  return (
    <div
      className={cn(
        "relative flex min-w-[176px] max-w-[230px] overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-all dark:bg-gray-900",
        lit ? theme.ring : "border-gray-200 dark:border-gray-700",
      )}
    >
      <Handle type="target" position={Position.Left} className={handleCls} />
      <div className={cn("w-1.5 shrink-0", accent.bar)} />
      <div className="min-w-0 flex-1 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500 dark:text-gray-400" />
          <span className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100">
            {data.label}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              accent.tag,
            )}
          >
            {data.kind}
          </span>
          <div className="flex items-center gap-1.5">
            {data.duration != null && (
              <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">
                {formatDuration(data.duration)}
              </span>
            )}
            <StatusGlyph v={v} />
          </div>
        </div>
      </div>
      {isDecision ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            className="!h-2.5 !w-2.5 !border-2 !border-white !bg-emerald-500 dark:!border-gray-900"
          />
          <Handle
            id="false"
            type="source"
            position={Position.Bottom}
            className="!h-2.5 !w-2.5 !border-2 !border-white !bg-red-500 dark:!border-gray-900"
          />
        </>
      ) : (
        <Handle type="source" position={Position.Right} className={handleCls} />
      )}
    </div>
  );
};

const nodeTypes = { run: RunFlowNode };

const CenteredMsg = ({ children }: { children: ReactNode }) => (
  <div className="flex h-full items-center justify-center gap-2 p-6 text-sm text-gray-500 dark:text-gray-400">
    {children}
  </div>
);

interface RunGraphProps {
  workflowId: string;
  nodeStatuses: Record<string, string>;
  nodeDurations: Record<string, number>;
}

const RunGraphInner = ({
  workflowId,
  nodeStatuses,
  nodeDurations,
}: RunGraphProps) => {
  const { isDark } = useTheme();
  const { getToken } = useAuth();
  const [graph, setGraph] = useState<WorkflowData | null>(
    () => graphCache.get(workflowId) ?? null,
  );
  const [loading, setLoading] = useState(!graphCache.has(workflowId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = graphCache.get(workflowId);
    if (cached) {
      setGraph(cached);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        const res = await apiRequest(`/api/workflows/${workflowId}/`, {}, token);
        const data: WorkflowData | undefined = res?.data ?? res;
        if (data && Array.isArray(data.nodes)) {
          graphCache.set(workflowId, data);
          if (!cancelled) setGraph(data);
        } else if (!cancelled) {
          setError("Could not load the workflow graph.");
        }
      } catch {
        if (!cancelled) setError("Could not load the workflow graph.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowId, getToken]);

  const rfNodes = useMemo<RunFlowNodeType[]>(() => {
    if (!graph) return [];
    return graph.nodes.map((n) => ({
      id: n.id,
      type: "run",
      position: n.position ?? { x: 0, y: 0 },
      draggable: false,
      data: {
        label: n.data?.label || n.type || "Node",
        kind: n.type || "action",
        status: nodeStatuses[n.id] || "pending",
        duration: nodeDurations[n.id],
      },
    }));
  }, [graph, nodeStatuses, nodeDurations]);

  const rfEdges = useMemo<RFEdge[]>(() => {
    if (!graph) return [];
    return graph.edges.map((e) => {
      const skipped = nodeStatuses[e.target] === "skipped";
      const stroke = e.style?.stroke || (isDark ? "#4B5563" : "#9CA3AF");
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: e.type || "smoothstep",
        label: e.label,
        animated: nodeStatuses[e.source] === "running",
        style: {
          stroke,
          strokeWidth: e.style?.strokeWidth || 2,
          opacity: skipped ? 0.3 : 1,
          strokeDasharray: skipped ? "5 5" : undefined,
        },
      };
    });
  }, [graph, nodeStatuses, isDark]);

  if (loading)
    return (
      <CenteredMsg>
        <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
        Loading graph…
      </CenteredMsg>
    );
  if (error || !graph) return <CenteredMsg>{error || "No graph available."}</CenteredMsg>;
  if (!graph.nodes.length) return <CenteredMsg>This workflow has no nodes.</CenteredMsg>;

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.2}
      maxZoom={1.5}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
      className="bg-gray-50 dark:bg-black/20"
    >
      <Background color={isDark ? "#363636" : "#cbd5e1"} gap={28} size={1.5} />
      <Controls
        showInteractive={false}
        className="rounded-lg border border-gray-200 shadow-sm dark:border-gray-800 [&>button]:border-gray-200 [&>button]:bg-white [&>button]:text-gray-700 dark:[&>button]:border-gray-700 dark:[&>button]:bg-gray-800 dark:[&>button]:text-gray-200"
      />
    </ReactFlow>
  );
};

export const RunGraph = (props: RunGraphProps) => (
  <ReactFlowProvider>
    <RunGraphInner {...props} />
  </ReactFlowProvider>
);

export default RunGraph;
