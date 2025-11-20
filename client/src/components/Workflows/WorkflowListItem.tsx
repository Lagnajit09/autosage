import { Play, Edit, Trash2, Clock, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Workflow } from "./types";

const statusColors = {
  active:
    "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 border-green-200 dark:border-green-500/30",
  draft:
    "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400 border-gray-200 dark:border-gray-500/30",
  paused:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/30",
};

export const WorkflowListItem = ({ workflow }: { workflow: Workflow }) => {
  return (
    <div className="group flex items-center justify-between p-4 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl hover:shadow-md hover:border-purple-500/30 dark:hover:border-purple-500/30 transition-all duration-300">
      <div className="flex items-center gap-6 flex-1">
        <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform duration-300">
          <Activity className="w-6 h-6" />
        </div>

        <div className="min-w-[200px]">
          <h3 className="font-semibold text-gray-900 dark:text-white text-lg group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
            {workflow.title}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant="outline"
              className={cn("capitalize border", statusColors[workflow.status])}
            >
              {workflow.status}
            </Badge>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[300px]">
              {workflow.description}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
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

      <div className="flex items-center gap-2 ml-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-500 hover:text-purple-600 dark:hover:text-purple-400"
        >
          <Play className="w-4 h-4 mr-2" />
          Run
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"
        >
          <Edit className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-500 hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
