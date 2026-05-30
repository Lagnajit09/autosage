import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import LeftNav from "@/components/LeftNav";
import { ExecutionLogsHeader } from "@/components/ExecutionLogs/ExecutionLogsHeader";
import { ExecutionLogsFilters } from "@/components/ExecutionLogs/ExecutionLogsFilters";
import {
  ExecutionLogsTable,
  ExecutionRecord,
} from "@/components/ExecutionLogs/ExecutionLogsTable";
import { ExecutionLogsPagination } from "@/components/ExecutionLogs/ExecutionLogsPagination";
import { executionsService } from "@/lib/api/executions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const PAGE_SIZE = 20;

const ExecutionLogs = () => {
  const { getToken, isSignedIn } = useAuth();
  const navigate = useNavigate();

  // Core Data & Loading
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // Pagination metadata
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  // Current page state
  const [currentPage, setCurrentPage] = useState(1);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | "workflow" | "script"
  >("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<
    "created_at" | "name" | "duration"
  >("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Fetch Unified Executions with pagination
  const fetchExecutions = useCallback(
    async (page = 1, silent = false) => {
      if (!isSignedIn) return;
      if (!silent) setLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("No authentication token");

        const data = await executionsService.getAllExecutions(
          token,
          page,
          PAGE_SIZE,
        );
        // data contains executions and pagination metadata
        setExecutions(data.executions || []);
        setTotalPages(data.total_pages || 1);
        setTotalRecords(data.total_count || 0);
        setCurrentPage(page);

        if (silent) {
          toast.success("Execution logs refreshed.");
        }
      } catch (error) {
        console.error("Failed to fetch executions:", error);
        toast.error("Failed to load execution logs.");
      } finally {
        setLoading(false);
      }
    },
    [getToken, isSignedIn],
  );

  useEffect(() => {
    // Initial load fetch
    fetchExecutions(1);
  }, [fetchExecutions]);

  // Sorting Handler
  const handleSort = (field: "created_at" | "name" | "duration") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
    setCurrentPage(1); // Reset page on sort change
  };

  // Helper to parse duration string (e.g. "12.5s", "1.5m", "0s") into seconds for sorting
  const parseDuration = (dur: string) => {
    if (!dur || dur === "0s" || dur === "—") return 0;
    const value = parseFloat(dur);
    if (isNaN(value)) return 0;
    if (dur.includes("m")) return value * 60;
    if (dur.includes("h")) return value * 3600;
    return value;
  };

  // Filtered & Sorted executions
  const processedExecutions = useMemo(() => {
    return executions
      .filter((item) => {
        // Category Filter
        if (categoryFilter !== "all" && item.tag !== categoryFilter)
          return false;

        // Status Filter
        if (statusFilter !== "all") {
          const normalizedStatus =
            item.status === "completed" || item.status === "success"
              ? "success"
              : item.status === "pending" || item.status === "running"
                ? "running"
                : item.status;
          if (normalizedStatus !== statusFilter) return false;
        }

        // Search Query
        const query = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortField === "created_at") {
          comparison =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        } else if (sortField === "name") {
          comparison = a.name.localeCompare(b.name);
        } else if (sortField === "duration") {
          comparison = parseDuration(a.duration) - parseDuration(b.duration);
        }
        return sortOrder === "asc" ? comparison : -comparison;
      });
  }, [
    executions,
    searchQuery,
    categoryFilter,
    statusFilter,
    sortField,
    sortOrder,
  ]);

  // Date Range Filtering for Exports
  const getFilteredExportList = (range: "24h" | "7d" | "30d" | "all") => {
    if (range === "all") return processedExecutions;
    const now = new Date().getTime();
    let limit = 0;
    if (range === "24h") {
      // Today: start of current day
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      limit = startOfDay.getTime();
    } else if (range === "7d") {
      limit = now - 7 * 24 * 60 * 60 * 1000;
    } else if (range === "30d") {
      // Current Month: start of the month
      const startOfMonth = new Date(now);
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      limit = startOfMonth.getTime();
    }
    return processedExecutions.filter(
      (item) => new Date(item.created_at).getTime() >= limit,
    );
  };

  // Helper to fetch GCS log files client-side on user click
  const fetchLogContent = async (url?: string | null) => {
    if (!url) return "";
    try {
      const response = await fetch(url);
      if (!response.ok) return "";
      return await response.text();
    } catch (e) {
      console.error("GCS fetch failed:", e);
      return "";
    }
  };

  // Retrieve and Aggregate logs for a Workflow Run (queries node runs, then fetches node-level logs from GCS)
  const getWorkflowAggregatedLogs = async (run: ExecutionRecord) => {
    const token = await getToken();
    if (!token) throw new Error("No token");

    const nodes = await executionsService.getWorkflowNodeRuns(token, run.id);
    let aggregated = `Workflow: ${run.name} (${run.workflow_id || "N/A"})\n`;
    aggregated += `Run ID: ${run.id}\n`;
    aggregated += `Status: ${run.status}\n`;
    aggregated += `Started: ${run.created_at}\n`;
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

  // Script Log Aggregation (fetches STDOUT/STDERR logs from GCS)
  const getScriptAggregatedLogs = async (run: ExecutionRecord) => {
    let logs = "";
    if (run.logs_signed_url) {
      logs = await fetchLogContent(run.logs_signed_url);
    }
    if (!logs && run.stdout_signed_url) {
      const stdout = await fetchLogContent(run.stdout_signed_url);
      const stderr = await fetchLogContent(run.stderr_signed_url);
      if (stdout) logs += `--- STDOUT ---\n${stdout}\n`;
      if (stderr) logs += `--- STDERR ---\n${stderr}\n`;
    }
    if (!logs) {
      logs = `No execution logs found on GCS for Script Execution ${run.id}\nStatus: ${run.status}`;
    }
    return logs;
  };

  // Copy Logs to Clipboard
  const handleCopyLogs = async (item: ExecutionRecord) => {
    toast.promise(
      (async () => {
        let logs = "";
        if (item.tag === "workflow") {
          logs = await getWorkflowAggregatedLogs(item);
        } else {
          logs = await getScriptAggregatedLogs(item);
        }
        await navigator.clipboard.writeText(logs);
      })(),
      {
        loading: "Retrieving logs from GCS...",
        success: "Logs successfully copied to clipboard!",
        error: "Failed to copy logs.",
      },
    );
  };

  // Download Logs as File
  const handleDownloadLogs = async (item: ExecutionRecord) => {
    toast.promise(
      (async () => {
        let logs = "";
        if (item.tag === "workflow") {
          logs = await getWorkflowAggregatedLogs(item);
        } else {
          logs = await getScriptAggregatedLogs(item);
        }
        const blob = new Blob([logs], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${item.tag}_run_${item.id.substring(0, 8)}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })(),
      {
        loading: "Downloading logs from GCS...",
        success: "Download started successfully!",
        error: "Failed to download logs.",
      },
    );
  };

  // Export full table list to JSON
  const handleExportJSON = (range: "24h" | "7d" | "30d" | "all") => {
    try {
      const itemsToExport = getFilteredExportList(range);
      if (itemsToExport.length === 0) {
        toast.warning("No records available to export for this date range.");
        return;
      }

      // Strip any signed URL fields before exporting
      const sanitizedItems = itemsToExport.map((item) => ({
        id: item.id,
        name: item.name,
        tag: item.tag,
        duration: item.duration,
        status: item.status,
        created_at: item.created_at,
      }));

      const dataStr =
        "data:text/json;charset=utf-8," +
        encodeURIComponent(JSON.stringify(sanitizedItems, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute(
        "download",
        `autosage_executions_${range}_${Date.now()}.json`,
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast.success(`JSON export (${range}) completed.`);
    } catch (e) {
      toast.error("Failed to export JSON.");
    }
  };

  // Export full table list to CSV
  const handleExportCSV = (range: "24h" | "7d" | "30d" | "all") => {
    try {
      const itemsToExport = getFilteredExportList(range);
      if (itemsToExport.length === 0) {
        toast.warning("No records available to export for this date range.");
        return;
      }

      const headers = ["ID", "Name", "Type", "Duration", "Status", "Date"];
      const rows = itemsToExport.map((item) => [
        item.id,
        `"${item.name.replace(/"/g, '""')}"`,
        item.tag,
        item.duration,
        item.status,
        item.created_at,
      ]);
      const csvContent =
        "data:text/csv;charset=utf-8," +
        [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", encodeURI(csvContent));
      downloadAnchor.setAttribute(
        "download",
        `autosage_executions_${range}_${Date.now()}.csv`,
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast.success(`CSV export (${range}) completed.`);
    } catch (e) {
      toast.error("Failed to export CSV.");
    }
  };

  return (
    <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
      <LeftNav />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
            {/* Header Section */}
            <ExecutionLogsHeader
              loading={loading}
              onRefresh={() => fetchExecutions(currentPage, true)}
              onExportCSV={handleExportCSV}
              onExportJSON={handleExportJSON}
            />

            {/* Filters Bar */}
            <ExecutionLogsFilters
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />

            {/* Table Area */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700/50 shadow-sm">
                <Loader2 className="w-8 h-8 animate-spin text-[#a768d0]" />
                <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 animate-pulse">
                  Loading logs...
                </span>
              </div>
            ) : (
              <>
                <ExecutionLogsTable
                  executions={processedExecutions}
                  sortField={sortField}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                  onCopyLogs={handleCopyLogs}
                  onDownloadLogs={handleDownloadLogs}
                  onNavigate={navigate}
                />

                {/* Pagination */}
                <ExecutionLogsPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalRecords={totalRecords}
                  pageSize={PAGE_SIZE}
                  onPageChange={(page) => fetchExecutions(page)}
                />
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default ExecutionLogs;
