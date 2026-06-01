/**
 * Slim model picker for the chat input (T21).
 *
 * Two contexts:
 *   • Existing thread → selecting a config PATCHes `Thread.llm_config`
 *     so the override sticks for this conversation.
 *   • Welcome screen → the chosen config is held by the parent and
 *     passed to `createThread({ llm_config })` on first send.
 *
 * "Default" represents fall-through to the user's global default
 * (UserSettings.default_llm_config) or admin keys when no global is set.
 * It maps to `null` on the wire — the backend treats null as "no thread-
 * level override; resolve via user settings then admin."
 */

import { ChevronDown, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LLMConfig } from "@/lib/api/autobot";

interface ModelPickerProps {
  /** Currently-selected config id. `null` means "use default" (no thread
   * override). */
  selectedConfigId: string | null;
  configs: LLMConfig[];
  /** Id of the user's global default, used to annotate which fall-through
   * choice the "Default" option will resolve to. Optional. */
  userDefaultId?: string | null;
  /** True while the parent is loading configs OR persisting a change. */
  disabled?: boolean;
  onChange: (newConfigId: string | null) => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  openai: "OpenAI",
  azure_openai: "Azure OpenAI",
  custom: "Custom",
};

const formatConfigLabel = (config: LLMConfig): string => {
  const provider = PROVIDER_LABELS[config.provider] || config.provider;
  return `${config.name} (${provider})`;
};

export const ModelPicker = ({
  selectedConfigId,
  configs,
  userDefaultId,
  disabled = false,
  onChange,
}: ModelPickerProps) => {
  const selected =
    selectedConfigId != null
      ? configs.find((c) => c.id === selectedConfigId)
      : null;
  const userDefault =
    userDefaultId != null ? configs.find((c) => c.id === userDefaultId) : null;

  const triggerLabel = selected
    ? formatConfigLabel(selected)
    : userDefault
      ? `Default (${formatConfigLabel(userDefault)})`
      : "Default LLM Models";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-800/40 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed max-w-[260px]"
          title={triggerLabel}
        >
          <Sparkles className="h-3 w-3 shrink-0" />
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[280px] dark:bg-[#262626] border-gray-200 dark:border-gray-700"
      >
        <DropdownMenuLabel className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Model for this chat
        </DropdownMenuLabel>
        <div className="px-2 pb-2 text-[10px] leading-snug text-gray-500 dark:text-gray-400">
          Per-chat choice. To change your global default, open Customize.
        </div>
        <DropdownMenuItem
          onClick={() => onChange(null)}
          className={`cursor-pointer text-sm ${
            selectedConfigId === null
              ? "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
              : "text-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/60"
          }`}
        >
          <div className="flex flex-col">
            <span className="font-medium">Default</span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {userDefault
                ? `Uses ${formatConfigLabel(userDefault)}`
                : "Uses the system's free LLM models"}
            </span>
          </div>
        </DropdownMenuItem>

        {configs.length > 0 && (
          <DropdownMenuSeparator className="dark:bg-gray-600" />
        )}

        {configs.map((config) => (
          <DropdownMenuItem
            key={config.id}
            onClick={() => onChange(config.id)}
            className={`cursor-pointer text-sm ${
              selectedConfigId === config.id
                ? "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                : "text-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/60"
            }`}
          >
            <div className="flex flex-col">
              <span className="font-medium">{config.name}</span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                {PROVIDER_LABELS[config.provider] || config.provider} ·{" "}
                {config.model_name}
              </span>
            </div>
          </DropdownMenuItem>
        ))}

        {configs.length === 0 && (
          <div className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400">
            No personal keys yet. Add one in Customize → LLM Keys.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ModelPicker;
