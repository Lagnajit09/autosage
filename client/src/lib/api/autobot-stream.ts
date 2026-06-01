/**
 * Autobot SSE chat streaming helper.
 *
 * The chat endpoint returns `text/event-stream`, so we can't use
 * `apiRequest`. Mirrors the fetch+ReadableStream pattern from
 * `WorkflowExecution.tsx::streamLogs`.
 *
 * Event vocabulary (see `autobot/streaming/sse.py`): `stream_start`,
 * `token`, `tool_call_start`, `tool_result`, `done`, `error`.
 * `stream_start` and one of `done`/`error` are guaranteed per stream.
 */

import { API_BASE_URL } from "../api-client";
import type { AutobotContentType, AutobotMessage } from "./autobot";

const AI_BASE = "/api/ai";

export interface StreamStartEvent {
  type: "stream_start";
  stream_id: string;
  thread_id: string;
}

export interface TokenEvent {
  type: "token";
  content: string;
}

export interface ToolCallStartEvent {
  type: "tool_call_start";
  id: string;
  name: string;
  /** Raw JSON string from the LLM — render verbatim by default. Partial
   * or malformed JSON can appear mid-emit. */
  arguments: string;
}

export interface ToolResultEvent {
  type: "tool_result";
  id: string;
  name: string;
  /** Either the tool's data dict OR `{ error: "..." }` on failure. */
  result: Record<string, unknown>;
}

export interface DoneEvent {
  type: "done";
  /** Persisted Django `Message` — authoritative over concatenated tokens. */
  message: AutobotMessage;
}

export interface ErrorEvent {
  type: "error";
  message: string;
  /** Stable error code for branch-by-cause UI (e.g. `llm_unconfigured`,
   * `admin_quota_exhausted`, `storage_unavailable`, `max_tool_rounds`,
   * `http_<status>`, `network_error`, etc.). */
  code: string | null;
}

export type AutobotStreamEvent =
  | StreamStartEvent
  | TokenEvent
  | ToolCallStartEvent
  | ToolResultEvent
  | DoneEvent
  | ErrorEvent;

export interface StreamMessageBody {
  content: string;
  content_type?: AutobotContentType;
  /** Idempotency key — reuse on retry to avoid double-persisting the user message. */
  client_id?: string;
  /** Biases the system prompt: "research" (read-only), "generation"
   * (write-capable), "execution" (refuses run requests). */
  mode?: "research" | "generation" | "execution";
  /** Inline-AI panel identifier. Drives a system-prompt addendum AND
   * a hard tool-schema filter — panels can't reach tools outside scope
   * even if the model tries. */
  panel?: "script_editor" | "workflow_builder";
}

export interface StreamMessageOptions {
  signal?: AbortSignal;
}

interface ParsedFrame {
  event: string;
  data: string;
}

/** Parse one SSE frame (between two blank lines); null for keep-alives. */
const parseFrame = (frame: string): ParsedFrame | null => {
  let event = "message";
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      if (data) data += "\n";
      data += line.slice("data:".length).trim();
    }
  }
  if (!data) return null;
  return { event, data };
};

/** Turn a parsed frame into a typed event; null for unrecognized event
 * names so server-side additions don't break clients. */
const buildEvent = (frame: ParsedFrame): AutobotStreamEvent | null => {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    // Surface upstream-proxy error pages instead of swallowing them.
    return {
      type: "error",
      message: `Malformed event payload: ${frame.data.slice(0, 120)}`,
      code: "parse_error",
    };
  }

  switch (frame.event) {
    case "stream_start":
      return {
        type: "stream_start",
        stream_id: String(payload.stream_id ?? ""),
        thread_id: String(payload.thread_id ?? ""),
      };
    case "token":
      return { type: "token", content: String(payload.content ?? "") };
    case "tool_call_start":
      return {
        type: "tool_call_start",
        id: String(payload.id ?? ""),
        name: String(payload.name ?? ""),
        arguments: String(payload.arguments ?? ""),
      };
    case "tool_result":
      return {
        type: "tool_result",
        id: String(payload.id ?? ""),
        name: String(payload.name ?? ""),
        result: (payload.result as Record<string, unknown>) ?? {},
      };
    case "done":
      return { type: "done", message: payload as unknown as AutobotMessage };
    case "error":
      return {
        type: "error",
        message: String(payload.message ?? "Unknown stream error."),
        code: payload.code == null ? null : String(payload.code),
      };
    default:
      return null;
  }
};

/**
 * Open an SSE chat stream and invoke `onEvent` once per frame in order.
 *
 * The returned promise resolves on stream termination (normal `done`,
 * `error` frame, server close, or abort). Initial HTTP failures
 * surface as an error frame too — callers get one unified failure path
 * without try/catch.
 *
 * Throttled at 30/min per user-sub server-side.
 */
export const streamMessage = async (
  token: string,
  threadId: string,
  body: StreamMessageBody,
  onEvent: (event: AutobotStreamEvent) => void,
  options: StreamMessageOptions = {},
): Promise<void> => {
  if (!token) {
    onEvent({
      type: "error",
      message: "No authentication token provided.",
      code: "no_auth",
    });
    return;
  }

  const isJWT = token.split(".").length === 3;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    Authorization: isJWT ? `Bearer ${token}` : token,
  };

  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}${AI_BASE}/threads/${threadId}/messages/stream/`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: options.signal,
      },
    );
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return;
    }
    onEvent({
      type: "error",
      message: e instanceof Error ? e.message : "Network error.",
      code: "network_error",
    });
    if (e instanceof Error && e.message === "Failed to fetch") {
      window.dispatchEvent(new CustomEvent("server-error"));
    }
    return;
  }

  if (!response.ok) {
    // Mirror apiRequest's global banner signaling.
    if (response.status >= 500) {
      window.dispatchEvent(new CustomEvent("server-error"));
    }
    if (response.status === 429) {
      window.dispatchEvent(new CustomEvent("limit-exceeded"));
    }
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      detail = errBody.detail || errBody.message || detail;
    } catch {
      // Body wasn't JSON — keep the generic detail.
    }
    onEvent({
      type: "error",
      message: detail,
      code: `http_${response.status}`,
    });
    return;
  }

  if (!response.body) {
    onEvent({
      type: "error",
      message: "Server response had no body.",
      code: "empty_body",
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // Some proxies inject \r\n.
      buffer = buffer.replace(/\r\n/g, "\n");

      // Frames are `\n\n`-delimited; the trailing partial stays buffered.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        if (!frame.trim()) continue;
        const parsed = parseFrame(frame);
        if (!parsed) continue;
        const event = buildEvent(parsed);
        if (event) onEvent(event);
      }
    }
    // Flush any trailing frame that didn't get a blank-line terminator.
    if (buffer.trim()) {
      const parsed = parseFrame(buffer);
      if (parsed) {
        const event = buildEvent(parsed);
        if (event) onEvent(event);
      }
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return;
    }
    onEvent({
      type: "error",
      message: e instanceof Error ? e.message : "Stream read failure.",
      code: "stream_read_error",
    });
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader already closed — ignore.
    }
  }
};


export interface TokenRefreshResult {
  stream_id: string;
  thread_id: string;
}

/**
 * Swap a fresh Clerk JWT into an in-flight stream's auth handle.
 *
 * 403 if the new token's `sub` differs from the stream owner.
 */
export const refreshStreamToken = async (
  newToken: string,
  threadId: string,
  streamId: string,
): Promise<TokenRefreshResult> => {
  const response = await fetch(
    `${API_BASE_URL}${AI_BASE}/threads/${threadId}/token-refresh/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: newToken.split(".").length === 3
          ? `Bearer ${newToken}`
          : newToken,
      },
      body: JSON.stringify({ stream_id: streamId }),
    },
  );
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      detail = errBody.detail || errBody.message || detail;
    } catch {
      // Non-JSON error body.
    }
    throw new Error(detail);
  }
  const envelope = await response.json();
  return envelope.data;
};
