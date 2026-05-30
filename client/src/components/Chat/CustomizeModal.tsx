/**
 * Customize modal (T21).
 *
 * Two tabs:
 *   • Personalization — tone (verbosity), expertise, language, custom
 *     instructions, and the user's default LLM. All map 1:1 to
 *     `UserSettings` fields on the backend.
 *   • LLM Keys — full CRUD for `LLMConfig` rows. Lets the user bring
 *     their own provider keys (Gemini / Groq / OpenRouter / Anthropic /
 *     OpenAI / Azure / custom OpenAI-compatible endpoint).
 *
 * The personalization fields use backend semantics directly:
 *   - `tone`     → 'concise' | 'balanced' | 'detailed'  (verbosity)
 *   - `expertise`→ 'beginner' | 'intermediate' | 'expert'
 *   - `language` → ISO-639 string, free-form
 *   - `custom_instructions` → free text appended to the system prompt
 *
 * Loading strategy: settings + configs are fetched in parallel when the
 * modal opens (not on app mount) so a closed Customize doesn't burn API
 * calls. The modal stays open until the user explicitly closes it; in-
 * flight saves block UI but don't auto-close.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

import {
  getSettings,
  patchSettings,
  listLLMConfigs,
  createLLMConfig,
  patchLLMConfig,
  deleteLLMConfig,
  type UserSettings,
  type LLMConfig,
  type AutobotProvider,
  type AutobotTone,
  type AutobotExpertise,
  type LLMConfigCreateBody,
  type LLMConfigUpdateBody,
} from "@/lib/api/autobot";

interface CustomizeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after a successful save so the parent (Interface) can refresh
   * its model picker if the user added/removed/changed configs while
   * chatting. Optional. */
  onConfigsChanged?: () => void;
}

// Default form values when the user clicks "Add new". Empty strings let
// the placeholder text show through.
const EMPTY_FORM: LLMConfigCreateBody = {
  name: "",
  provider: "gemini",
  api_key: "",
  model_name: "",
  api_version: "",
  base_url: "",
  system_instruction: "",
  is_default: false,
};

const PROVIDER_OPTIONS: { value: AutobotProvider; label: string }[] = [
  { value: "gemini", label: "Gemini" },
  { value: "groq", label: "Groq" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "azure_openai", label: "Azure OpenAI" },
  { value: "custom", label: "Custom (LiteLLM-compatible)" },
];

// Convenience hints displayed next to `model_name` to nudge users
// toward identifiers that actually work with each provider.
const MODEL_HINTS: Record<AutobotProvider, string> = {
  gemini: "e.g. gemini/gemini-2.0-flash",
  groq: "e.g. groq/llama-3.3-70b-versatile",
  openrouter: "e.g. openrouter/meta-llama/llama-4-scout-17b-16e-instruct:free",
  anthropic: "e.g. anthropic/claude-sonnet-4-5",
  openai: "e.g. gpt-4o-mini",
  azure_openai: "Azure deployment name",
  custom: "Any LiteLLM model id",
};

const CustomizeModal = ({
  open,
  onOpenChange,
  onConfigsChanged,
}: CustomizeModalProps) => {
  const { getToken } = useAuth();

  // ── Personalization state ────────────────────────────────────────
  const [tone, setTone] = useState<AutobotTone>("balanced");
  const [expertise, setExpertise] = useState<AutobotExpertise>("intermediate");
  const [language, setLanguage] = useState<string>("en");
  const [customInstructions, setCustomInstructions] = useState<string>("");
  const [defaultLLMConfig, setDefaultLLMConfig] = useState<string | null>(null);

  // ── LLM Keys state ───────────────────────────────────────────────
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); // null = list view; 'new' = create form
  const [formData, setFormData] = useState<LLMConfigCreateBody>(EMPTY_FORM);
  const [showApiKey, setShowApiKey] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Async state ──────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load both settings + configs when the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not signed in.");
        const [settings, configList] = await Promise.all([
          getSettings(token),
          listLLMConfigs(token),
        ]);
        if (cancelled) return;
        setTone(settings.tone);
        setExpertise(settings.expertise);
        setLanguage(settings.language);
        setCustomInstructions(settings.custom_instructions);
        setDefaultLLMConfig(settings.default_llm_config);
        setConfigs(configList);
        // Reset any open create/edit form when reopening the modal.
        setEditingId(null);
        setFormData(EMPTY_FORM);
        setShowApiKey(false);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load settings.";
        toast.error(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, getToken]);

  // ── Personalization save ─────────────────────────────────────────
  const handleSaveSettings = useCallback(async () => {
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in.");
      const updated = await patchSettings(token, {
        tone,
        expertise,
        language,
        custom_instructions: customInstructions,
        default_llm_config: defaultLLMConfig,
      });
      // Re-sync state from server truth (e.g. default_llm_config could
      // have been blanked if the referenced config was just deleted).
      setTone(updated.tone);
      setExpertise(updated.expertise);
      setLanguage(updated.language);
      setCustomInstructions(updated.custom_instructions);
      setDefaultLLMConfig(updated.default_llm_config);
      toast.success("Preferences saved.");
      onConfigsChanged?.();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [
    tone,
    expertise,
    language,
    customInstructions,
    defaultLLMConfig,
    getToken,
    onOpenChange,
    onConfigsChanged,
  ]);

  // ── LLM Config CRUD ──────────────────────────────────────────────
  const openCreateForm = () => {
    setEditingId("new");
    setFormData(EMPTY_FORM);
    setShowApiKey(false);
  };

  const openEditForm = (config: LLMConfig) => {
    setEditingId(config.id);
    // api_key is write-only — never returned by the standard serializer.
    // Leave blank in the edit form; if the user leaves it blank, the
    // backend keeps the existing encrypted value.
    setFormData({
      name: config.name,
      provider: config.provider,
      api_key: "",
      model_name: config.model_name,
      api_version: config.api_version,
      base_url: config.base_url,
      system_instruction: config.system_instruction,
      is_default: config.is_default,
    });
    setShowApiKey(false);
  };

  const cancelForm = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setShowApiKey(false);
  };

  const handleSaveConfig = useCallback(async () => {
    // Light client-side validation. Backend re-validates and returns 400
    // with field-specific errors that we surface as a toast.
    if (!formData.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!formData.model_name.trim()) {
      toast.error("Model name is required.");
      return;
    }
    if (editingId === "new" && !formData.api_key.trim()) {
      toast.error("API key is required for new configs.");
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in.");
      if (editingId === "new") {
        const created = await createLLMConfig(token, formData);
        setConfigs((prev) => [...prev, created]);
        toast.success(`Added "${created.name}".`);
      } else if (editingId) {
        // PATCH with api_key as undefined when blank (preserves existing
        // ciphertext); otherwise send the new value.
        const patchBody: LLMConfigUpdateBody = {
          name: formData.name,
          provider: formData.provider,
          model_name: formData.model_name,
          api_version: formData.api_version,
          base_url: formData.base_url,
          system_instruction: formData.system_instruction,
          is_default: formData.is_default,
        };
        if (formData.api_key.trim()) patchBody.api_key = formData.api_key;
        const updated = await patchLLMConfig(token, editingId, patchBody);
        setConfigs((prev) =>
          prev.map((c) => (c.id === editingId ? updated : c)),
        );
        toast.success(`Updated "${updated.name}".`);
      }
      cancelForm();
      onConfigsChanged?.();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save config.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [editingId, formData, getToken, onConfigsChanged]);

  const handleDeleteConfig = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not signed in.");
        await deleteLLMConfig(token, id);
        setConfigs((prev) => prev.filter((c) => c.id !== id));
        // If the deleted config was the user's default, clear that
        // selection locally so the Save Preferences button doesn't try
        // to PATCH a stale FK.
        if (defaultLLMConfig === id) setDefaultLLMConfig(null);
        toast.success("Config deleted.");
        onConfigsChanged?.();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to delete.";
        toast.error(msg);
      } finally {
        setDeletingId(null);
      }
    },
    [getToken, defaultLLMConfig, onConfigsChanged],
  );

  // ── Render ───────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] bg-gray-50 dark:bg-[#171717] dark:border-gray-800 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-gray-200">Customize</DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Tune how Autobot responds and bring your own LLM provider keys.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
          </div>
        ) : (
          <Tabs defaultValue="personalization" className="mt-2">
            <TabsList className="grid w-full grid-cols-2 dark:bg-gray-800">
              <TabsTrigger value="personalization">Personalization</TabsTrigger>
              <TabsTrigger value="llm-keys">
                LLM Keys
                {configs.length > 0 && (
                  <span className="ml-2 rounded-full bg-purple-500/20 px-1.5 text-xs">
                    {configs.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Personalization ───────────────────────────────── */}
            <TabsContent value="personalization" className="space-y-5 pt-4">
              <FieldRow label="Response Length">
                <Select
                  value={tone}
                  onValueChange={(v) => setTone(v as AutobotTone)}
                >
                  <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                    <SelectItem value="concise">Concise</SelectItem>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="detailed">Detailed</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="Expertise">
                <Select
                  value={expertise}
                  onValueChange={(v) => setExpertise(v as AutobotExpertise)}
                >
                  <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="Language">
                <Input
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="en"
                  maxLength={16}
                  className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
                />
              </FieldRow>

              <FieldRow label="Default Model">
                <Select
                  value={defaultLLMConfig ?? "__none__"}
                  onValueChange={(v) =>
                    setDefaultLLMConfig(v === "__none__" ? null : v)
                  }
                >
                  <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                    <SelectItem value="__none__">
                      Use admin defaults (free)
                    </SelectItem>
                    {configs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        <span className="ml-2 text-xs text-gray-500">
                          ({c.provider})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="Custom Instructions" align="start">
                <Textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Anything Autobot should always know — your tech stack, preferences, response style…"
                  maxLength={4000}
                  className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 min-h-[100px]"
                />
              </FieldRow>
            </TabsContent>

            {/* ── LLM Keys ──────────────────────────────────────── */}
            <TabsContent value="llm-keys" className="pt-4">
              {editingId === null ? (
                <ConfigList
                  configs={configs}
                  onEdit={openEditForm}
                  onDelete={handleDeleteConfig}
                  onCreate={openCreateForm}
                  deletingId={deletingId}
                />
              ) : (
                <ConfigForm
                  isNew={editingId === "new"}
                  formData={formData}
                  setFormData={setFormData}
                  showApiKey={showApiKey}
                  setShowApiKey={setShowApiKey}
                  onSave={handleSaveConfig}
                  onCancel={cancelForm}
                  saving={saving}
                />
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* Footer only on the personalization tab. The LLM-keys tab
         * has its own per-config save/cancel buttons. */}
        {editingId === null && !loading && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:border-gray-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSettings}
              disabled={saving}
              className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Preferences"
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── Sub-components ─────────────────────────────────────────────────

interface FieldRowProps {
  label: string;
  align?: "center" | "start";
  children: React.ReactNode;
}

const FieldRow = ({ label, align = "center", children }: FieldRowProps) => (
  <div
    className={`grid grid-cols-4 gap-4 ${
      align === "start" ? "items-start" : "items-center"
    }`}
  >
    <Label className="text-right dark:text-gray-300">{label}</Label>
    <div className="col-span-3">{children}</div>
  </div>
);

interface ConfigListProps {
  configs: LLMConfig[];
  onEdit: (config: LLMConfig) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  deletingId: string | null;
}

const ConfigList = ({
  configs,
  onEdit,
  onDelete,
  onCreate,
  deletingId,
}: ConfigListProps) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Your personal LLM provider keys. Encrypted at rest.
      </p>
      <Button
        onClick={onCreate}
        size="sm"
        className="bg-purple-600 hover:bg-purple-700 text-white"
      >
        <Plus className="mr-1 h-4 w-4" />
        Add new
      </Button>
    </div>

    {configs.length === 0 ? (
      <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
        No personal keys yet. Add one to use your own Gemini, Groq,
        OpenRouter, OpenAI, or Anthropic account.
      </div>
    ) : (
      <ul className="space-y-2">
        {configs.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800/40"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm dark:text-gray-200">
                {c.name}
                {c.is_default && (
                  <span className="ml-2 rounded-full bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 text-[10px] font-semibold uppercase text-purple-700 dark:text-purple-300">
                    Default
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {c.provider} · {c.model_name}
              </p>
            </div>
            <div className="flex items-center gap-1 ml-2 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(c)}
                className="h-8 w-8 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(c.id)}
                disabled={deletingId === c.id}
                className="h-8 w-8 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
              >
                {deletingId === c.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    )}
  </div>
);

interface ConfigFormProps {
  isNew: boolean;
  formData: LLMConfigCreateBody;
  setFormData: React.Dispatch<React.SetStateAction<LLMConfigCreateBody>>;
  showApiKey: boolean;
  setShowApiKey: (show: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

const ConfigForm = ({
  isNew,
  formData,
  setFormData,
  showApiKey,
  setShowApiKey,
  onSave,
  onCancel,
  saving,
}: ConfigFormProps) => {
  // Generic field updater — typed against the body shape so callers
  // can't supply an unknown key by mistake.
  const updateField = <K extends keyof LLMConfigCreateBody>(
    key: K,
    value: LLMConfigCreateBody[K],
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const isAzure = formData.provider === "azure_openai";
  const isCustomOrOpenRouter =
    formData.provider === "custom" || formData.provider === "openrouter";

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold dark:text-gray-200">
        {isNew ? "Add LLM Config" : "Edit LLM Config"}
      </h3>

      <FieldRow label="Name">
        <Input
          value={formData.name}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder="My Groq key"
          maxLength={255}
          className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
        />
      </FieldRow>

      <FieldRow label="Provider">
        <Select
          value={formData.provider}
          onValueChange={(v) => updateField("provider", v as AutobotProvider)}
        >
          <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
            {PROVIDER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow label="Model">
        <div>
          <Input
            value={formData.model_name}
            onChange={(e) => updateField("model_name", e.target.value)}
            placeholder={MODEL_HINTS[formData.provider]}
            maxLength={255}
            className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
          />
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            {MODEL_HINTS[formData.provider]}
          </p>
        </div>
      </FieldRow>

      <FieldRow label="API Key">
        <div className="relative">
          <Input
            type={showApiKey ? "text" : "password"}
            value={formData.api_key}
            onChange={(e) => updateField("api_key", e.target.value)}
            placeholder={isNew ? "Required" : "Leave blank to keep existing"}
            maxLength={1024}
            className="pr-9 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label={showApiKey ? "Hide key" : "Show key"}
          >
            {showApiKey ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </FieldRow>

      {isAzure && (
        <FieldRow label="API Version">
          <Input
            value={formData.api_version}
            onChange={(e) => updateField("api_version", e.target.value)}
            placeholder="e.g. 2024-08-01-preview"
            maxLength={64}
            className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
          />
        </FieldRow>
      )}

      {isCustomOrOpenRouter && (
        <FieldRow label="Base URL">
          <Input
            value={formData.base_url}
            onChange={(e) => updateField("base_url", e.target.value)}
            placeholder="https://api.example.com/v1"
            maxLength={512}
            className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
          />
        </FieldRow>
      )}

      <FieldRow label="System Instruction" align="start">
        <Textarea
          value={formData.system_instruction}
          onChange={(e) => updateField("system_instruction", e.target.value)}
          placeholder="Optional — extra system prompt scoped to this config"
          className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 min-h-[80px]"
        />
      </FieldRow>

      <FieldRow label="Set as Default">
        <Switch
          checked={formData.is_default ?? false}
          onCheckedChange={(checked) => updateField("is_default", checked)}
        />
      </FieldRow>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={saving}
          className="dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:border-gray-700"
        >
          Cancel
        </Button>
        <Button
          onClick={onSave}
          disabled={saving}
          className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : isNew ? (
            "Add"
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </div>
  );
};

export default CustomizeModal;
