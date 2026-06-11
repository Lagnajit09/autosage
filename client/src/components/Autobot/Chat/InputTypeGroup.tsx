/**
 * Chat-mode segmented control (Research / Generation / Execution).
 *
 * Modes bias the system prompt:
 *   • Research   — read-only exploration (list_*, read_*).
 *   • Generation — create/modify scripts and workflows.
 *   • Execution  — run workflows/scripts from chat. BYO-only (AD-B3b): users
 *     on shared/admin keys can't execute, so the option locks until a BYO
 *     LLM config is selected (`executionEnabled`).
 */

import { Search, Atom, Cpu, Check, Lock } from "lucide-react";
import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ChatMode = "research" | "generation" | "execution";

interface InputTypeGroupProps {
  value: ChatMode;
  onChange: (mode: ChatMode) => void;
  /** Outer container disables all buttons (e.g. while a stream is in
   * flight — you can't change the mode mid-turn). */
  disabled?: boolean;
  /** Execution is BYO-only (AD-B3b). When false, the option is locked with a
   * "bring your own key" explanation rather than hidden. */
  executionEnabled?: boolean;
}

interface ButtonConfig {
  id: ChatMode;
  label: string;
  icon: typeof Search;
  short: string;
  description: string;
  /** Modes still in development show a Lock icon and refuse selection. */
  comingSoon?: boolean;
  /** Requires a BYO LLM config (gated by `executionEnabled`). */
  requiresByo?: boolean;
}

const BUTTONS: ButtonConfig[] = [
  {
    id: "research",
    label: "Research",
    icon: Search,
    short: "Explore your library and the docs",
    description:
      "Read existing scripts, workflows, and vault entries. Autobot won't create or modify anything in this mode.",
  },
  {
    id: "generation",
    label: "Generation",
    icon: Atom,
    short: "Create scripts and workflows",
    description:
      "Generate new scripts and workflows from a description. Autobot uses your library context and can update existing items too.",
  },
  {
    id: "execution",
    label: "Execution",
    icon: Cpu,
    short: "Run workflows and scripts",
    description:
      "Trigger workflow and script runs and watch them live, then investigate failures. Requires your own API key (BYO) — runs use more tokens, so they're not available on shared keys.",
    requiresByo: true,
  },
];

const InputTypeGroup: React.FC<InputTypeGroupProps> = ({
  value,
  onChange,
  disabled = false,
  executionEnabled = false,
}) => {
  return (
    <div className="flex items-center bg-[#efe9f3] dark:bg-[#170f2085] rounded-lg shadow-sm border border-[#d9cde0] dark:border-[#27073a52] w-fit">
      {BUTTONS.map(
        ({ id, label, short, description, icon: Icon, comingSoon, requiresByo }) => {
          const active = value === id;
          const byoLocked = !!requiresByo && !executionEnabled;
          const showLock = comingSoon || byoLocked;
          const isLocked = showLock || disabled;
          const status = comingSoon
            ? "Coming Soon"
            : byoLocked
              ? "BYO key required"
              : "Enabled";
          return (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    if (isLocked) return;
                    onChange(id);
                  }}
                  disabled={isLocked}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all
                    ${
                      active
                        ? "bg-white dark:bg-[#5e3e732b] text-[#1b267a] shadow-md"
                        : "text-[#8d70b4] hover:text-[#83269d] dark:hover:text-[#c89bff]"
                    }
                    ${
                      showLock
                        ? "opacity-50 cursor-not-allowed hover:text-[#8d70b4] dark:hover:text-[#8d70b4]"
                        : disabled
                          ? "opacity-60 cursor-not-allowed"
                          : ""
                    }`}
                  aria-pressed={active}
                  aria-label={`${label} mode${showLock ? " (locked)" : ""}`}
                >
                  {showLock ? (
                    <Lock size={16} strokeWidth={2} />
                  ) : (
                    <Icon
                      size={18}
                      strokeWidth={2}
                      className={active ? "text-[#9128b1]" : ""}
                    />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="rounded-xl bg-gray-100 dark:bg-gray-800 shadow-md border-2 border-gray-200 dark:border-gray-700"
              >
                <TooltipContentBox
                  label={label}
                  short={short}
                  description={description}
                  status={status}
                  statusOk={!showLock}
                  tag="Chat Mode"
                />
              </TooltipContent>
            </Tooltip>
          );
        },
      )}
    </div>
  );
};

export default InputTypeGroup;

interface TooltipContentBoxProps {
  label: string;
  short: string;
  description: string;
  status?: string;
  statusOk?: boolean;
  tag?: string;
}

const TooltipContentBox = ({
  label,
  short,
  description,
  status,
  statusOk = true,
  tag,
}: TooltipContentBoxProps) => {
  return (
    <div className="bg-transparent text-gray-900 dark:text-gray-100 p-3 rounded-lg w-[220px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        {status && (
          <div
            className={`flex items-center gap-1 text-xs ${
              statusOk
                ? "text-emerald-600 dark:text-[#8ef0a0]"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {statusOk ? (
              <Check size={14} strokeWidth={2} />
            ) : (
              <Lock size={12} strokeWidth={2} />
            )}{" "}
            {status}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-snug">
        {short}
      </p>

      <div className="h-px my-2 bg-gray-200 dark:bg-[#2e2e2e]" />

      <p className="text-[11px] text-gray-700 dark:text-gray-300">
        {description}
      </p>

      {tag && (
        <div className="mt-2 text-[10px] text-purple-700 dark:text-purple-300 uppercase tracking-wide">
          {tag}
        </div>
      )}
    </div>
  );
};
