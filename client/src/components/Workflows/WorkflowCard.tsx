import { Play, Edit, MoreVertical, Clock, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Workflow } from "./types";
import { useNavigate } from "react-router-dom";

const statusColors = {
  active:
    "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 border-green-200 dark:border-green-500/30",
  draft:
    "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400 border-gray-200 dark:border-gray-500/30",
  paused:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/30",
};

export const WorkflowCard = ({ workflow }: { workflow: Workflow }) => {
  const navigate = useNavigate();
  return (
    <div className="group flex flex-col bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden hover:shadow-lg hover:border-purple-500/30 dark:hover:border-purple-500/30 transition-all duration-300">
      <div className="p-4 md:p-6 flex-1">
        <div className="flex items-start justify-between mb-4">
          <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform duration-300 shadow-sm">
            <Activity className="w-6 h-6" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 dark:hover:bg-gray-500/20"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="dark:bg-gray-900 dark:border-gray-700"
              align="end"
            >
              <DropdownMenuItem className="dark:text-gray-200 dark:hover:bg-gray-800 cursor-pointer">
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem className="dark:text-gray-200 dark:hover:bg-gray-800 cursor-pointer">
                View Logs
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600 dark:text-red-400 dark:hover:bg-gray-800 cursor-pointer">
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <h3 className="font-semibold text-gray-900 dark:text-white text-lg md:text-xl mb-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
          {workflow.title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 h-10">
          {workflow.description}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {workflow.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700/50 text-xs text-gray-600 dark:text-gray-300 font-medium"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700/50">
          <Badge
            variant="outline"
            className={cn("capitalize border", statusColors[workflow.status])}
          >
            {workflow.status}
          </Badge>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            <span>{workflow.lastRun}</span>
          </div>
        </div>
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700/50 flex items-center justify-between gap-2">
        <Button className="flex-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 hover:text-purple-600 dark:hover:text-purple-400 shadow-sm">
          <Edit className="w-4 h-4 mr-2" />
          Edit
        </Button>
        <Button
          onClick={() => navigate(`/workflow/execution/${workflow.id}`)}
          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-500/20"
        >
          <Play className="w-4 h-4 mr-2" />
          Run
        </Button>
      </div>
    </div>
  );
};
