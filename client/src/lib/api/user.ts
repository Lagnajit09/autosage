import { apiRequest } from "../api-client";

const USERS_BASE = "/api/users";
const DASHBOARD_BASE = "/api/dashboard";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UserProfile {
  display_name: string;
  bio: string;
  timezone: string;
  created_at: string;
  modified_at: string;
}

export interface UserProfileUpdateBody {
  display_name?: string;
  bio?: string;
  timezone?: string;
}

export interface UserNotificationSettings {
  email_notifications: boolean;
  push_notifications: boolean;
  marketing_emails: boolean;
  modified_at: string;
}

export interface UserNotificationSettingsUpdateBody {
  email_notifications?: boolean;
  push_notifications?: boolean;
  marketing_emails?: boolean;
}

export interface TopWorkflow {
  id: string;
  name: string;
  executions: number;
  successRate: number;
}

export interface DashboardStats {
  workflows: number;
  workflows_current_month: number;
  scripts: number;
  scripts_current_month: number;
  executions: number;
  executions_current_month: number;
  success_rate: number;
}

export interface RecentExecution {
  name: string;
  status: "success" | "failed" | "running";
  time: string;
  duration: string;
}

export interface DashboardData {
  stats: DashboardStats;
  recentWorkflows: Array<{
    id: string;
    title: string;
    type: string;
    date: string;
    status: string;
  }>;
  recentScripts: Array<{ title: string; type: string; date: string }>;
  recentExecutions: RecentExecution[];
  topWorkflows: TopWorkflow[];
}

// ── API functions ─────────────────────────────────────────────────────────────

export const getUserProfile = async (token: string): Promise<UserProfile> => {
  const response = await apiRequest(`${USERS_BASE}/profile/`, {}, token);
  return response.data;
};

export const updateUserProfile = async (
  data: UserProfileUpdateBody,
  token: string,
): Promise<UserProfile> => {
  const response = await apiRequest(
    `${USERS_BASE}/profile/`,
    { method: "PATCH", body: JSON.stringify(data) },
    token,
  );
  return response.data;
};

export const getDashboardStats = async (
  token: string,
): Promise<DashboardData> => {
  const response = await apiRequest(`${DASHBOARD_BASE}/`, {}, token);
  return response.data;
};

export const getNotificationSettings = async (
  token: string,
): Promise<UserNotificationSettings> => {
  const response = await apiRequest(`${USERS_BASE}/notifications/`, {}, token);
  return response.data;
};

export const patchNotificationSettings = async (
  data: UserNotificationSettingsUpdateBody,
  token: string,
): Promise<UserNotificationSettings> => {
  const response = await apiRequest(
    `${USERS_BASE}/notifications/`,
    { method: "PATCH", body: JSON.stringify(data) },
    token,
  );
  return response.data;
};

// ── Account lifecycle ───────────────────────────────────────────────────────

export interface AccountStatus {
  exists: boolean;
  is_active?: boolean;
}

/**
 * Report whether the signed-in Clerk user's Django account is active.
 * Works for deactivated accounts (the token is verified server-side directly),
 * so it can be called right after sign-in to route deactivated users away.
 */
export const getAccountStatus = async (
  token: string,
): Promise<AccountStatus> => {
  const response = await apiRequest(
    `${USERS_BASE}/account-status/`,
    {},
    token,
  );
  return response.data;
};

/** Email the admin requesting reactivation of a deactivated account. */
export const requestReactivation = async (
  message: string,
  token: string,
): Promise<{ success: boolean; message: string }> => {
  const response = await apiRequest(
    `${USERS_BASE}/request-reactivation/`,
    { method: "POST", body: JSON.stringify({ message }) },
    token,
  );
  return response;
};
