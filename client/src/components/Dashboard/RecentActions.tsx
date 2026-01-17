import { ArrowRight, FileText, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

// --- Recent Items (Workflows/Scripts) ---
interface RecentItemProps {
  title: string;
  type: "workflow" | "script";
  date: string;
  status?: "active" | "draft";
  total_nodes?: number;
  total_edges?: number;
}

export const RecentItemCard = ({ item }: { item: RecentItemProps }) => {
  return (
    <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800/40 rounded-lg border border-gray-200 dark:border-gray-700/50 hover:border-blue-500/50 transition-colors cursor-pointer group">
      <div className="w-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={`p-2 rounded-md ${item.type === "workflow" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"}`}
          >
            {item.type === "workflow" ? (
              <Zap size={18} />
            ) : (
              <FileText size={18} />
            )}
          </div>
          <div>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-500 transition-colors">
              {item.title}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Edited {item.date}
            </p>
          </div>
        </div>
        {item.total_nodes && (
          <div>
            <p className="text-xs text-purple-600 dark:text-purple-400 border border-purple-600 dark:border-purple-400 rounded-full px-2 py-1">
              {item.total_nodes} nodes
            </p>
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ArrowRight size={16} />
      </Button>
    </div>
  );
};

// --- Recent Executions ---
interface ExecutionProps {
  name: string;
  status: "success" | "failed" | "running";
  time: string;
  duration: string;
}

export const ExecutionRow = ({ execution }: { execution: ExecutionProps }) => {
  const statusColor = {
    success: "text-green-500 bg-green-100 dark:bg-green-900/20",
    failed: "text-red-500 bg-red-100 dark:bg-red-900/20",
    running: "text-blue-500 bg-blue-100 dark:bg-blue-900/20",
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center gap-3">
        <div
          className={`w-2 h-2 rounded-full ${execution.status === "success" ? "bg-green-500" : execution.status === "failed" ? "bg-red-500" : "bg-blue-500 animate-pulse"}`}
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {execution.name}
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>{execution.duration}</span>
        <span>{execution.time}</span>
      </div>
    </div>
  );
};
