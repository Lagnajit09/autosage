import { apiRequest } from "../api-client";
import { ScriptExecution, WorkflowRun, WorkflowNodeRun } from "@/utils/types";

const BASE_URL = "/api/execution-engine";

import { ExecutionRecord } from "@/components/ExecutionLogs/ExecutionLogsTable";

// `/history/` returns full ScriptExecution rows (script_id, script_name,
// exit_code, signed URLs, …) — the shape from ScriptExecutionHistorySerializer.
export interface ScriptExecutionHistoryResponse {
  executions: ScriptExecution[];
  total_count: number;
  total_pages: number;
  current_page: number;
}

// `/executions/all/` returns the UNIFIED scripts-plus-workflows display
// shape (id, name, tag, duration, signed URLs) — see `all_executions` view.
export interface AllExecutionsResponse {
  executions: ExecutionRecord[];
  total_count: number;
  total_pages: number;
  current_page: number;
}

export const executionsService = {
  // Get script execution history
  getHistory: async (
    token: string,
    page: number = 1,
    pageSize: number = 50,
  ): Promise<ScriptExecutionHistoryResponse> => {
    const response = await apiRequest(
      `${BASE_URL}/history/?page=${page}&page_size=${pageSize}`,
      {},
      token,
    );
    return response.data;
  },

  // Stop a running execution
  stopExecution: async (
    executionId: string,
    token: string,
  ): Promise<Record<string, unknown>> => {
    const response = await apiRequest(
      `${BASE_URL}/${executionId}/stop/`,
      { method: "POST" },
      token,
    );
    return response.data;
  },

  // --- Workflow Executions ---

  getWorkflowHistory: async (
    token: string,
    workflowId?: string,
  ): Promise<WorkflowRun[]> => {
    let url = `${BASE_URL}/workflows/runs/`;
    if (workflowId) {
      url += `?workflow_id=${workflowId}`;
    }
    const response = await apiRequest(url, {}, token);
    return response.data;
  },

  getWorkflowRun: async (
    token: string,
    runId: string,
  ): Promise<WorkflowRun> => {
    const response = await apiRequest(
      `${BASE_URL}/workflows/runs/${runId}/`,
      {},
      token,
    );
    return response.data;
  },

  getWorkflowNodeRuns: async (
    token: string,
    runId: string,
  ): Promise<WorkflowNodeRun[]> => {
    const response = await apiRequest(
      `${BASE_URL}/workflows/runs/${runId}/nodes/`,
      {},
      token,
    );
    return response.data;
  },

  getAllExecutions: async (token: string, page: number = 1, pageSize: number = 20): Promise<AllExecutionsResponse> => {
    const response = await apiRequest(
      `${BASE_URL}/executions/all/?page=${page}&page_size=${pageSize}`,
      {},
      token,
    );
    return response.data;
  },
};
