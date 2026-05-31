/**
 * Autobot API client (T19).
 *
 * Covers every Autobot-related REST surface the frontend talks to:
 *
 *   1. **Autobot proxy routes** at `/api/ai/*` — nginx forwards these to
 *      the FastAPI service, which forwards the JWT to Django and relays
 *      the envelope back. Used for thread CRUD, message reads, settings.
 *   2. **Django direct routes** at `/api/autobot/*` — go straight to
 *      Django. Used for LLM config CRUD (no chat semantics, so no need
 *      to detour through autobot) and summary reads.
 *
 * Streaming chat lives in `autobot-stream.ts` because the SSE reader
 * doesn't fit the JSON-returning shape of `apiRequest`.
 *
 * Every response Django (and the autobot proxy) sends uses the standard
 * `api_response()` envelope `{success, message, data, errors}`. The
 * `apiRequest` helper returns the parsed envelope as-is — callers here
 * unwrap `.data` and return the typed payload.
 */

import { apiRequest } from "../api-client";

// ── Path constants ───────────────────────────────────────────────────────
// Autobot is mounted at `/api/ai/` in nginx (dev + prod). Same origin as
// Django (`/api/*`), so we don't need a separate base URL — `apiRequest`
// already targets `API_BASE_URL` and these paths join cleanly on top.
const AI_BASE = "/api/ai";
const DJANGO_BASE = "/api/autobot";

// ── Shared shapes ────────────────────────────────────────────────────────

export type AutobotProvider =
  | "gemini"
  | "groq"
  | "openrouter"
  | "anthropic"
  | "openai"
  | "azure_openai"
  | "custom";

export type AutobotRole = "user" | "assistant" | "system" | "tool";
export type AutobotContentType = "text/plain" | "text/markdown";
export type AutobotTone = "concise" | "balanced" | "detailed";
export type AutobotExpertise = "beginner" | "intermediate" | "expert";

/** Mirrors `autobot_api.models.LLMConfig` (without `api_key` — that field
 * is write-only and never returned by the standard serializer). */
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

/** Returned ONLY by `POST /llm-configs/<id>/reveal/`. Carries the
 * decrypted `api_key` — never store this client-side, never log it. */
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

/** PATCH is partial — `api_key` is optional; omit it to keep the existing
 * encrypted value untouched. */
export type LLMConfigUpdateBody = Partial<LLMConfigCreateBody>;

/** Mirrors `autobot_api.models.Thread` (read shape; `message_count` is
 * annotated server-side and won't be present until after the round-trip). */
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
}

export interface ThreadCreateBody {
  title?: string;
  llm_config?: string | null;
  system_prompt_override?: string;
  /** Set true to keep the thread out of the user's chat-history
   * sidebar from the moment of creation. Useful for tool-internal
   * threads (e.g. the inline Script Generator panel) where the chat is
   * a means to an end and shouldn't pollute the main history. */
  is_archived?: boolean;
}

export interface ThreadUpdateBody {
  title?: string;
  llm_config?: string | null;
  system_prompt_override?: string;
  is_archived?: boolean;
}

/** LiteLLM-compatible tool-call shape persisted on assistant Messages
 * that emitted tools on this turn. `function.arguments` is the raw JSON
 * string the LLM produced. */
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

/** Paginated envelopes returned by Django list views. The autobot proxy
 * forwards these verbatim, so the client sees the same shape regardless
 * of which path it came through. */
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

// ── Helpers ──────────────────────────────────────────────────────────────

/** `is_archived` value contract on `GET /threads/`:
 *   - omitted              → only active threads
 *   - "true"               → only archived
 *   - "all"                → both
 * Modelled as a TS union so callers can't pass arbitrary strings. */
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
  // "active" → omit the param entirely (server default).
  return params.toString();
};

// ── Threads (autobot proxy) ──────────────────────────────────────────────

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

// ── Messages (autobot proxy — READ; writes happen via the stream) ────────

export const listMessages = async (
  token: string,
  threadId: string,
  page: number = 1,
  pageSize: number = 50,
): Promise<PaginatedMessages> => {
  const qs = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  }).toString();
  const response = await apiRequest(
    `${AI_BASE}/threads/${threadId}/messages/?${qs}`,
    {},
    token,
  );
  return response.data;
};

// ── Settings (autobot proxy) ─────────────────────────────────────────────

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

// ── LLM Configs (Django direct — no chat semantics, no proxy detour) ─────

export const listLLMConfigs = async (
  token: string,
): Promise<LLMConfig[]> => {
  const response = await apiRequest(
    `${DJANGO_BASE}/llm-configs/`,
    {},
    token,
  );
  // DRF default list returns `data` as the array directly (no pagination
  // class on this view).
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

/** Decrypts the api_key for an LLMConfig. Returns the plaintext key inline
 * with the rest of the config. The frontend rarely needs this (autobot
 * calls it server-side at chat time), but it's exposed for the Customize
 * modal's "Show key" affordance. NEVER store the returned `api_key` in
 * persistent state — fetch on demand and discard. */
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

// ── Summaries (Django direct — used by debug UI / future BYO RAG) ────────

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
