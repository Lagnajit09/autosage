import { Play, Download, MoreVertical, User, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Template } from "./types";

export const TemplateCard = ({ template }: { template: Template }) => {
  return (
    <div className="group flex flex-col bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden hover:shadow-lg hover:border-purple-500/30 dark:hover:border-purple-500/30 transition-all duration-300">
      <div className="p-4 md:p-6 flex-1">
        <div className="flex items-start justify-between mb-4">
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform duration-300 shadow-sm">
            <Play className="w-6 h-6" />
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
                Preview
              </DropdownMenuItem>
              <DropdownMenuItem className="dark:text-gray-200 dark:hover:bg-gray-800 cursor-pointer">
                Share
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <h3 className="font-semibold text-gray-900 dark:text-white text-lg md:text-xl mb-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
          {template.title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 h-10">
          {template.description}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {template.tags.map((tag) => (
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
            className="capitalize border bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-blue-200 dark:border-blue-500/30"
          >
            {template.category}
          </Badge>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <User className="w-3 h-3" />
            <span>{template.author}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
            <Activity className="w-3 h-3" />
            <span>{template.successRate}% success</span>
          </div>
        </div>
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700/50 flex items-center justify-between gap-2">
        <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-500/20 w-full">
          <Download className="w-4 h-4 mr-2" />
          Use Template
        </Button>
      </div>
    </div>
  );
};
