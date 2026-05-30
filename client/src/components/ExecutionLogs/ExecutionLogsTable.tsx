import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Copy,
  Download,
  Loader2,
  Hash,
  ArrowUpDown,
  ExternalLink,
  History,
} from "lucide-react";
import { toast } from "sonner";

export interface ExecutionRecord {
  id: string;
  name: string;
  workflow_id?: string;
  duration: string;
  status:
    | "pending"
    | "running"
    | "completed"
    | "success"
    | "failed"
    | "cancelled";
  tag: "workflow" | "script";
  stdout_signed_url?: string;
  stderr_signed_url?: string;
  logs_signed_url?: string;
  created_at: string;
}

interface ExecutionLogsTableProps {
  executions: ExecutionRecord[];
  sortField: "created_at" | "name" | "duration";
  sortOrder: "asc" | "desc";
  onSort: (field: "created_at" | "name" | "duration") => void;
  onCopyLogs: (item: ExecutionRecord) => Promise<void>;
  onDownloadLogs: (item: ExecutionRecord) => Promise<void>;
  onNavigate: (path: string) => void;
}

export const ExecutionLogsTable: React.FC<ExecutionLogsTableProps> = ({
  executions,
  sortField,
  sortOrder,
  onSort,
  onCopyLogs,
  onDownloadLogs,
  onNavigate,
}) => {
  // Formatting Date
  const formatDate = (dateString: string) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return (
      date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      " " +
      date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  };

  // Render Status Badge
  const getStatusBadge = (status: string) => {
    const norm =
      status === "completed" || status === "success" ? "success" : status;
    switch (norm) {
      case "success":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20">
            Success
          </Badge>
        );
      case "failed":
        return (
          <Badge
            variant="destructive"
            className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/20"
          >
            Failed
          </Badge>
        );
      case "running":
        return (
          <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin mr-1 inline" />
            Running
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
            Pending
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20">
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="capitalize">
            {status}
          </Badge>
        );
    }
  };

  if (executions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl">
        <div className="bg-gray-100 dark:bg-gray-800/60 p-4 rounded-full mb-4">
          <History className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          No executions found
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-sm text-sm">
          No execution records match your search criteria or date ranges.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700/50 overflow-hidden shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-200 dark:border-gray-800 hover:bg-transparent">
            <TableHead className="w-[180px]">
              <Button
                variant="ghost"
                onClick={() => onSort("name")}
                className="hover:bg-transparent p-0 text-gray-500 font-semibold flex items-center gap-1.5"
              >
                Name
                <ArrowUpDown className="h-3.5 w-3.5" />
              </Button>
            </TableHead>
            <TableHead className="w-[120px]">
              <div className="flex items-center gap-2">
                <Hash className="h-3.5 w-3.5" />
                ID
              </div>
            </TableHead>
            <TableHead className="w-[100px]">Type</TableHead>
            <TableHead className="w-[120px]">
              <Button
                variant="ghost"
                onClick={() => onSort("duration")}
                className="hover:bg-transparent p-0 text-gray-500 font-semibold flex items-center gap-1.5"
              >
                Duration
                <ArrowUpDown className="h-3.5 w-3.5" />
              </Button>
            </TableHead>
            <TableHead className="w-[120px]">Status</TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => onSort("created_at")}
                className="hover:bg-transparent p-0 text-gray-500 font-semibold flex items-center gap-1.5"
              >
                Date
                <ArrowUpDown className="h-3.5 w-3.5" />
              </Button>
            </TableHead>
            <TableHead className="text-right w-[150px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {executions.map((item) => (
            <TableRow
              key={item.id}
              className="group border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors"
            >
              <TableCell className="font-semibold text-xs text-gray-900 dark:text-gray-100 max-w-[200px] truncate">
                {item.name}
              </TableCell>
              <TableCell className="font-mono text-[10px] text-gray-500">
                <div className="flex items-center gap-1">
                  <span className="truncate max-w-[80px]" title={item.id}>
                    {item.id}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => {
                      navigator.clipboard.writeText(item.id);
                      toast.success("ID copied to clipboard.");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </TableCell>
              <TableCell>
                {item.tag === "workflow" ? (
                  <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 border-none font-medium hover:bg-purple-200">
                    Workflow
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 border-none font-medium hover:bg-emerald-200">
                    Script
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                {item.duration || "—"}
              </TableCell>
              <TableCell>{getStatusBadge(item.status)}</TableCell>
              <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                {formatDate(item.created_at)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {/* Redirection for Workflow executions or Scripts */}
                  <Button
                    variant="ghost"
                    size="sm"
                    title={`Go to ${item.tag} execution details`}
                    className="h-8 w-8 p-0 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
                    onClick={() =>
                      onNavigate(
                        item.tag === "workflow"
                          ? `/workflow/execution/${item.workflow_id}`
                          : `/script-editor/${item.name}`,
                      )
                    }
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-[#a768d0]" />
                  </Button>

                  {/* Log Actions (Copy/Download) */}
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Copy log to clipboard"
                    className="h-8 w-8 p-0 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
                    onClick={() => onCopyLogs(item)}
                    disabled={
                      item.status === "pending" || item.status === "running"
                    }
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    title="Download log"
                    className="h-8 w-8 p-0 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
                    onClick={() => onDownloadLogs(item)}
                    disabled={
                      item.status === "pending" || item.status === "running"
                    }
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
