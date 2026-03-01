import { apiRequest } from "../api-client";
import { ScriptExecution } from "@/utils/types";

const BASE_URL = "/api/execution-engine";

export interface ExecutionHistoryResponse {
  executions: ScriptExecution[];
  total_count: number;
  total_pages: number;
  current_page: number;
}

export const executionsService = {
  // Get execution history
  getHistory: async (
    token: string,
    page: number = 1,
    pageSize: number = 50,
  ): Promise<ExecutionHistoryResponse> => {
    const response = await apiRequest(
      `${BASE_URL}/history/?page=${page}&page_size=${pageSize}`,
      {},
      token,
    );
    return response.data;
  },
};
