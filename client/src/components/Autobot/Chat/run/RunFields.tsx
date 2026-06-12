/**
 * Parameter + secret field atoms for the execution renderer.
 *
 * `ParamGrid` renders proposed/persisted run inputs as compact key→value
 * boxes (read-only); values flagged secret (or already masked to "*****" by
 * Django/AD-B9) show as dots, never plaintext.
 *
 * `SecretField` is the run-time-secret affordance: a real `<input
 * type=password>`. It stays DISABLED in read-only contexts (e.g. the preview
 * card), and becomes LIVE inside the X17 confirmation form, where its value
 * POSTs browser→Django directly via the run-intent fulfill endpoint — never
 * through Autobot.
 *
 * `ParamInput` is the editable non-secret sibling (string/number/boolean), and
 * `OutputRefChip` is the read-only display for an `output` (node-reference)
 * param the user must not edit.
 */

import { CornerUpRight, Lock } from "lucide-react";

import { cn } from "@/lib/utils";

import type { NeedsParam } from "./runTypes";

const PASSWORD_MASK = "*****";

/** Inline editable-input classes — fixed width so a row reads
 * "label …… input"; neutral surface, purple focus, theme-aware. */
const INPUT_CLASS =
  "w-36 shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 transition-colors focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-100 dark:placeholder:text-gray-500 sm:w-44";

/** Inline " (node_name [type])" suffix after a param name, so the user knows
 * which step the value feeds without breaking the single-line row. */
const MetaLabel = ({
  param,
  className,
}: {
  param: NeedsParam;
  className?: string;
}) => {
  if (!param.node_label) return null;
  const meta = param.node_type
    ? `${param.node_label} [${param.node_type}]`
    : param.node_label;
  return <span className={cn("font-normal", className)}> ({meta})</span>;
};

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

export const ParamGrid = ({
  values,
  secretKeys,
  className,
}: ParamGridProps) => {
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
  /** Display name / parameter id of the secret. */
  name: string;
  /** Read-only display when true (default — e.g. the preview card). */
  disabled?: boolean;
  /** Controlled value (live form). */
  value?: string;
  onChange?: (next: string) => void;
  /** Hint shown under the name (e.g. "Required" / "Leave blank to keep stored"). */
  hint?: string;
  /** When provided, renders an "in <node> · <type>" caption. */
  param?: NeedsParam;
}

export const SecretField = ({
  name,
  disabled = true,
  value,
  onChange,
  hint,
  param,
}: SecretFieldProps) => (
  <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800/60 dark:bg-amber-950/10">
    <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
    <p className="min-w-0 flex-1 truncate text-xs" title={name}>
      <span className="font-semibold text-amber-800 dark:text-amber-300">
        {name}
      </span>
      {param && (
        <MetaLabel
          param={param}
          className="text-amber-600/70 dark:text-amber-400/60"
        />
      )}
    </p>
    <input
      type="password"
      disabled={disabled}
      value={value ?? ""}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      placeholder={hint ?? "••••••"}
      autoComplete="off"
      aria-label={`Secret value for ${name}`}
      className="w-36 shrink-0 rounded-md border border-amber-300 bg-white/90 px-2 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 transition-colors focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-800/60 dark:bg-gray-900/60 dark:text-gray-100 sm:w-44"
    />
  </div>
);

interface ParamInputProps {
  param: NeedsParam;
  value: string;
  onChange: (next: string) => void;
}

/** Editable inline row for a non-secret manual param (string / number / boolean). */
export const ParamInput = ({ param, value, onChange }: ParamInputProps) => {
  const t = (param.type || "string").toLowerCase();
  const hint = param.has_default ? "Leave blank for default" : "value";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/20">
      <p className="min-w-0 flex-1 truncate text-xs" title={param.name}>
        <span className="font-semibold text-gray-700 dark:text-gray-200">
          {param.name}
        </span>
        <MetaLabel param={param} className="text-gray-400 dark:text-gray-500" />
      </p>
      {t === "boolean" ? (
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-400/40 dark:border-gray-600 dark:bg-gray-800"
          />
          {value === "true" ? "true" : "false"}
        </label>
      ) : (
        <input
          type="text"
          inputMode={t === "number" ? "decimal" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hint}
          aria-label={param.name}
          className={INPUT_CLASS}
        />
      )}
    </div>
  );
};

/** Read-only inline row for an `output` (node-reference) param — not editable;
 * the value is resolved from a previous node's output at run time. */
export const OutputRefChip = ({ param }: { param: NeedsParam }) => (
  <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/20">
    <p className="min-w-0 flex-1 truncate text-xs" title={param.name}>
      <span className="font-semibold text-gray-700 dark:text-gray-200">
        {param.name}
      </span>
      <MetaLabel param={param} className="text-gray-400 dark:text-gray-500" />
    </p>
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
      <CornerUpRight className="h-3 w-3" />
      from previous step
    </span>
  </div>
);
