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

export interface ScheduleTriggerInfoResponse {
  node_id: string;
  cron_expression: string;
  timezone: string;
  is_active: boolean;
  created_at: string;
  last_triggered_at: string | null;
  last_run_id: string | null;
  last_error: string;
}

export const upsertScheduleTrigger = async (
  workflowId: string,
  nodeId: string,
  cronExpression: string,
  token: string | null = null,
) => {
  return await apiRequest(
    `/api/workflows/${workflowId}/triggers/schedule/`,
    {
      method: "POST",
      body: JSON.stringify({ node_id: nodeId, cron_expression: cronExpression }),
    },
    token,
  );
};

export const getScheduleTrigger = async (
  workflowId: string,
  nodeId: string,
  token: string | null = null,
) => {
  return await apiRequest(
    `/api/workflows/${workflowId}/triggers/schedule/${encodeURIComponent(nodeId)}/`,
    {},
    token,
  );
};

export const deleteScheduleTrigger = async (
  workflowId: string,
  nodeId: string,
  token: string | null = null,
) => {
  return await apiRequest(
    `/api/workflows/${workflowId}/triggers/schedule/${encodeURIComponent(nodeId)}/`,
    { method: "DELETE" },
    token,
  );
};
export const listAllTriggers = async (token: string | null = null) => {
  return await apiRequest(`/api/triggers/`, {}, token);
};

export const updateHttpTriggerStatus = async (
  triggerId: string,
  isActive: boolean,
  token: string | null = null,
) => {
  return await apiRequest(
    `/api/triggers/http/${encodeURIComponent(triggerId)}/`,
    {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
    },
    token,
  );
};

export const deleteGlobalHttpTrigger = async (
  triggerId: string,
  token: string | null = null,
) => {
  return await apiRequest(
    `/api/triggers/http/${encodeURIComponent(triggerId)}/`,
    { method: "DELETE" },
    token,
  );
};

export const updateScheduleTriggerStatus = async (
  triggerId: string,
  isActive: boolean,
  token: string | null = null,
) => {
  return await apiRequest(
    `/api/triggers/schedule/${encodeURIComponent(triggerId)}/`,
    {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
    },
    token,
  );
};

export const deleteGlobalScheduleTrigger = async (
  triggerId: string,
  token: string | null = null,
) => {
  return await apiRequest(
    `/api/triggers/schedule/${encodeURIComponent(triggerId)}/`,
    { method: "DELETE" },
    token,
  );
};
