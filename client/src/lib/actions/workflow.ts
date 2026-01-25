import { apiRequest } from "../api-client";
import { WorkflowData } from "@/utils/types";

export const getAllWorkflows = async (token: string | null = null) => {
  return await apiRequest("/api/workflows/", {}, token);
};

export const getWorkflowByID = async (
  id: string,
  token: string | null = null,
) => {
  return await apiRequest(`/api/workflows/${id}/`, {}, token);
};

export const createWorkflow = async (
  data: Partial<WorkflowData>,
  token: string | null = null,
) => {
  return await apiRequest(
    "/api/workflows/",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    token,
  );
};

export const updateWorkflow = async (
  id: string,
  data: Partial<WorkflowData>,
  token: string | null = null,
) => {
  return await apiRequest(
    `/api/workflows/${id}/`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
    token,
  );
};

export const deleteWorkflow = async (
  id: string,
  token: string | null = null,
) => {
  return await apiRequest(
    `/api/workflows/${id}/`,
    {
      method: "DELETE",
    },
    token,
  );
};
