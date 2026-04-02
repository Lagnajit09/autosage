import { useState } from "react";
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
} from "lucide-react";
import ExecutionNodes from "@/components/Execution/ExecutionNodes";
import ExecutionTerminal from "@/components/Execution/ExecutionTerminal";
import ExecutionLogs from "@/components/Execution/ExecutionLogs";
import ExecutionHistory from "@/components/Execution/ExecutionHistory";
import ExecutionResponse from "@/components/Execution/ExecutionResponse";
import ExecutionParameters from "@/components/Execution/ExecutionParameters";
import { useEffect } from "react";
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

  const { getToken, isSignedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchWorkflow = async () => {
      if (!id || !isSignedIn) return;
      try {
        const token = await getToken();
        const response = await apiRequest(`/api/workflows/${id}/`, {}, token);
        setWorkflow(response?.data || response);
      } catch (error) {
        console.error("Failed to fetch workflow:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkflow();
  }, [id, isSignedIn, getToken]);

  const handleExecute = () => {
    setIsExecuting(true);
    // Simulate execution
    setTimeout(() => setIsExecuting(false), 3000);
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
              onClick={() => navigate("/workflow")}
              disabled={isExecuting}
              className="bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 shadow-md shadow-blue-500/20"
            >
              <Pencil className={`w-4 h-4`} />
              Edit
            </Button>
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
        <main className="flex-1 overflow-hidden p-4 flex gap-4">
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
                <ExecutionParameters workflow={workflow} />
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
              <CardContent className="flex-1 p-0 overflow-y-auto">
                <ExecutionNodes workflow={workflow} />
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Output & Details */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex-1 flex flex-col"
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

              <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-black/20">
                <TabsContent value="terminal" className="h-full m-0 p-0">
                  <ExecutionTerminal />
                </TabsContent>
                <TabsContent value="logs" className="h-full m-0 p-0">
                  <ExecutionLogs />
                </TabsContent>
                <TabsContent value="history" className="h-full m-0 p-0">
                  <ExecutionHistory />
                </TabsContent>
                <TabsContent value="response" className="h-full m-0 p-0">
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
