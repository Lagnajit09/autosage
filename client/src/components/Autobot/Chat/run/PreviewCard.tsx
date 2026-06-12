/**
 * PreviewCard — renders a `preview_workflow_run` result (AD-B3, the mandatory
 * side-effect-free confirmation step). Shows what WOULD run (targets, masked
 * inputs) and gates on `ready`:
 *   • ready    → a "Run it now" affordance that PREFILLS the composer (the
 *     user still presses send — confirmation must be its own turn, AD-B3).
 *   • !ready   → blocking reasons (e.g. AD-B9 Layer-4a: a run-time password →
 *     run from the builder) with a deep-link, plus the locked secret-box
 *     affordance (becomes a live secure field in X17).
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  ClipboardCheck,
  ListTree,
  Play,
  ShieldAlert,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { useRunPanel } from "./RunPanelProvider";
import { ParamGrid, SecretField } from "./RunFields";

interface PreviewTarget {
  node_label?: string;
  script_type?: string | null;
  script_id?: string | null;
  has_vault_binding?: boolean;
}

interface PreviewResult {
  name?: string | null;
  node_count?: number;
  targets?: PreviewTarget[];
  inputs_preview?: Record<string, unknown>;
  ready?: boolean;
  blocking?: string[];
  /** X17 forward-compat: structured run-time secrets the workflow needs. */
  needs_secret?: Array<{ param_id?: string; name?: string }>;
  /** X17 — every configured param; running opens a secure confirmation form. */
  needs_params?: Array<{ is_secret?: boolean }>;
}

/** Pull param ids out of a Layer-4a blocking message: "(parameter id(s): a, b)". */
const parseSecretIds = (blocking: string[]): string[] => {
  const ids: string[] = [];
  for (const b of blocking) {
    const m = b.match(/parameter id\(s\):\s*([^)]+)\)/i);
    if (m) ids.push(...m[1].split(",").map((s) => s.trim()).filter(Boolean));
  }
  return ids;
};

export const PreviewCard = ({
  result,
  argsJson,
}: {
  result: Record<string, unknown>;
  argsJson: string;
}) => {
  const r = result as PreviewResult;
  const { seedPrompt } = useRunPanel();
  const navigate = useNavigate();

  const blocking = Array.isArray(r.blocking) ? r.blocking : [];
  const ready = r.ready !== false && blocking.length === 0;
  const targets = Array.isArray(r.targets) ? r.targets : [];
  const name = r.name || "this workflow";

  const workflowId = useMemo(() => {
    try {
      const a = JSON.parse(argsJson);
      return typeof a?.workflow_id === "string" ? a.workflow_id : null;
    } catch {
      return null;
    }
  }, [argsJson]);

  const secretNames = useMemo(() => {
    if (Array.isArray(r.needs_secret) && r.needs_secret.length)
      return r.needs_secret.map((s) => s.name || s.param_id || "secret");
    return parseSecretIds(Array.isArray(r.blocking) ? r.blocking : []);
  }, [r.needs_secret, r.blocking]);

  const needsParams = Array.isArray(r.needs_params) ? r.needs_params : [];
  const paramCount = needsParams.length;
  const secretCount = needsParams.filter((p) => p.is_secret).length;

  return (
    <div className="my-1 w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3.5 py-2.5 dark:border-gray-800">
        <div className="flex min-w-0 items-center gap-2">
          <ClipboardCheck className="h-4 w-4 shrink-0 text-purple-500" />
          <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            Run preview · {name}
          </span>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
            ready
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300",
          )}
        >
          {ready ? "Ready" : "Needs attention"}
        </span>
      </div>

      <div className="space-y-3 px-3.5 py-3">
        {typeof r.node_count === "number" && (
          <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Workflow className="h-3.5 w-3.5" />
            {r.node_count} node{r.node_count === 1 ? "" : "s"}
            {targets.length > 0 && ` · ${targets.length} script step${targets.length === 1 ? "" : "s"}`}
          </p>
        )}

        {targets.length > 0 && (
          <div className="space-y-1">
            {targets.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/70 px-2.5 py-1.5 text-xs dark:border-gray-800 dark:bg-gray-900/40"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                <span className="min-w-0 flex-1 truncate font-medium text-gray-700 dark:text-gray-200">
                  {t.node_label || "Script step"}
                </span>
                {t.script_type && (
                  <span className="shrink-0 text-[11px] text-gray-400">{t.script_type}</span>
                )}
                {t.has_vault_binding && (
                  <span className="shrink-0 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    server
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {r.inputs_preview && Object.keys(r.inputs_preview).length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <ListTree className="h-3.5 w-3.5" /> Inputs
            </p>
            <ParamGrid values={r.inputs_preview} />
          </div>
        )}

        {/* Blocking reasons (e.g. run-time secret → builder) */}
        {!ready && (
          <div className="space-y-2">
            {blocking.map((b, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200"
              >
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="break-words">{b}</span>
              </div>
            ))}
            {secretNames.length > 0 && (
              <div className="space-y-1.5">
                {secretNames.map((n) => (
                  <SecretField key={n} name={n} />
                ))}
              </div>
            )}
            {workflowId && (
              <button
                type="button"
                onClick={() => navigate(`/workflow/${workflowId}`)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-purple-300 hover:text-purple-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:border-purple-700 dark:hover:text-purple-300"
              >
                Open in builder
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Ready → prefill a confirmation (AD-B3: user sends it themselves) */}
        {ready && (
          <div className="space-y-2">
            {paramCount > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                <ShieldCheck className="h-3.5 w-3.5 text-purple-500" />
                Running opens a secure form to confirm {paramCount} parameter
                {paramCount === 1 ? "" : "s"}
                {secretCount > 0
                  ? ` (${secretCount} entered privately).`
                  : "."}
              </p>
            )}
            <button
              type="button"
              onClick={() => seedPrompt(`Yes, run "${name}" now.`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-purple-700"
            >
              <Play className="h-3.5 w-3.5" />
              Run it now
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviewCard;
