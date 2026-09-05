/**
 * Autobot API client.
 *
 *   • `/api/ai/*`     → FastAPI proxy (thread CRUD, message reads, settings)
 *   • `/api/autobot/*` → Django direct (LLM configs, summaries)
 *
 * Streaming chat lives in `autobot-stream.ts` (SSE reader doesn't fit
 * `apiRequest`'s JSON-returning shape).
 */

import { apiRequest } from "../api-client";

const AI_BASE = "/api/ai";
const DJANGO_BASE = "/api/autobot";

export type AutobotProvider =
  | "gemini"
  | "groq"
  | "openrouter"
  | "anthropic"
  | "openai"
  | "azure_openai"
  // LiteLLM's provider tag for build.nvidia.com — not "nvidia".
  | "nvidia_nim"
  | "custom";

export type AutobotRole = "user" | "assistant" | "system" | "tool";
export type AutobotContentType = "text/plain" | "text/markdown";
export type AutobotTone = "concise" | "balanced" | "detailed";
export type AutobotExpertise = "beginner" | "intermediate" | "expert";

/** Mirrors `autobot_api.models.LLMConfig`. `api_key` is write-only and
 * never returned by the standard serializer. */
export interface LLMConfig {
  id: string;
  name: string;
  provider: AutobotProvider;
  model_name: string;
  api_version: string;
  base_url: string;
  system_instruction: string;
  is_default: boolean;
  created_at: string;
  modified_at: string;
}

/** Returned ONLY by `POST /llm-configs/<id>/reveal/`. The decrypted
 * `api_key` must NOT be persisted or logged client-side. */
export interface LLMConfigRevealed {
  id: string;
  name: string;
  provider: AutobotProvider;
  api_key: string;
  model_name: string;
  api_version: string;
  base_url: string;
  system_instruction: string;
}

export interface LLMConfigCreateBody {
  name: string;
  provider: AutobotProvider;
  api_key: string;
  model_name: string;
  api_version?: string;
  base_url?: string;
  system_instruction?: string;
  is_default?: boolean;
}

/** Omit `api_key` to keep the existing encrypted value untouched. */
export type LLMConfigUpdateBody = Partial<LLMConfigCreateBody>;

/** Mirrors `autobot_api.models.Thread`. */
export interface AutobotThread {
  id: string;
  title: string;
  llm_config: string | null;
  system_prompt_override: string;
  is_archived: boolean;
  last_message_at: string | null;
  created_at: string;
  modified_at: string;
  message_count?: number;
  /** Count of role=user messages — drives the long-thread guardrails. */
  user_message_count?: number;
}

export interface ThreadCreateBody {
  title?: string;
  llm_config?: string | null;
  system_prompt_override?: string;
  /** Hide from the chat-history sidebar from creation — useful for
   * tool-internal threads (inline Script Generator panel, etc.). */
  is_archived?: boolean;
}

export interface ThreadUpdateBody {
  title?: string;
  llm_config?: string | null;
  system_prompt_override?: string;
  is_archived?: boolean;
}

/** LiteLLM-compatible tool-call shape. `function.arguments` is the raw
 * JSON string the LLM produced. */
export interface AutobotToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/** Mirrors `autobot_api.models.Message`. */
export interface AutobotMessage {
  id: string;
  role: AutobotRole;
  content: string;
  content_type: AutobotContentType;
  provider: string;
  model_name: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  tool_calls: AutobotToolCall[];
  tool_call_id: string;
  client_id: string;
  created_at: string;
}

export interface AutobotSummary {
  id: string;
  up_to_message: string;
  summary_text: string;
  summary_tokens: number | null;
  created_at: string;
}

/** Mirrors `autobot_api.models.UserSettings`. */
export interface UserSettings {
  default_llm_config: string | null;
  tone: AutobotTone;
  expertise: AutobotExpertise;
  language: string;
  custom_instructions: string;
  created_at: string;
  modified_at: string;
}

export type UserSettingsUpdateBody = Partial<
  Pick<
    UserSettings,
    | "default_llm_config"
    | "tone"
    | "expertise"
    | "language"
    | "custom_instructions"
  >
>;

export interface PaginatedThreads {
  threads: AutobotThread[];
  total_count: number;
  total_pages: number;
  current_page: number;
  page_size: number;
}

export interface PaginatedMessages {
  messages: AutobotMessage[];
  total_count: number;
  total_pages: number;
  current_page: number;
  page_size: number;
}

export interface PaginatedSummaries {
  summaries: AutobotSummary[];
  total_count: number;
  total_pages: number;
  current_page: number;
  page_size: number;
}

/** `is_archived` contract on `GET /threads/`:
 *   omitted → active only, "true" → archived only, "all" → both. */
export type ThreadArchiveFilter = "active" | "archived" | "all";

const buildThreadListQuery = (
  page: number,
  pageSize: number,
  filter: ThreadArchiveFilter,
): string => {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  if (filter === "archived") params.set("is_archived", "true");
  else if (filter === "all") params.set("is_archived", "all");
  return params.toString();
};

export const listThreads = async (
  token: string,
  page: number = 1,
  pageSize: number = 20,
  filter: ThreadArchiveFilter = "active",
): Promise<PaginatedThreads> => {
  const qs = buildThreadListQuery(page, pageSize, filter);
  const response = await apiRequest(`${AI_BASE}/threads/?${qs}`, {}, token);
  return response.data;
};

export const createThread = async (
  token: string,
  body: ThreadCreateBody = {},
): Promise<AutobotThread> => {
  const response = await apiRequest(
    `${AI_BASE}/threads/`,
    { method: "POST", body: JSON.stringify(body) },
    token,
  );
  return response.data;
};

export const getThread = async (
  token: string,
  id: string,
): Promise<AutobotThread> => {
  const response = await apiRequest(`${AI_BASE}/threads/${id}/`, {}, token);
  return response.data;
};

export const patchThread = async (
  token: string,
  id: string,
  body: ThreadUpdateBody,
): Promise<AutobotThread> => {
  const response = await apiRequest(
    `${AI_BASE}/threads/${id}/`,
    { method: "PATCH", body: JSON.stringify(body) },
    token,
  );
  return response.data;
};

export const deleteThread = async (
  token: string,
  id: string,
): Promise<void> => {
  await apiRequest(
    `${AI_BASE}/threads/${id}/`,
    { method: "DELETE" },
    token,
  );
};

// Messages: READ only here — writes happen via the stream.
// `ordering` defaults to oldest-first; pass "-created_at" for the
// latest-first paging the chat uses (reverse infinite scroll).
export const listMessages = async (
  token: string,
  threadId: string,
  page: number = 1,
  pageSize: number = 50,
  ordering: "created_at" | "-created_at" = "created_at",
): Promise<PaginatedMessages> => {
  const qs = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    ordering,
  }).toString();
  const response = await apiRequest(
    `${AI_BASE}/threads/${threadId}/messages/?${qs}`,
    {},
    token,
  );
  return response.data;
};

export const getSettings = async (token: string): Promise<UserSettings> => {
  // Auto-created on first GET by Django; always returns 200.
  const response = await apiRequest(`${AI_BASE}/settings/`, {}, token);
  return response.data;
};

export const patchSettings = async (
  token: string,
  body: UserSettingsUpdateBody,
): Promise<UserSettings> => {
  const response = await apiRequest(
    `${AI_BASE}/settings/`,
    { method: "PATCH", body: JSON.stringify(body) },
    token,
  );
  return response.data;
};

export const listLLMConfigs = async (
  token: string,
): Promise<LLMConfig[]> => {
  const response = await apiRequest(
    `${DJANGO_BASE}/llm-configs/`,
    {},
    token,
  );
  // Unpaginated DRF list — `data` is the raw array.
  return response.data;
};

export const createLLMConfig = async (
  token: string,
  body: LLMConfigCreateBody,
): Promise<LLMConfig> => {
  const response = await apiRequest(
    `${DJANGO_BASE}/llm-configs/`,
    { method: "POST", body: JSON.stringify(body) },
    token,
  );
  return response.data;
};

export const getLLMConfig = async (
  token: string,
  id: string,
): Promise<LLMConfig> => {
  const response = await apiRequest(
    `${DJANGO_BASE}/llm-configs/${id}/`,
    {},
    token,
  );
  return response.data;
};

export const patchLLMConfig = async (
  token: string,
  id: string,
  body: LLMConfigUpdateBody,
): Promise<LLMConfig> => {
  const response = await apiRequest(
    `${DJANGO_BASE}/llm-configs/${id}/`,
    { method: "PATCH", body: JSON.stringify(body) },
    token,
  );
  return response.data;
};

export const deleteLLMConfig = async (
  token: string,
  id: string,
): Promise<void> => {
  await apiRequest(
    `${DJANGO_BASE}/llm-configs/${id}/`,
    { method: "DELETE" },
    token,
  );
};

/** Returns the plaintext api_key — fetch on demand, never persist it.
 * Used by the Customize modal's "Show key" affordance. */
export const revealLLMConfig = async (
  token: string,
  id: string,
): Promise<LLMConfigRevealed> => {
  const response = await apiRequest(
    `${DJANGO_BASE}/llm-configs/${id}/reveal/`,
    { method: "POST" },
    token,
  );
  return response.data;
};

export const listSummaries = async (
  token: string,
  threadId: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedSummaries> => {
  const qs = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  }).toString();
  const response = await apiRequest(
    `${DJANGO_BASE}/threads/${threadId}/summaries/?${qs}`,
    {},
    token,
  );
  return response.data;
};

export interface SummaryCreateBody {
  up_to_message: string;
  summary_text: string;
  summary_tokens?: number;
}

export const createSummary = async (
  token: string,
  threadId: string,
  body: SummaryCreateBody,
): Promise<AutobotSummary> => {
  const response = await apiRequest(
    `${DJANGO_BASE}/threads/${threadId}/summaries/`,
    { method: "POST", body: JSON.stringify(body) },
    token,
  );
  return response.data;
};

/** Matches Django's `_bucket_stats` shape. */
export interface DashboardBucket {
  requests: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  avg_tokens_per_request: number;
  admin_tokens: number;
  byo_tokens: number;
  model_usage: Array<{
    provider: string;
    model: string;
    count: number;
  }>;
}

/** Admin-pool daily quota. `limit === 0` means the cap is disabled —
 *  the dashboard should hide the quota tile in that case. */
export interface AdminQuota {
  used: number;
  limit: number;
  remaining: number;
}

export interface AutobotDashboardData {
  today: DashboardBucket;
  last_7d: DashboardBucket;
  all_time: DashboardBucket;
  admin_quota: AdminQuota;
}

export const getDashboard = async (
  token: string,
): Promise<AutobotDashboardData> => {
  const response = await apiRequest(`${AI_BASE}/dashboard/`, {}, token);
  return response.data;
};
