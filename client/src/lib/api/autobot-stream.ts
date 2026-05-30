/**
 * Autobot SSE chat streaming helper (T19).
 *
 * The chat endpoint at `POST /api/ai/threads/<id>/messages/stream/` returns
 * `text/event-stream`, not JSON, so the standard `apiRequest` helper —
 * which calls `response.json()` unconditionally — can't be used. This file
 * mirrors the fetch+ReadableStream+manual-frame-parse pattern from
 * `pages/WorkflowExecution.tsx::streamLogs`.
 *
 * Event vocabulary (from `autobot/streaming/sse.py`):
 *
 *   • `stream_start`    — always the first frame. Carries `stream_id` the
 *                         client must echo back to `/token-refresh/` if
 *                         the Clerk JWT expires mid-stream (T18).
 *   • `token`           — incremental text delta. Many per turn.
 *   • `tool_call_start` — the LLM has decided to invoke a tool. Inline UI
 *                         shows a "Working: <tool_name>" badge.
 *   • `tool_result`     — the tool finished. Payload is either the tool's
 *                         data dict OR `{"error": "..."}` on failure.
 *   • `done`            — final assistant message persisted by Django.
 *                         Payload is the persisted `Message` (id, content,
 *                         tokens, etc.) — treat this as authoritative; its
 *                         `content` may differ from the concatenated
 *                         tokens if the provider trimmed whitespace.
 *   • `error`           — mid-stream failure. HTTP status is already 200
 *                         by the time we know, so failures surface here
 *                         instead of as a normal HTTP error.
 *
 * Both `stream_start` and `done` are guaranteed exactly once per stream.
 * `token` / `tool_call_start` / `tool_result` are zero-or-more. `error`
 * is the only terminal frame that can appear in lieu of `done`.
 */

import { API_BASE_URL } from "../api-client";
import type { AutobotContentType, AutobotMessage } from "./autobot";

// Same path constant as `autobot.ts`. Kept local rather than imported so
// the two files stay independently usable.
const AI_BASE = "/api/ai";

// ── Event payload shapes ─────────────────────────────────────────────────

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
  /** Raw JSON string the LLM produced. Call `JSON.parse(arguments)` to
   * inspect, but render verbatim by default — partial / malformed JSON
   * can appear if the LLM was mid-emit when the chunk fired. */
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
  /** The persisted Django `Message` dict — same shape as `AutobotMessage`
   * from `autobot.ts`. Treat as authoritative over the concatenated
   * `token` deltas. */
  message: AutobotMessage;
}

export interface ErrorEvent {
  type: "error";
  message: string;
  /** Stable error code for branch-by-cause UI. Notable values emitted
   * by the backend today:
   *   - `llm_unconfigured`         — no admin keys set and no BYO config
   *   - `llm_unavailable`          — provider returned a 5xx / timeout
   *   - `all_llm_unavailable`      — every fallback in the chain failed
   *   - `admin_quota_exhausted`    — per-user daily admin cap hit
   *   - `storage_unavailable`      — Django unreachable
   *   - `max_tool_rounds`          — model never converged on a reply
   *   - `thread_status_<N>`        — upstream thread fetch failed (N=status)
   *   - `history_status_<N>`       — upstream history fetch failed
   *   - `assistant_persist_status_<N>` / `tool_persist_status_<N>`
   */
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
  /** Client-supplied idempotency key. Reuse the same value on retry so
   * a dropped stream doesn't double-persist the user message. */
  client_id?: string;
}

export interface StreamMessageOptions {
  /** AbortSignal to cancel the stream — used by the UI to stop generation
   * when the user clicks Stop or unmounts the chat view. */
  signal?: AbortSignal;
}

// ── Frame parser ─────────────────────────────────────────────────────────

interface ParsedFrame {
  event: string;
  data: string;
}

/** Parse a single SSE frame (everything between two blank lines). Returns
 * null for keep-alive / comment frames that carry no `data:` lines. */
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
    // Lines starting with `:` are SSE comments / keep-alives — ignored.
  }
  if (!data) return null;
  return { event, data };
};

/** Turn a parsed frame into a typed event. Returns null when the event
 * name is unrecognized (forward-compatibility — new event types added
 * server-side won't break existing clients). */
const buildEvent = (frame: ParsedFrame): AutobotStreamEvent | null => {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    // Treat malformed JSON as an opaque error frame so the UI surfaces
    // it instead of swallowing silently. Useful when an upstream proxy
    // injects an error page mid-stream.
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

// ── streamMessage ────────────────────────────────────────────────────────

/**
 * Open an SSE chat stream against
 *   `POST /api/ai/threads/<threadId>/messages/stream/`
 * and invoke `onEvent` once per parsed event frame, in arrival order.
 *
 * The returned promise resolves when the stream terminates (normal `done`,
 * `error` frame, server closes the connection, or the caller aborts via
 * `options.signal`). It rejects only on initial HTTP failure (non-2xx
 * status before the body opens) — once the SSE body has started flowing,
 * runtime failures surface as `error` events and the promise still
 * resolves cleanly. This matches the contract the UI wants: a single
 * "stream finished" signal that doesn't require try/catch.
 *
 * Note on rate limiting: this endpoint is throttled at 30/min per user-sub
 * (T18). On 429 the initial fetch rejects with the standard `Too Many
 * Requests` message — handle by surfacing a "Slow down" toast.
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
    // Network-level failure (DNS, TLS, dropped before headers). Surface
    // as an error event so the caller has one unified failure path.
    if (e instanceof DOMException && e.name === "AbortError") {
      // Caller-initiated cancel — don't synthesize an error frame.
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
    // Surface global handlers so dashboard banners light up the same way
    // they do for normal JSON requests via `apiRequest`.
    if (response.status >= 500) {
      window.dispatchEvent(new CustomEvent("server-error"));
    }
    if (response.status === 429) {
      window.dispatchEvent(new CustomEvent("limit-exceeded"));
    }
    // Body may carry a JSON envelope from autobot's pre-stream phase
    // (e.g. 401 missing JWT, 404 unknown thread, 422 validation, 429
    // rate-limited). Try to surface that message.
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
      // Normalize CRLF (some proxies on Windows-shaped paths inject \r\n).
      buffer = buffer.replace(/\r\n/g, "\n");

      // Frames are delimited by a blank line (`\n\n`). The trailing
      // partial frame stays in the buffer for the next read.
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
      // Caller cancelled — clean exit.
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
      // releaseLock throws if the reader is already closed — ignore.
    }
  }
};

// ── Token refresh ────────────────────────────────────────────────────────

export interface TokenRefreshResult {
  stream_id: string;
  thread_id: string;
}

/**
 * Swap a freshly-minted Clerk JWT into an in-flight chat stream's auth
 * handle (T18). Use when the original JWT used to open the stream is
 * about to expire and a long tool loop is still running.
 *
 * The Authorization header MUST carry the NEW token — autobot verifies
 * it against Clerk's JWKS exactly like any other authenticated request.
 * Errors:
 *   • 400 — `streamId` missing.
 *   • 401 — new token invalid / expired.
 *   • 403 — new token belongs to a different `sub` than the stream owner
 *           (anti-hijack guard).
 *   • 404 — no active stream with that id (already finished).
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
      // Non-JSON error body — fall through with the generic detail.
    }
    throw new Error(detail);
  }
  const envelope = await response.json();
  return envelope.data;
};
