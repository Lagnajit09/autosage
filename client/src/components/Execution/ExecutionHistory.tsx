import { useEffect, useState, useCallback } from "react";
import { formatInTimeZone } from "date-fns-tz";
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
  Activity,
  History as HistoryIcon,
} from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { executionsService } from "@/lib/api/executions";
import { WorkflowRun, WorkflowNodeRun } from "@/utils/types";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ExecutionHistoryProps {
  workflowId?: string;
}

const ExecutionHistory = ({ workflowId }: ExecutionHistoryProps) => {
  const { getToken } = useAuth();
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!workflowId) return;
    setIsLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("No authentication token");

      const response = await executionsService.getWorkflowHistory(
        token,
        workflowId,
      );
      setRuns(response);
    } catch (error) {
      console.error("Failed to fetch workflow history:", error);
      toast.error("Failed to load execution history.");
    } finally {
      setIsLoading(false);
    }
  }, [getToken, workflowId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const formatDate = (dateString: string) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return formatInTimeZone(
      date,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      "PP pp",
    );
  };

  const calculateDuration = (start?: string | null, end?: string | null) => {
    if (!start || !end) return "—";
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const diff = (e - s) / 1000;
    return `${diff.toFixed(1)}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
            Success
          </Badge>
        );
      case "failed":
        return (
          <Badge
            variant="destructive"
            className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
          >
            Failed
          </Badge>
        );
      case "running":
        return (
          <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 animate-pulse">
            Running
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

  const fetchLogContent = async (url?: string | null) => {
    if (!url) return "";
    try {
      const response = await fetch(url);
      if (!response.ok) return "";
      return await response.text();
    } catch (e) {
      return "";
    }
  };

  const getAggregatedLogs = async (run: WorkflowRun) => {
    const token = await getToken();
    if (!token) throw new Error("No token");

    const nodes = await executionsService.getWorkflowNodeRuns(token, run.id);
    let aggregated = `Workflow: ${run.workflow_name} (${run.workflow_id})\n`;
    aggregated += `Run ID: ${run.id}\n`;
    aggregated += `Status: ${run.status}\n`;
    aggregated += `Started: ${run.started_at}\n`;
    aggregated += `Finished: ${run.finished_at}\n`;
    if (run.error_message) aggregated += `Error: ${run.error_message}\n`;
    aggregated += `\n==========================================\n\n`;

    for (const node of nodes) {
      if (node.status === "skipped") {
        aggregated += `[NODE: ${node.node_label}] SKIPPED\n\n`;
        continue;
      }

      aggregated += `[NODE: ${node.node_label}] STATUS: ${node.status}\n`;
      if (node.stdout_signed_url || node.stderr_signed_url) {
        const [stdout, stderr] = await Promise.all([
          fetchLogContent(node.stdout_signed_url),
          fetchLogContent(node.stderr_signed_url),
        ]);
        if (stdout) aggregated += `--- STDOUT ---\n${stdout}\n`;
        if (stderr) aggregated += `--- STDERR ---\n${stderr}\n`;
      }
      aggregated += `\n------------------------------------------\n\n`;
    }

    return aggregated;
  };

  const handleCopyLogs = async (run: WorkflowRun) => {
    toast.promise(
      (async () => {
        const logs = await getAggregatedLogs(run);
        await navigator.clipboard.writeText(logs);
      })(),
      {
        loading: "Aggregating logs...",
        success: "Logs copied to clipboard",
        error: "Failed to aggregate logs",
      },
    );
  };

  const handleDownloadLogs = async (run: WorkflowRun) => {
    toast.promise(
      (async () => {
        const logs = await getAggregatedLogs(run);
        const blob = new Blob([logs], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `workflow_run_${run.id.substring(0, 8)}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })(),
      {
        loading: "Preparing logs...",
        success: "Logs downloaded",
        error: "Failed to download logs",
      },
    );
  };

  return (
    <div className="h-full bg-white dark:bg-gray-950 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HistoryIcon className="h-4 h-4 text-purple-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Execution History
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchHistory}
          disabled={isLoading}
          className="h-8 text-xs h-8"
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin mr-2" />
          ) : (
            "Refresh"
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200 dark:border-gray-800">
                <TableHead className="w-[180px]">
                  <div className="flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5" />
                    ID
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    Date
                  </div>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                      <p className="text-xs">Fetching history...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground">
                      <p className="text-sm font-medium">No history yet</p>
                      <p className="text-xs">Run the workflow to see history.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((run) => (
                  <TableRow
                    key={run.id}
                    className="group border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors"
                  >
                    <TableCell className="font-mono text-[10px]">
                      <div className="flex items-center gap-2 h-8">
                        <span className="text-gray-500 truncate max-w-[100px]">
                          {run.id}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            navigator.clipboard.writeText(run.id);
                            toast.success("ID copied");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                      {formatDate(run.created_at)}
                    </TableCell>
                    <TableCell>{getStatusBadge(run.status)}</TableCell>
                    <TableCell className="text-xs font-medium text-gray-500">
                      {calculateDuration(run.started_at, run.finished_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-gray-500 hover:text-purple-600 dark:hover:text-purple-400"
                          onClick={() => handleCopyLogs(run)}
                          disabled={run.status === "queued" || run.status === "running"}
                        >
                          <Copy className="h-3.5 w-3.5 mr-1.5" />
                          <span className="hidden lg:inline">Copy</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-gray-500 hover:text-purple-600 dark:hover:text-purple-400"
                          onClick={() => handleDownloadLogs(run)}
                          disabled={run.status === "queued" || run.status === "running"}
                        >
                          <Download className="h-3.5 w-3.5 mr-1.5" />
                          <span className="hidden lg:inline">Logs</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </ScrollArea>
    </div>
  );
};

export default ExecutionHistory;
