/**
 * Run-intent fulfillment — the secure password side-channel's browser half.
 *
 * `fulfillRunIntent` POSTs the user's confirmed params (secrets included)
 * straight to Django via a DEDICATED raw `fetch` — deliberately NOT the shared
 * `apiRequest`, whose `sanitizeInput` would rewrite/escape a password body. The
 * secret travels browser→Django over TLS on the manual trigger path; Autobot
 * never sees, asks for, or transports it. The intent is single-use and expires
 * after 5 minutes, so 409/410 are expected, handled cases (the run request went
 * stale — the user re-asks Autobot to run it).
 *
 * Single-use is enforced server-side by an atomic consume (Redis GETDEL), so we
 * send NO `Idempotency-Key` header — it's redundant, and it isn't in Django's
 * CORS allow-list (a custom request header would fail the preflight). The submit
 * button is also disabled while in-flight, so a double-click can't double-post.
 */

import { API_BASE_URL } from "@/lib/api-client";

export interface FulfillResult {
  ok: boolean;
  /** HTTP status (0 on a network error). */
  status: number;
  workflowRunId?: string;
  runStatus?: string;
  /** Human message for the inline error/expired states. */
  message?: string;
}

const authHeader = (token: string | null): Record<string, string> => {
  if (!token) return {};
  // Clerk JWTs are 3-segment; anything else is forwarded verbatim.
  const isJWT = token.split(".").length === 3;
  return { Authorization: isJWT ? `Bearer ${token}` : token };
};

export const fulfillRunIntent = async (
  runIntentId: string,
  params: Record<string, unknown>,
  token: string | null,
): Promise<FulfillResult> => {
  let res: Response;
  try {
    res = await fetch(
      `${API_BASE_URL}/api/execution-engine/workflows/runs/intents/${runIntentId}/fulfill/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(token),
        },
        body: JSON.stringify({ params }),
      },
    );
  } catch {
    return {
      ok: false,
      status: 0,
      message: "Network error — please check your connection and try again.",
    };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty / non-JSON body — fall through to status handling */
  }
  const envelope = (body ?? {}) as { message?: string; data?: Record<string, unknown> };
  const data = (envelope.data ?? envelope) as Record<string, unknown>;

  if (res.ok || res.status === 202) {
    const runId = data?.workflow_run_id;
    return {
      ok: true,
      status: res.status,
      workflowRunId: typeof runId === "string" ? runId : undefined,
      runStatus: typeof data?.status === "string" ? (data.status as string) : undefined,
    };
  }

  const message =
    res.status === 410 || res.status === 409
      ? "This run request expired or was already used — ask me to run it again."
      : envelope.message ||
        "Couldn't start the run. Please try again, or ask me to run it again.";
  return { ok: false, status: res.status, message };
};
