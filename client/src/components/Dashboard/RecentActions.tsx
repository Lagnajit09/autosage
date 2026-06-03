import { ArrowRight, FileText, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

// --- Recent Items (Workflows/Scripts) ---
interface RecentItemProps {
  /** Workflow UUID. Required for workflows, ignored for scripts (scripts
   * are routed by name — see /script-editor/:name in App.tsx). */
  id?: string;
  title: string;
  type: "workflow" | "script";
  date: string;
  status?: "active" | "draft";
  total_nodes?: number;
  total_edges?: number;
}

export const RecentItemCard = ({ item }: { item: RecentItemProps }) => {
  const navigate = useNavigate();

  // Workflows are routed by id (/workflow/:id), scripts by name
  // (/script-editor/:name) — see App.tsx route table.
  const handleOpen = () => {
    if (item.type === "workflow") {
      if (!item.id) return; // legacy payload — backend now sends id
      navigate(`/workflow/${item.id}`);
    } else {
      navigate(`/script-editor/${encodeURIComponent(item.title)}`);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpen();
        }
      }}
      className="flex items-center justify-between p-4 bg-white dark:bg-gray-800/40 rounded-lg border border-gray-200 dark:border-gray-700/50 hover:border-blue-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors cursor-pointer group"
    >
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
              {item.title.length > 28
                ? item.title.slice(0, 28) + "..."
                : item.title}
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
