import { Play, Download, MoreVertical, User, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Template } from "./types";

export const TemplateListItem = ({ template }: { template: Template }) => {
  return (
    <div className="group flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl hover:shadow-md hover:border-purple-500/30 dark:hover:border-purple-500/30 transition-all duration-300 gap-4 md:gap-0">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 flex-1 w-full">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform duration-300">
            <Play className="w-6 h-6" />
          </div>

          <div className="min-w-0 flex-1 md:w-[200px]">
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">
              {template.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge
                variant="outline"
                className="capitalize border bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-blue-200 dark:border-blue-500/30"
              >
                {template.category}
              </Badge>
              <span className="hidden md:inline text-xs text-gray-400">•</span>
              <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[200px] md:max-w-[300px]">
                {template.description}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400 w-full md:w-auto pl-[60px] md:pl-0">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4" />
            <span>{template.author}</span>
          </div>
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span>{template.downloads} uses</span>
          </div>
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
            <Activity className="w-4 h-4" />
            <span>{template.successRate}% success</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 w-full md:w-auto border-t md:border-none pt-4 md:pt-0 border-gray-100 dark:border-gray-700/50">
        <Button className="bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-500/20">
          <Download className="w-4 h-4 mr-2" />
          Use Template
        </Button>
      </div>
    </div>
  );
};
