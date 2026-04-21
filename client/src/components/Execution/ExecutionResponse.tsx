import { useEffect, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import CodeEditor from "@uiw/react-textarea-code-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Copy, Download, RefreshCw, Database } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { executionsService } from "@/lib/api/executions";
import { WorkflowRun } from "@/utils/types";
import { toast } from "sonner";
import { useTheme } from "@/contexts/theme/theme-context";

interface ExecutionResponseProps {
  workflowId?: string;
  activeRunId?: string | null;
}

const ExecutionResponse = ({
  workflowId,
  activeRunId,
}: ExecutionResponseProps) => {
  const { getToken } = useAuth();
  const { theme } = useTheme();
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunData, setSelectedRunData] = useState<WorkflowRun | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!workflowId) return;
    try {
      const token = await getToken();
      if (!token) return;
      const data = await executionsService.getWorkflowHistory(
        token,
        workflowId,
      );
      setRuns(data);

      // If activeRunId is provided and not already selected, select it
      if (activeRunId && !selectedRunId) {
        setSelectedRunId(activeRunId);
      } else if (!selectedRunId && data.length > 0) {
        setSelectedRunId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  }, [getToken, workflowId, activeRunId, selectedRunId]);

  const fetchRunDetail = useCallback(
    async (runId: string) => {
      setIsLoading(true);
      try {
        const token = await getToken();
        if (!token) return;
        const data = await executionsService.getWorkflowRun(token, runId);
        setSelectedRunData(data);
      } catch (e) {
        console.error(e);
        toast.error("Failed to fetch run details");
      } finally {
        setIsLoading(false);
      }
    },
    [getToken],
  );

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (selectedRunId) {
      fetchRunDetail(selectedRunId);
    }
  }, [selectedRunId, fetchRunDetail]);

  // Sync with activeRunId if it changes (e.g. new run started)
  useEffect(() => {
    if (activeRunId) {
      setSelectedRunId(activeRunId);
      fetchHistory(); // Refresh list to include new run
    }
  }, [activeRunId, fetchHistory]);

  const handleCopy = () => {
    if (!selectedRunData) return;
    navigator.clipboard.writeText(JSON.stringify(selectedRunData, null, 2));
    toast.success("Metadata copied to clipboard");
  };

  const handleDownload = () => {
    if (!selectedRunData) return;
    const blob = new Blob([JSON.stringify(selectedRunData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run_${selectedRunData.id.substring(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full bg-white dark:bg-gray-950 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Database className="h-4 w-4 text-blue-500 shrink-0" />
          <Select
            value={selectedRunId || ""}
            onValueChange={setSelectedRunId}
            disabled={isLoading || runs.length === 0}
          >
            <SelectTrigger className="w-full max-w-[400px] h-9 bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800">
              <SelectValue placeholder="Select execution run..." />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-950 dark:border-gray-800">
              {runs.map((run) => (
                <SelectItem
                  key={run.id}
                  value={run.id}
                  className="font-mono text-xs cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{run.id.substring(0, 8)}</span>
                    <span className="text-gray-500">—</span>
                    <span className="text-gray-400">
                      {new Date(run.created_at).toLocaleTimeString()}
                    </span>
                    <span
                      className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                        run.status === "success"
                          ? "bg-green-100 text-green-700"
                          : run.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 h-9 w-9 shrink-0"
            onClick={fetchHistory}
            title="Refresh history"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>

        {selectedRunData && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 border-gray-200 dark:border-gray-800"
              onClick={handleCopy}
            >
              <Copy className="h-3.5 w-3.5 mr-2" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 border-gray-200 dark:border-gray-800"
              onClick={handleDownload}
            >
              <Download className="h-3.5 w-3.5 mr-2" />
              Download
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden relative group">
        <ScrollArea className="h-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-purple-500 mr-2" />
              <p className="text-sm">Loading metadata...</p>
            </div>
          ) : !selectedRunData ? (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
              <p className="text-sm">No execution selected</p>
            </div>
          ) : (
            <CodeEditor
              value={JSON.stringify(selectedRunData, null, 2)}
              language="json"
              padding={20}
              data-color-mode={theme}
              style={{
                fontSize: 13,
                backgroundColor: "transparent",
                fontFamily:
                  "ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
                minHeight: "100%",
              }}
              className="text-slate-900 dark:text-gray-300"
              disabled
            />
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

const Loader2 = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export default ExecutionResponse;
