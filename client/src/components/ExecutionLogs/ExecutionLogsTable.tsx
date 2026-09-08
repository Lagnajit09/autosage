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
  AlertTriangle,
  FileJson,
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

// GCS autosagex-logs bucket deletes objects after this many days.
const GCS_RETENTION_DAYS = 90;
// Start warning this many days after creation (i.e. 3 days before the sweep).
const LOG_WARNING_THRESHOLD_DAYS = 87;

interface LogExpiryInfo {
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysUntilExpiry: number;
}

const getLogExpiryInfo = (createdAt: string): LogExpiryInfo => {
  if (!createdAt) {
    return { isExpired: false, isExpiringSoon: false, daysUntilExpiry: 0 };
  }
  const ageDays = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  const daysUntilExpiry = GCS_RETENTION_DAYS - ageDays;
  if (ageDays >= GCS_RETENTION_DAYS) {
    return { isExpired: true, isExpiringSoon: false, daysUntilExpiry: 0 };
  }
  if (ageDays >= LOG_WARNING_THRESHOLD_DAYS) {
    return { isExpired: false, isExpiringSoon: true, daysUntilExpiry };
  }
  return { isExpired: false, isExpiringSoon: false, daysUntilExpiry };
};

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

  // Copy run metadata (no logs) — the fallback when GCS logs have expired.
  const handleCopyMetadata = (item: ExecutionRecord) => {
    const metadata = {
      id: item.id,
      name: item.name,
      type: item.tag,
      workflow_id: item.workflow_id,
      status: item.status,
      duration: item.duration,
      created_at: item.created_at,
    };
    navigator.clipboard.writeText(JSON.stringify(metadata, null, 2));
    toast.success("Metadata copied to clipboard.");
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
          {executions.map((item) => {
            const expiry = getLogExpiryInfo(item.created_at);
            return (
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
                <div className="flex flex-col gap-1">
                  <span>{formatDate(item.created_at)}</span>
                  {expiry.isExpired && (
                    <Badge className="w-fit gap-1 bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 text-[10px] font-medium">
                      Logs unavailable
                    </Badge>
                  )}
                  {expiry.isExpiringSoon && (
                    <Badge className="w-fit gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] font-medium">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      Expires in {expiry.daysUntilExpiry} day
                      {expiry.daysUntilExpiry === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>
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

                  {expiry.isExpired ? (
                    /* Logs swept by GCS retention — only metadata remains. */
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Logs unavailable (past 90-day retention) — copy run metadata"
                      className="h-8 w-8 p-0 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
                      onClick={() => handleCopyMetadata(item)}
                    >
                      <FileJson className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <>
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

                      {expiry.isExpiringSoon && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Copy run metadata before logs expire"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400"
                          onClick={() => handleCopyMetadata(item)}
                        >
                          <FileJson className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
