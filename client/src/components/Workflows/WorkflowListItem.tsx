import { Play, Edit, Trash2, Clock, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Workflow } from "./types";
import { useNavigate } from "react-router-dom";

export const WorkflowListItem = ({
  workflow,
  onDelete,
}: {
  workflow: Workflow;
  onDelete: (workflowId: string) => void;
}) => {
  const navigate = useNavigate();
  return (
    <div className="group flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl hover:shadow-md hover:border-purple-500/30 dark:hover:border-purple-500/30 transition-all duration-300 gap-4 md:gap-0">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 flex-1 w-full">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform duration-300">
            <Activity className="w-6 h-6" />
          </div>

          <div className="min-w-0 flex-1 md:w-[200px]">
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">
              {workflow.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {/* <Badge
                variant="outline"
                className={cn(
                  "capitalize border",
                  statusColors[workflow.status]
                )}
              >
                {workflow.status}
              </Badge> */}
              {/* <span className="hidden md:inline text-xs text-gray-400">•</span> */}
              <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[200px] md:max-w-[300px]">
                {workflow.description}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400 w-full md:w-auto pl-[60px] md:pl-0">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "capitalize border",
                "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 border-green-200 dark:border-green-500/30",
              )}
            >
              {workflow.total_nodes} nodes
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>{workflow.lastRun}</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            <span>{workflow.runs} runs</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 w-full md:w-auto border-t md:border-none pt-4 md:pt-0 border-gray-100 dark:border-gray-700/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/workflow/${workflow.id}/run`)}
          className="text-gray-500 hover:text-purple-600 dark:hover:text-purple-400"
        >
          <Play className="w-4 h-4 mr-2" />
          Run
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/workflow/${workflow.id}`)}
          className="text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"
        >
          <Edit className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(workflow.id)}
          className="text-gray-500 hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
