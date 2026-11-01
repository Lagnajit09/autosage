import { apiRequest } from "../api-client";

// SageCode (the `sagex` CLI): approving its sign-ins and managing its sessions.
// See server/users/views_cli.py. All of these need a Clerk session; the server
// refuses them for API keys.
const CLI_BASE = "/api/users/cli";

// ── Types ──────────────────────────────────────────────────────────────────────

/** device = `sagex auth login`, token = created here for CI, admin = issued key. */
export type CliSessionKind = "device" | "token" | "admin";

export interface CliSession {
  id: string;
  kind: CliSessionKind;
  name: string;
  last4: string;
  client_os: string;
  cli_version: string;
  last_ip: string | null;
  created_at: string;
  last_used_at: string | null;
  /** When it stops working if it isn't used before then. */
  expires_at: string;
  commands_run: number;
  runs_started: number;
  last_command: string;
}

export interface CliSessionList {
  sessions: CliSession[];
  idle_expiry_days: number;
}

/** A `sagex auth login` waiting for approval. */
export interface CliLoginRequest {
  user_code: string;
  device_name: string;
  client_os: string;
  cli_version: string;
  request_ip: string | null;
  created_at: string;
  expires_at: string;
}

export interface CreatedCliToken {
  /** The plaintext token. Returned once, never again. */
  api_key: string;
  session: CliSession;
}

// ── Sessions ───────────────────────────────────────────────────────────────────

export const listCliSessions = async (token: string): Promise<CliSessionList> => {
  const response = await apiRequest(`${CLI_BASE}/sessions/`, {}, token);
  return response.data;
};

export const revokeCliSession = async (token: string, sessionId: string): Promise<void> => {
  await apiRequest(`${CLI_BASE}/sessions/${sessionId}/`, { method: "DELETE" }, token);
};

export const createCliToken = async (token: string, name: string): Promise<CreatedCliToken> => {
  const response = await apiRequest(
    `${CLI_BASE}/tokens/`,
    { method: "POST", body: JSON.stringify({ name }) },
    token,
  );
  return response.data;
};

// ── Sign-in approval ───────────────────────────────────────────────────────────

const requestPath = (userCode: string) =>
  `${CLI_BASE}/auth/requests/${encodeURIComponent(userCode)}/`;

export const getCliLoginRequest = async (
  token: string,
  userCode: string,
): Promise<CliLoginRequest> => {
  const response = await apiRequest(requestPath(userCode), {}, token);
  return response.data;
};

export const approveCliLogin = async (token: string, userCode: string): Promise<void> => {
  await apiRequest(`${requestPath(userCode)}approve/`, { method: "POST" }, token);
};

export const denyCliLogin = async (token: string, userCode: string): Promise<void> => {
  await apiRequest(`${requestPath(userCode)}deny/`, { method: "POST" }, token);
};
