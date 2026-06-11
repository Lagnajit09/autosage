/**
 * Parameter + secret field atoms for the execution renderer.
 *
 * `ParamGrid` renders proposed/persisted run inputs as compact key→value
 * boxes; values flagged secret (or already masked to "*****" by Django/AD-B9)
 * show as dots, never plaintext.
 *
 * `SecretField` is the run-time-secret affordance: a real `<input
 * type=password>` that is DISABLED today (AD-B9 Layer-4a refuses such runs
 * from chat). It becomes live in X17, when the value POSTs browser→Django
 * directly via the run-intent fulfill endpoint — never through Autobot.
 */

import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";

const PASSWORD_MASK = "*****";

const formatValue = (v: unknown): string => {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

interface ParamGridProps {
  values: Record<string, unknown> | null | undefined;
  /** Keys whose values must be shown masked even if not pre-masked. */
  secretKeys?: Set<string>;
  className?: string;
}

export const ParamGrid = ({ values, secretKeys, className }: ParamGridProps) => {
  const entries = Object.entries(values || {});
  if (!entries.length)
    return (
      <p className="text-xs italic text-gray-400 dark:text-gray-500">
        No parameters.
      </p>
    );
  return (
    <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", className)}>
      {entries.map(([k, v]) => {
        const secret = secretKeys?.has(k) || v === PASSWORD_MASK;
        return (
          <div
            key={k}
            className="min-w-0 rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/40"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              {secret && <Lock className="h-3 w-3 shrink-0" />}
              <span className="truncate" title={k}>
                {k}
              </span>
            </div>
            <div className="mt-0.5 break-words font-mono text-xs text-gray-800 dark:text-gray-200">
              {secret ? "•••••••" : formatValue(v)}
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface SecretFieldProps {
  /** Display name / parameter id of the required secret. */
  name: string;
  /** X17 will pass a real onChange + enabled; today it stays disabled. */
  disabled?: boolean;
}

export const SecretField = ({ name, disabled = true }: SecretFieldProps) => (
  <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800/60 dark:bg-amber-950/30">
    <Lock className="h-4 w-4 shrink-0 text-amber-500" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-semibold text-amber-800 dark:text-amber-300">
        {name}
      </p>
      <p className="text-[10px] leading-tight text-amber-600/90 dark:text-amber-400/70">
        Secret — provided securely at run time, never through chat
      </p>
    </div>
    <input
      type="password"
      disabled={disabled}
      placeholder="••••••"
      aria-label={`Secret value for ${name}`}
      className="w-24 rounded-md border border-amber-200 bg-white/70 px-2 py-1 text-xs text-gray-700 placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-800/60 dark:bg-gray-900/50 dark:text-gray-200"
    />
  </div>
);
