import React, { useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Download,
  Loader2,
  Hash,
  Calendar,
  FileText,
  Activity,
  Terminal,
} from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { executionsService } from "@/lib/api/executions";
import { ScriptExecution } from "@/utils/types";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ExecutionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExecutionHistoryModal({
  isOpen,
  onClose,
}: ExecutionHistoryModalProps) {
  const { getToken } = useAuth();
  const [executions, setExecutions] = useState<ScriptExecution[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchHistory = async (pageNumber: number) => {
    setIsLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("No authentication token");

      const response = await executionsService.getHistory(token, pageNumber);
      setExecutions(response.executions);
      setTotalPages(response.total_pages);
      setPage(response.current_page);
    } catch (error) {
      console.error("Failed to fetch execution history:", error);
      toast.error("Failed to load execution history.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory(1);
    } else {
      setExecutions([]);
      setPage(1);
      setTotalPages(1);
    }
  }, [isOpen]);

  const copyToClipboard = (text: string, description: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${description} copied to clipboard`);
  };

  const copyLogs = (execution: ScriptExecution) => {
    const logs = `STDOUT:\n${execution.stdout || "None"}\n\nSTDERR:\n${
      execution.stderr || "None"
    }`;
    copyToClipboard(logs, "Execution logs");
  };

  const downloadLogs = (execution: ScriptExecution) => {
    const logs = `Script: ${execution.script_name} (ID: ${execution.script_id})
Execution ID: ${execution.id}
Date: ${execution.created_at}
Status: ${execution.status}
Exit Code: ${execution.exit_code}

================ STDOUT ================
${execution.stdout || ""}

================ STDERR ================
${execution.stderr || ""}
`;
    const blob = new Blob([logs], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `execution_${execution.id.substring(0, 8)}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return formatInTimeZone(
      date,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      "PP pp",
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
            Success
          </Badge>
        );
      case "failed":
        return (
          <Badge
            variant="destructive"
            className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/20 transition-colors"
          >
            Failed
          </Badge>
        );
      case "running":
        return (
          <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20 transition-colors animate-pulse">
            Running
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="capitalize text-muted-foreground">
            {status}
          </Badge>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-2xl">
        <DialogHeader className="px-1">
          <DialogTitle className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Terminal className="h-6 w-6 text-purple-500" />
            Execution History
          </DialogTitle>
          <DialogDescription className="text-zinc-500 dark:text-zinc-400">
            Monitor and review your previous script execution outcomes, logs,
            and metadata.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto mt-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
          <Table>
            <TableHeader className="sticky top-0 z-20 bg-zinc-100/80 dark:bg-zinc-900/90 backdrop-blur-md">
              <TableRow className="hover:bg-transparent border-zinc-200 dark:border-zinc-800">
                <TableHead className="w-[180px] font-semibold text-zinc-700 dark:text-zinc-300">
                  <div className="flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5" />
                    Execution ID
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-zinc-700 dark:text-zinc-300">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    Date & Time
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-zinc-700 dark:text-zinc-300">
                  Script ID
                </TableHead>
                <TableHead className="font-semibold text-zinc-700 dark:text-zinc-300">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" />
                    Script Name
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-zinc-700 dark:text-zinc-300">
                  <div className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5" />
                    Status
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-zinc-700 dark:text-zinc-300 text-center">
                  Code
                </TableHead>
                <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="dark:bg-zinc-900/20 dark:hover:bg-zinc-900/20">
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                      <p className="text-sm text-zinc-500 animate-pulse">
                        Fetching history...
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : executions.length === 0 ? (
                <TableRow className="dark:bg-zinc-900/20 dark:hover:bg-zinc-900/20">
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-lg font-medium text-zinc-400 dark:text-zinc-600">
                        No history found
                      </p>
                      <p className="text-sm text-zinc-500 dark:text-zinc-500">
                        Executions will appear here once you run your first
                        script.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TooltipProvider>
                  {executions.map((execution) => (
                    <TableRow
                      key={execution.id}
                      className="group border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <TableCell className="font-mono text-[11px] relative">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-zinc-600 dark:text-zinc-400 truncate max-w-[100px]"
                            title={execution.id}
                          >
                            {execution.id.substring(0, 12)}...
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            onClick={() =>
                              copyToClipboard(execution.id, "Execution ID")
                            }
                          >
                            <Copy className="h-4 w-4 dark:text-zinc-200" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {formatDate(execution.created_at)}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-zinc-500 dark:text-zinc-500">
                        #{execution.script_id}
                      </TableCell>
                      <TableCell
                        className="font-medium text-sm text-zinc-900 dark:text-zinc-200 max-w-[180px] truncate"
                        title={execution.script_name}
                      >
                        {execution.script_name}
                      </TableCell>
                      <TableCell>{getStatusBadge(execution.status)}</TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`text-xs font-mono font-bold ${
                            execution.exit_code === 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }`}
                        >
                          {execution.exit_code !== null
                            ? execution.exit_code
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 dark:hover:bg-zinc-300/20"
                            onClick={() => copyLogs(execution)}
                          >
                            <Copy className="h-4 w-4" />
                            <span className="ml-2 hidden lg:inline">
                              Copy Logs
                            </span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 dark:hover:bg-zinc-300/20"
                            onClick={() => downloadLogs(execution)}
                          >
                            <Download className="h-4 w-4" />
                            <span className="ml-2 hidden lg:inline">
                              Download
                            </span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TooltipProvider>
              )}
            </TableBody>
          </Table>
        </div>

        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between mt-auto pt-6 px-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Page{" "}
              <span className="text-zinc-900 dark:text-zinc-100">{page}</span>{" "}
              of{" "}
              <span className="text-zinc-900 dark:text-zinc-100">
                {totalPages}
              </span>
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900"
                onClick={() => fetchHistory(page - 1)}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900"
                onClick={() => fetchHistory(page + 1)}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
