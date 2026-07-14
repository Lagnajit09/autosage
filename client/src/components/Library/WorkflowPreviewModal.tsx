import { useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Node as FlowNode,
  Edge as FlowEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTheme } from "@/contexts/theme/theme-context";

interface StoredNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: { label?: string; type?: string };
}

interface StoredEdge {
  id: string;
  source: string;
  target: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  name: string;
  content: Record<string, unknown> | null;
  loading: boolean;
}

// Lightweight, read-only colouring by node type — this is a preview, not the
// full builder UI, so we render simple labelled boxes instead of the rich nodes.
const styleForType = (
  type: string | undefined,
  isDark: boolean,
): React.CSSProperties => {
  const palette: Record<string, { bg: string; border: string; text: string }> =
    {
      trigger: { bg: "#10b98122", border: "#10b981", text: "#065f46" },
      action: { bg: "#3b82f622", border: "#3b82f6", text: "#1e3a8a" },
      decision: { bg: "#f59e0b22", border: "#f59e0b", text: "#92400e" },
    };
  const c = palette[type ?? ""] ?? {
    bg: "#6b728022",
    border: "#6b7280",
    text: "#374151",
  };
  return {
    background: c.bg,
    border: `2px solid ${c.border}`,
    borderRadius: 12,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 600,
    color: isDark ? "#e5e7eb" : c.text,
    width: 170,
    textAlign: "center",
  };
};

export const WorkflowPreviewModal = ({
  open,
  onClose,
  name,
  content,
  loading,
}: Props) => {
  const { isDark } = useTheme();

  const nodes = useMemo<FlowNode[]>(() => {
    const stored = (content?.nodes as StoredNode[] | undefined) ?? [];
    return stored.map((n, i) => ({
      id: n.id,
      position: n.position ?? { x: i * 220, y: 100 },
      data: { label: n.data?.label || n.type || "Node" },
      type: "default",
      draggable: false,
      style: styleForType(n.type, isDark),
    }));
  }, [content, isDark]);

  const edges = useMemo<FlowEdge[]>(() => {
    const stored = (content?.edges as StoredEdge[] | undefined) ?? [];
    // Drop handle ids so edges attach to the default node handles.
    return stored.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      animated: true,
    }));
  }, [content]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl w-[90vw] bg-white dark:bg-black border border-gray-200 dark:border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">
            {name}
          </DialogTitle>
        </DialogHeader>
        <div className="h-[60vh] w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 overflow-hidden">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center text-gray-500 dark:text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <span className="text-sm">Loading preview…</span>
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              This workflow has no nodes to preview.
            </div>
          ) : (
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{
                  style: {
                    stroke: isDark ? "#4B5563" : "#9CA3AF",
                    strokeWidth: 2,
                  },
                  type: "smoothstep",
                }}
              >
                <Background
                  color={isDark ? "#363636" : "#b3b3b3"}
                  gap={24}
                  size={2}
                />
                <Controls
                  showInteractive={false}
                  className="border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm [&>button]:bg-gray-200 dark:[&>button]:bg-gray-800 [&>button]:text-gray-900 dark:[&>button]:text-gray-100"
                />
              </ReactFlow>
            </ReactFlowProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
