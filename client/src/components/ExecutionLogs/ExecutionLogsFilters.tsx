import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Workflow as WorkflowIcon, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExecutionLogsFiltersProps {
  categoryFilter: "all" | "workflow" | "script";
  setCategoryFilter: (val: "all" | "workflow" | "script") => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
}

export const ExecutionLogsFilters: React.FC<ExecutionLogsFiltersProps> = ({
  categoryFilter,
  setCategoryFilter,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
}) => {
  return (
    <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white dark:bg-gray-800/40 p-4 rounded-xl border border-gray-200 dark:border-gray-700/50 shadow-sm">
      {/* Category Filters */}
      <div className="flex gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-hide">
        <Button
          variant={categoryFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setCategoryFilter("all")}
          className={cn(
            "rounded-lg px-4 font-medium transition-all text-xs h-9",
            categoryFilter === "all"
              ? "bg-[#a768d0] hover:bg-[#9556bf] text-white shadow-sm"
              : "bg-white dark:bg-gray-800/50 dark:text-gray-200",
          )}
        >
          All Types
        </Button>
        <Button
          variant={categoryFilter === "workflow" ? "default" : "outline"}
          size="sm"
          onClick={() => setCategoryFilter("workflow")}
          className={cn(
            "rounded-lg px-4 font-medium transition-all text-xs h-9",
            categoryFilter === "workflow"
              ? "bg-[#a768d0] hover:bg-[#9556bf] text-white shadow-sm"
              : "bg-white dark:bg-gray-800/50 dark:text-gray-200",
          )}
        >
          <WorkflowIcon className="w-3.5 h-3.5 mr-1.5" />
          Workflows
        </Button>
        <Button
          variant={categoryFilter === "script" ? "default" : "outline"}
          size="sm"
          onClick={() => setCategoryFilter("script")}
          className={cn(
            "rounded-lg px-4 font-medium transition-all text-xs h-9",
            categoryFilter === "script"
              ? "bg-[#a768d0] hover:bg-[#9556bf] text-white shadow-sm"
              : "bg-white dark:bg-gray-800/50 dark:text-gray-200",
          )}
        >
          <FileText className="w-3.5 h-3.5 mr-1.5" />
          Scripts
        </Button>
      </div>

      {/* Status & Search Inputs */}
      <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-stretch sm:items-center">
        {/* Status Selector using Shadcn Select */}
        <div className="w-full sm:w-40">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 h-9 text-xs">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
              <SelectItem
                value="all"
                className="cursor-pointer dark:hover:bg-gray-700 text-xs dark:hover:text-gray-200"
              >
                All Statuses
              </SelectItem>
              <SelectItem
                value="success"
                className="cursor-pointer dark:hover:bg-gray-700 text-xs dark:hover:text-gray-200"
              >
                Success
              </SelectItem>
              <SelectItem
                value="failed"
                className="cursor-pointer dark:hover:bg-gray-700 text-xs dark:hover:text-gray-200"
              >
                Failed
              </SelectItem>
              <SelectItem
                value="running"
                className="cursor-pointer dark:hover:bg-gray-700 text-xs dark:hover:text-gray-200"
              >
                Running
              </SelectItem>
              <SelectItem
                value="cancelled"
                className="cursor-pointer dark:hover:bg-gray-700 text-xs dark:hover:text-gray-200"
              >
                Cancelled
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Text Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
          <Input
            placeholder="Search by name or ID..."
            className="pl-9 bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 dark:text-gray-200 h-9 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};
