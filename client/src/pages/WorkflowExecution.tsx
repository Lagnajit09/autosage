import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import LeftNav from "@/components/LeftNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Play,
  Settings,
  Terminal,
  FileText,
  History,
  Activity,
  Pencil,
  Square,
} from "lucide-react";
import ExecutionNodes from "@/components/Execution/ExecutionNodes";
import ExecutionTerminal from "@/components/Execution/ExecutionTerminal";
import ExecutionLogs from "@/components/Execution/ExecutionLogs";
import ExecutionHistory from "@/components/Execution/ExecutionHistory";
import ExecutionResponse from "@/components/Execution/ExecutionResponse";
import ExecutionParameters from "@/components/Execution/ExecutionParameters";
import { useAuth } from "@clerk/clerk-react";
import { apiRequest } from "@/lib/api-client";
import Loader from "@/components/Loader";
import { WorkflowData } from "@/utils/types";

const WorkflowExecution = () => {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("terminal");
  const [isExecuting, setIsExecuting] = useState(false);
  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [runId, setRunId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isCancelling, setIsCancelling] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, string>>({});
  const [nodeDurations, setNodeDurations] = useState<Record<string, number>>({});

  const { getToken, isSignedIn } = useAuth();
  const navigate = useNavigate();

  // Start/stop the elapsed-seconds counter based on isExecuting
  useEffect(() => {
    if (isExecuting) {
      setElapsedSeconds(0);
      elapsedTimerRef.current = setInterval(() => {
        setElapsedSeconds((s) => (s ?? 0) + 1);
      }, 1000);
    } else {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    }
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, [isExecuting]);

  useEffect(() => {
    const fetchWorkflow = async () => {
      if (!id || !isSignedIn) return;
      try {
        const token = await getToken();
        const response = await apiRequest(`/api/workflows/${id}/`, {}, token);
        const data = response?.data || response;
        setWorkflow(data);

        // Initialize inputs
        const initialInputs: Record<string, string> = {};
        data?.nodes?.forEach((node: any) => {
          node.data?.parameters?.forEach((param: any) => {
            if (param.id) {
              initialInputs[param.id] = param.value || "";
            }
          });
        });
        setInputs(initialInputs);
      } catch (error) {
        console.error("Failed to fetch workflow:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkflow();
  }, [id, isSignedIn, getToken]);

  const streamLogs = async (targetRunId: string) => {
    try {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/execution-engine/workflows/runs/${targetRunId}/stream/`,
        {
          headers: {
            Authorization: token
              ? token.split(".").length === 3
                ? `Bearer ${token}`
                : token
              : "",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to start log stream");
      }

      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, "\n");
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          if (!frame.trim()) continue;

          let eventName = "message";
          let dataStr = "";

          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) {
              eventName = line.slice("event:".length).trim();
            } else if (line.startsWith("data:")) {
              if (dataStr) dataStr += "\n";
              dataStr += line.slice("data:".length).trim();
            }
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);
            console.log(`[SSE ${eventName}]`, data);

            if (
              eventName === "log" ||
              eventName === "stdout" ||
              eventName === "stderr"
            ) {
              setLogs((prev) => [
                ...prev,
                data.data || data.stdout || data.stderr || JSON.stringify(data),
              ]);
            } else if (eventName === "status") {
              setLogs((prev) => [...prev, `[STATUS] Workflow: ${data.status}`]);
            } else if (eventName === "node_start") {
              setNodeStatuses((prev) => ({
                ...prev,
                [data.node_id]: "running",
              }));
              setLogs((prev) => [...prev, `[START] Node start: ${data.node_label}`]);
            } else if (eventName === "node_complete") {
              setNodeStatuses((prev) => ({
                ...prev,
                [data.node_id]: data.status,
              }));
              if (data.duration !== undefined) {
                setNodeDurations((prev) => ({
                  ...prev,
                  [data.node_id]: data.duration,
                }));
              }
              if (data.status === "skipped") {
                setLogs((prev) => [
                  ...prev,
                  `[SKIP] Node skipped: ${data.node_label}`,
                ]);
              } else if (data.status === "success" || data.status === "running") {
                setLogs((prev) => [
                  ...prev,
                  `[SUCCESS] Node complete: ${data.node_label}`,
                ]);
              } else {
                setLogs((prev) => [
                  ...prev,
                  `[ERROR] Node complete: ${data.node_label} (${data.status})`,
                ]);
              }
            } else if (eventName === "done") {
              setLogs((prev) => [
                ...prev,
                `[DONE] Workflow execution finished`,
              ]);
              setIsExecuting(false);
            }
          } catch (e) {
            console.error("Failed to parse SSE data:", e, "raw:", dataStr);
          }
        }
      }
    } catch (e) {
      console.error("Log streaming error:", e);
      setIsExecuting(false);
    }
  };
  const handleCancel = async () => {
    if (!runId || isCancelling) return;
    setIsCancelling(true);
    try {
      const token = await getToken();
      await apiRequest(
        `/api/execution-engine/workflows/runs/${runId}/cancel/`,
        { method: "POST" },
        token,
      );
      setLogs((prev) => [...prev, "> Cancellation requested."]);
    } catch (e) {
      console.error("Cancel failed:", e);
      setLogs((prev) => [...prev, `> Cancel failed: ${e}`]);
    } finally {
      setIsCancelling(false);
      setIsExecuting(false);
    }
  };

  const handleExecute = async () => {
    setIsExecuting(true);
    setLogs([]);
    setNodeStatuses({});
    setNodeDurations({});
    setActiveTab("terminal");
    try {
      const token = await getToken();
      const response = await apiRequest(
        `/api/execution-engine/workflows/${id}/run/`,
        {
          method: "POST",
          body: JSON.stringify({ inputs }),
        },
        token,
      );

      const newRunId =
        response?.data?.workflow_run_id || response?.workflow_run_id;
      if (newRunId) {
        setRunId(newRunId);
        setLogs([
          `> Starting execution for workflow #${id}... (Run ID: ${newRunId})`,
        ]);
        // Do not await, stream logs in background
        streamLogs(newRunId);
      } else {
        setIsExecuting(false);
        setLogs([`> Error: Could not start execution. Invalid response.`]);
      }
    } catch (e) {
      console.error(e);
      setLogs([`> Error starting execution: ${e}`]);
      setIsExecuting(false);
    }
  };
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-workflow-void/90">
        <Loader />
      </div>
    );
  }

  return (
    <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
      <LeftNav />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {workflow?.name || "Untitled Workflow"}{" "}
              <span className="text-gray-400 dark:text-gray-600 text-sm">
                #{id}
              </span>
            </h1>
            <div className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Active
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => navigate(`/workflow/${id}`)}
              disabled={isExecuting}
              className="bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 shadow-md shadow-blue-500/20"
            >
              <Pencil className={`w-4 h-4`} />
              Edit
            </Button>
            {isExecuting && (
              <Button
                onClick={handleCancel}
                disabled={isCancelling}
                className="bg-red-100 dark:bg-red-900/30 border-2 border-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 shadow-md shadow-red-500/20"
              >
                <Square className="w-4 h-4 mr-2" />
                {isCancelling ? "Cancelling..." : "Cancel"}
              </Button>
            )}
            <Button
              onClick={handleExecute}
              disabled={isExecuting}
              className="bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20"
            >
              <Play
                className={`w-4 h-4 mr-2 ${isExecuting ? "animate-spin" : ""}`}
              />
              {isExecuting ? "Executing..." : "Run Workflow"}
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 min-h-0 overflow-hidden p-4 flex gap-4">
          {/* Left Column - Nodes & Parameters */}
          <div className="w-1/3 flex flex-col gap-4 overflow-hidden">
            {/* Parameters Section */}
            <Card className="shrink-0 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
              <CardHeader className="py-4 px-6 border-b border-gray-200 dark:border-gray-800">
                <CardTitle className="text-sm font-medium flex items-center gap-2 dark:text-gray-200">
                  <Settings className="w-4 h-4 text-purple-500" />
                  Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 max-h-[300px] overflow-y-auto">
                <ExecutionParameters
                  workflow={workflow}
                  inputs={inputs}
                  onInputChange={(paramId, value) =>
                    setInputs((prev) => ({ ...prev, [paramId]: value }))
                  }
                />
              </CardContent>
            </Card>

            {/* Nodes List Section */}
            <Card className="flex-1 flex flex-col overflow-hidden border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
              <CardHeader className="py-4 px-6 border-b border-gray-200 dark:border-gray-800">
                <CardTitle className="text-sm font-medium flex items-center gap-2 dark:text-gray-200">
                  <Activity className="w-4 h-4 text-blue-500" />
                  Execution Flow
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-y-auto min-h-0">
                <ExecutionNodes
                  workflow={workflow}
                  nodeStatuses={nodeStatuses}
                  nodeDurations={nodeDurations}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Output & Details */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="border-b border-gray-200 dark:border-gray-800 px-4">
                <TabsList className="bg-transparent h-12 gap-2">
                  <TabsTrigger
                    value="terminal"
                    className="data-[state=active]:bg-gray-100 dark:data-[state=active]:bg-gray-800 data-[state=active]:text-purple-600 dark:data-[state=active]:text-purple-400 rounded-md px-4"
                  >
                    <Terminal className="w-4 h-4 mr-2" />
                    Terminal
                  </TabsTrigger>
                  <TabsTrigger
                    value="logs"
                    className="data-[state=active]:bg-gray-100 dark:data-[state=active]:bg-gray-800 data-[state=active]:text-purple-600 dark:data-[state=active]:text-purple-400 rounded-md px-4"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Logs
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    className="data-[state=active]:bg-gray-100 dark:data-[state=active]:bg-gray-800 data-[state=active]:text-purple-600 dark:data-[state=active]:text-purple-400 rounded-md px-4"
                  >
                    <History className="w-4 h-4 mr-2" />
                    History
                  </TabsTrigger>
                  <TabsTrigger
                    value="response"
                    className="data-[state=active]:bg-gray-100 dark:data-[state=active]:bg-gray-800 data-[state=active]:text-purple-600 dark:data-[state=active]:text-purple-400 rounded-md px-4"
                  >
                    <Activity className="w-4 h-4 mr-2" />
                    Response
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden bg-gray-50 dark:bg-black/20">
                <TabsContent
                  value="terminal"
                  className="h-full m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col"
                >
                  <ExecutionTerminal
                    logs={logs}
                    elapsedSeconds={elapsedSeconds}
                    runId={runId}
                  />
                </TabsContent>
                <TabsContent
                  value="logs"
                  className="h-full m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col"
                >
                  <ExecutionLogs />
                </TabsContent>
                <TabsContent
                  value="history"
                  className="h-full m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col"
                >
                  <ExecutionHistory />
                </TabsContent>
                <TabsContent
                  value="response"
                  className="h-full m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col"
                >
                  <ExecutionResponse />
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
};

export default WorkflowExecution;
