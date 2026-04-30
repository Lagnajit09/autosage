import { apiRequest } from "../api-client";

export interface HttpTriggerCreateResponse {
  node_id: string;
  trigger_url: string;
  secret: string;
  secret_last4: string;
  created_at: string;
  rotated_at: string | null;
  last_triggered_at?: string | null;
}

export interface HttpTriggerInfoResponse {
  node_id: string;
  trigger_url: string;
  secret_last4: string;
  created_at: string;
  rotated_at: string | null;
  last_triggered_at: string | null;
}

export const createHttpTrigger = async (
  workflowId: string,
  nodeId: string,
  token: string | null = null,
) => {
  return await apiRequest(
    `/api/workflows/${workflowId}/triggers/http/`,
    {
      method: "POST",
      body: JSON.stringify({ node_id: nodeId }),
    },
    token,
  );
};

export const getHttpTrigger = async (
  workflowId: string,
  nodeId: string,
  token: string | null = null,
) => {
  return await apiRequest(
    `/api/workflows/${workflowId}/triggers/http/${encodeURIComponent(nodeId)}/`,
    {},
    token,
  );
};

export const regenerateHttpTriggerSecret = async (
  workflowId: string,
  nodeId: string,
  token: string | null = null,
) => {
  return await apiRequest(
    `/api/workflows/${workflowId}/triggers/http/${encodeURIComponent(nodeId)}/regenerate/`,
    { method: "POST" },
    token,
  );
};

export const deleteHttpTrigger = async (
  workflowId: string,
  nodeId: string,
  token: string | null = null,
) => {
  return await apiRequest(
    `/api/workflows/${workflowId}/triggers/http/${encodeURIComponent(nodeId)}/`,
    { method: "DELETE" },
    token,
  );
};
