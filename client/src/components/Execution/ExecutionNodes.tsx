import { useState } from "react";
import { Reorder } from "framer-motion";
import {
  GripVertical,
  CheckCircle,
  AlertCircle,
  Clock,
  PlayCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Node {
  id: string;
  name: string;
  type: string;
  status: "success" | "error" | "pending" | "running";
  duration?: string;
}

const initialNodes: Node[] = [
  {
    id: "1",
    name: "Trigger Webhook",
    type: "trigger",
    status: "success",
    duration: "0.5s",
  },
  {
    id: "2",
    name: "Fetch Data",
    type: "action",
    status: "success",
    duration: "1.2s",
  },
  {
    id: "3",
    name: "Process JSON",
    type: "action",
    status: "running",
    duration: "Pending...",
  },
  { id: "4", name: "Save to DB", type: "action", status: "pending" },
  { id: "5", name: "Send Email", type: "action", status: "pending" },
];

const ExecutionNodes = () => {
  const [nodes, setNodes] = useState(initialNodes);

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

  return (
    <div className="h-full overflow-y-auto p-4">
      <Reorder.Group
        axis="y"
        values={nodes}
        onReorder={setNodes}
        className="space-y-3"
      >
        {nodes.map((node) => (
          <Reorder.Item
            key={node.id}
            value={node}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing flex items-center gap-3 group hover:border-purple-500/50 transition-colors"
          >
            <GripVertical className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                  {node.name}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
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
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  );
};

export default ExecutionNodes;
