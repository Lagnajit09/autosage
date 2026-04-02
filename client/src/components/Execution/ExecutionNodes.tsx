import { useState, useEffect } from "react";
import { Reorder } from "framer-motion";
import {
  GripVertical,
  CheckCircle,
  AlertCircle,
  Clock,
  PlayCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkflowData, Node as WorkflowNode } from "@/utils/types";

interface ExecutionNode extends WorkflowNode {
  status: "success" | "error" | "pending" | "running";
  duration?: string;
}

interface ExecutionNodesProps {
  workflow: WorkflowData | null;
}

const ExecutionNodes = ({ workflow }: ExecutionNodesProps) => {
  const [nodes, setNodes] = useState<ExecutionNode[]>([]);

  useEffect(() => {
    if (workflow) {
      // Simple sequential sorting based on edges
      const sortedNodes: ExecutionNode[] = [];
      const visited = new Set<string>();
      
      // Find trigger nodes or nodes with no incoming edges
      const targetIds = new Set(workflow.edges.map(e => e.target));
      const startNodes = workflow.nodes.filter(n => !targetIds.has(n.id));
      
      // If no start nodes found (cycle or something), just use all nodes
      const queue = startNodes.length > 0 ? [...startNodes] : [...workflow.nodes];
      
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current.id)) continue;
        
        visited.add(current.id);
        sortedNodes.push({
          ...current,
          status: "pending",
          duration: undefined
        });
        
        // Find next nodes
        const nextIds = workflow.edges
          .filter(e => e.source === current.id)
          .map(e => e.target);
          
        const nextNodes = workflow.nodes.filter(n => nextIds.includes(n.id) && !visited.has(n.id));
        queue.push(...nextNodes);
      }

      // Add any orphaned nodes
      workflow.nodes.forEach(n => {
        if (!visited.has(n.id)) {
          sortedNodes.push({
            ...n,
            status: "pending"
          });
        }
      });

      setNodes(sortedNodes);
    }
  }, [workflow]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "running":
        return <PlayCircle className="w-4 h-4 text-blue-500 animate-pulse" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  if (!workflow) return null;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="space-y-3">
        {nodes.map((node, index) => (
          <div
            key={node.id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm flex items-center gap-3 group hover:border-purple-500/50 transition-colors"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] font-bold text-gray-400">
              {index + 1}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                  {node.data?.label || node.type || "Untitled Node"}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono text-right">
                  {node.duration}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold tracking-wider",
                    node.type === "trigger"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  )}
                >
                  {node.type}
                </span>
                <div className="flex items-center gap-1.5 ml-auto">
                  {getStatusIcon(node.status)}
                  <span className="text-xs capitalize text-gray-600 dark:text-gray-300">
                    {node.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExecutionNodes;
