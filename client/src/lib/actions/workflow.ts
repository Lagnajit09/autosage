import { apiRequest } from "../api-client";
import { WorkflowData } from "@/utils/types";

export const getAllWorkflows = async (token: string | null = null) => {
  return await apiRequest("/api/workflows/list/", {}, token);
};

export const getWorkflowByID = async (
  id: string,
  token: string | null = null
) => {
  return await apiRequest(`/api/workflows/${id}/`, {}, token);
};

export const createWorkflow = async (
  data: Partial<WorkflowData>,
  token: string | null = null
) => {
  return await apiRequest(
    "/api/workflows/create/",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    token
  );
};

export const updateWorkflow = async (
  id: string,
  data: Partial<WorkflowData>,
  token: string | null = null
) => {
  return await apiRequest(
    `/api/workflows/${id}/update/`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
    token
  );
};

export const deleteWorkflow = async (
  id: string,
  token: string | null = null
) => {
  return await apiRequest(
    `/api/workflows/${id}/delete/`,
    {
      method: "DELETE",
    },
    token
  );
};
