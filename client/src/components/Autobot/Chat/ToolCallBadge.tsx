/**
 * Inline badge for one tool call. Collapsed by default; click to expand
 * and inspect raw arguments + result.
 */

import { CheckCircle2, ChevronDown, Loader2, XCircle } from "lucide-react";
import { useState } from "react";

export type ToolCallStatus = "running" | "done" | "error";

interface ToolCallBadgeProps {
  name: string;
  status: ToolCallStatus;
  /** Raw JSON string the LLM produced. May be malformed mid-stream. */
  argumentsJson: string;
  /** Tool's return value once it lands. `{ error: "..." }` on failure. */
  result?: Record<string, unknown>;
}

const humanLabel = (toolName: string): string => {
  const spaced = toolName.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const formatJson = (raw: string): string => {
  // Fall back to the raw string for partial/malformed payloads mid-stream.
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

export const ToolCallBadge = ({
  name,
  status,
  argumentsJson,
  result,
}: ToolCallBadgeProps) => {
  const [expanded, setExpanded] = useState(false);
  const isError =
    status === "error" ||
    (result != null && typeof result === "object" && "error" in result);

  // Icon resolves on status — error overrides status when the tool
  // returned a `{ error }` payload even though dispatch itself succeeded.
  const Icon =
    status === "running" ? Loader2 : isError ? XCircle : CheckCircle2;
  const iconClass =
    status === "running"
      ? "h-3.5 w-3.5 text-blue-500 animate-spin"
      : isError
        ? "h-3.5 w-3.5 text-red-500"
        : "h-3.5 w-3.5 text-emerald-500";

  const label = humanLabel(name);
  const labelText =
    status === "running"
      ? `Working: ${label}`
      : isError
        ? `${label} (failed)`
        : label;

  return (
    <div className="my-2 max-w-full">
      <button
        type="button"
        onClick={() => status !== "running" && setExpanded((p) => !p)}
        disabled={status === "running"}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          isError
            ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300"
            : "border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200"
        } ${status !== "running" ? "cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700/60" : "cursor-default"}`}
      >
        <Icon className={iconClass} />
        <span>{labelText}</span>
        {status !== "running" && (
          <ChevronDown
            className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {expanded && status !== "running" && (
        <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-800 dark:bg-gray-900/60">
          <div className="mb-2">
            <p className="mb-1 font-semibold text-gray-600 dark:text-gray-400">
              Arguments
            </p>
            <pre className="thin-scrollbar max-h-40 overflow-auto rounded bg-white p-2 font-mono text-[11px] text-gray-800 dark:bg-gray-950 dark:text-gray-200">
              {formatJson(argumentsJson) || "(none)"}
            </pre>
          </div>
          {result !== undefined && (
            <div>
              <p className="mb-1 font-semibold text-gray-600 dark:text-gray-400">
                {isError ? "Error" : "Result"}
              </p>
              <pre className="thin-scrollbar max-h-60 overflow-auto rounded bg-white p-2 font-mono text-[11px] text-gray-800 dark:bg-gray-950 dark:text-gray-200">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolCallBadge;
