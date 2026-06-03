/**
 * Per-thread settings modal.
 *
 * Two knobs:
 *   • llm_config            → which BYO key handles this conversation.
 *                             `null` = fall through to user default → admin pool.
 *   • system_prompt_override → appended to the global system prompt for
 *                             just this chat. Backend caps it at 8000 chars
 *                             (Thread.system_prompt_override max_length).
 *
 * Scope is intentionally per-thread; the global defaults live in
 * Customize → Personalization (UserSettings.custom_instructions and
 * UserSettings.default_llm_config).
 */

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import ModelPicker from "./ModelPicker";

import {
  patchThread,
  type AutobotThread,
  type LLMConfig,
} from "@/lib/api/autobot";

const MAX_LEN = 8000;

interface ThreadSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thread: AutobotThread | null;
  configs: LLMConfig[];
  userDefaultId: string | null;
  /** Fires after a successful save so the parent can re-sync its local
   * thread state from the server response. */
  onSaved?: (updated: AutobotThread) => void;
}

const ThreadSettingsModal = ({
  open,
  onOpenChange,
  thread,
  configs,
  userDefaultId,
  onSaved,
}: ThreadSettingsModalProps) => {
  const { getToken } = useAuth();
  const [override, setOverride] = useState<string>("");
  const [llmConfigId, setLlmConfigId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-seed local state from the thread each time the modal opens so a
  // discarded edit doesn't leak into the next session.
  useEffect(() => {
    if (open) {
      setOverride(thread?.system_prompt_override ?? "");
      setLlmConfigId(thread?.llm_config ?? null);
    }
  }, [open, thread?.system_prompt_override, thread?.llm_config]);

  const handleSave = async () => {
    if (!thread) return;
    if (override.length > MAX_LEN) {
      toast.error(`Too long — max ${MAX_LEN} characters.`);
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in.");
      const updated = await patchThread(token, thread.id, {
        system_prompt_override: override,
        llm_config: llmConfigId,
      });
      onSaved?.(updated);
      toast.success("Thread settings saved.");
      onOpenChange(false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save thread settings.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleClearPrompt = () => {
    setOverride("");
  };

  const dirty =
    (thread?.system_prompt_override ?? "") !== override ||
    (thread?.llm_config ?? null) !== llmConfigId;
  const tooLong = override.length > MAX_LEN;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-gray-50 dark:bg-[#171717] dark:border-gray-800 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-gray-200">
            Thread settings
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Applies only to this conversation. To change defaults for every
            new chat, use Customize.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-5">
          {/* ── Model ──────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Model for this chat</Label>
            <div>
              <ModelPicker
                selectedConfigId={llmConfigId}
                configs={configs}
                userDefaultId={userDefaultId}
                disabled={saving || !thread}
                onChange={setLlmConfigId}
              />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {configs.length === 0
                ? "No personal keys yet. Add one in Customize → LLM Keys to pick a specific model here."
                : "Which provider key handles this conversation. Default falls through to your global preference."}
            </p>
          </div>

          {/* ── System prompt override ─────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="thread-system-prompt"
                className="dark:text-gray-300"
              >
                System prompt addendum
              </Label>
              <span
                className={`text-[11px] tabular-nums ${
                  tooLong
                    ? "text-red-600 dark:text-red-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {override.length.toLocaleString()} / {MAX_LEN.toLocaleString()}
              </span>
            </div>
            <Textarea
              id="thread-system-prompt"
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder='e.g. "We&apos;re debugging the prod-db-1 migration today — assume Postgres 14 and zero downtime constraints."'
              rows={7}
              className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 min-h-[140px] resize-y"
              disabled={saving || !thread}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Added on top of your global system prompt for this chat only.
              </p>
              <button
                type="button"
                onClick={handleClearPrompt}
                disabled={saving || override.length === 0}
                className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-col-reverse sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:border-gray-700"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !thread || !dirty || tooLong}
            className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ThreadSettingsModal;
