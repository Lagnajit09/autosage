/**
 * SecretForm — the composer-anchored confirmation form for a workflow run that
 * needs run-time parameters.
 *
 * It renders directly above the chat composer (the single typing surface) when
 * `run_workflow` returns `status:"awaiting_secret"`. It shows EVERY configured
 * param — secrets as masked inputs, node-references read-only, the rest
 * editable — and on submit POSTs the confirmed values browser→Django via
 * `fulfillRunIntent` (a raw fetch, NOT `apiRequest`). The secret never passes
 * through Autobot. On success the live run drawer opens and watches the new run.
 *
 * Single-use + 5-min expiry live server-side; a 409/410 surfaces here as a
 * clear "expired — ask me to run it again" inline message.
 */

import { useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Loader2, ShieldCheck, X } from "lucide-react";

import { useRunPanel } from "./RunPanelProvider";
import { OutputRefChip, ParamInput, SecretField } from "./RunFields";
import { fulfillRunIntent } from "./intents";
import type { PendingSecret } from "./runTypes";

interface SecretFormProps {
  pending: PendingSecret;
  /** Clear the form (cancel, or after a successful submit). */
  onClose: () => void;
}

const isBlank = (v: string | undefined): boolean => !v || !v.trim();

export const SecretForm = ({ pending, onClose }: SecretFormProps) => {
  const { getToken } = useAuth();
  const { openRun } = useRunPanel();

  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const setValue = (id: string, v: string) =>
    setValues((prev) => ({ ...prev, [id]: v }));

  // Required = a secret with no stored default. Everything else can fall back
  // to the configured default / model-proposed value on the server.
  const missingRequired = useMemo(
    () =>
      pending.params.filter(
        (p) =>
          p.source === "manual" &&
          !p.has_default &&
          isBlank(values[p.param_id]),
      ),
    [pending.params, values],
  );

  const canSubmit = !submitting && !expired && missingRequired.length === 0;

  const buildPayload = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const p of pending.params) {
      // Node references resolve from previous output at run time — never send.
      if (p.source === "output") continue;
      const v = values[p.param_id];
      if (v == null) continue;
      if ((p.type || "").toLowerCase() === "boolean") {
        out[p.param_id] = v === "true";
        continue;
      }
      if (v.trim() === "") continue; // blank → server uses default
      out[p.param_id] = v;
    }
    return out;
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fulfillRunIntent(
        pending.runIntentId,
        buildPayload(),
        token,
      );
      if (res.ok && res.workflowRunId) {
        openRun(res.workflowRunId, "workflow");
        onClose();
        return;
      }
      setError(res.message ?? "Couldn't start the run. Please try again.");
      if (res.status === 409 || res.status === 410) setExpired(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const hasParams = pending.params.length > 0;

  return (
    <div className="mx-2 overflow-hidden rounded-2xl border border-gray-300 bg-white shadow-md dark:border-gray-700 dark:bg-[#272727]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2.5 dark:border-gray-700/70">
        <ShieldCheck className="h-4 w-4 shrink-0 text-purple-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            Confirm &amp; run · {pending.workflowName}
          </p>
          <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
            Values are sent securely to the server — never through chat.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Params */}
      <div className="max-h-[40vh] space-y-2 overflow-y-auto px-4 py-3 thin-scrollbar">
        {!hasParams && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            No parameters to confirm — press “Run securely” to start.
          </p>
        )}
        {pending.params.map((p) => {
          if (p.is_secret)
            return (
              <SecretField
                key={p.param_id}
                name={p.name}
                param={p}
                disabled={false}
                value={values[p.param_id] ?? ""}
                onChange={(v) => setValue(p.param_id, v)}
                hint={
                  p.has_default
                    ? "Leave blank to use the stored value"
                    : "Required"
                }
              />
            );
          if (p.source === "output")
            return <OutputRefChip key={p.param_id} param={p} />;
          return (
            <ParamInput
              key={p.param_id}
              param={p}
              value={values[p.param_id] ?? ""}
              onChange={(v) => setValue(p.param_id, v)}
            />
          );
        })}
      </div>

      {/* Footer */}
      <div className="space-y-2 border-t border-gray-200 px-4 py-2.5 dark:border-gray-700/70">
        {error && (
          <p className="text-[11px] leading-snug text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] text-gray-400 dark:text-gray-500">
            {missingRequired.length > 0
              ? `${missingRequired.length} required value${missingRequired.length === 1 ? "" : "s"} left`
              : "This request expires in a few minutes."}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              {submitting ? "Starting…" : "Run securely"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecretForm;

/**
 * Composer-anchored mount for the confirmation form. Drop this once above the
 * chat input — it reads `pendingSecret` / `clearSecret` from `RunPanelProvider`,
 * so the composer stays the single typing surface and `Interface` holds no
 * secret-form state of its own.
 */
export const ComposerSecretForm = () => {
  const { pendingSecret, clearSecret } = useRunPanel();
  if (!pendingSecret) return null;
  return <SecretForm pending={pendingSecret} onClose={clearSecret} />;
};
