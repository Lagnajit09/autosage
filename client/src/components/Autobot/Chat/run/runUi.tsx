/**
 * Small shared presentational atoms for the execution renderer: the status
 * pill, the live elapsed counter, and a tiny node-progress meter. Kept
 * dependency-light so both the inline card and the drawer reuse them.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { STATUS_THEME, formatElapsed, toVisualStatus } from "./runTypes";

/** Live elapsed seconds; freezes at `finishedMs - startMs` once terminal. */
export const useElapsed = (
  startMs: number | null,
  finishedMs: number | null,
  running: boolean,
): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || startMs == null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running, startMs]);
  if (startMs == null) return 0;
  const end = finishedMs ?? (running ? now : startMs);
  return Math.max(0, (end - startMs) / 1000);
};

interface StatusPillProps {
  status: string;
  live?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export const StatusPill = ({
  status,
  live = false,
  size = "sm",
  className,
}: StatusPillProps) => {
  const v = toVisualStatus(status);
  const theme = STATUS_THEME[v];
  const spinning = live && (v === "running" || v === "queued");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-tight",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        theme.pill,
        className,
      )}
    >
      {spinning ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <span className={cn("h-1.5 w-1.5 rounded-full", theme.dot)} />
      )}
      {theme.label}
    </span>
  );
};

/** mm:ss elapsed badge (monospace) — matches ExecutionTerminal's footer. */
export const ElapsedBadge = ({ seconds }: { seconds: number }) => (
  <span className="font-mono tabular-nums text-gray-500 dark:text-gray-400">
    {formatElapsed(seconds)}
  </span>
);

interface NodeProgressProps {
  total: number;
  statuses: Record<string, string>;
  className?: string;
}

/** Thin segmented bar: done/failed/skipped vs remaining. */
export const NodeProgress = ({ total, statuses, className }: NodeProgressProps) => {
  if (total <= 0) return null;
  const values = Object.values(statuses);
  const failed = values.filter((s) => s === "failed" || s === "error").length;
  const done = values.filter((s) => s === "success").length;
  const skipped = values.filter((s) => s === "skipped").length;
  const settled = Math.min(total, done + failed + skipped);
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div className="bg-emerald-500 transition-all" style={{ width: pct(done) }} />
        <div className="bg-red-500 transition-all" style={{ width: pct(failed) }} />
        <div className="bg-gray-400 transition-all" style={{ width: pct(skipped) }} />
      </div>
      <span className="text-[11px] text-gray-500 dark:text-gray-400">
        {settled}/{total} nodes
        {failed > 0 ? ` · ${failed} failed` : ""}
        {skipped > 0 ? ` · ${skipped} skipped` : ""}
      </span>
    </div>
  );
};
