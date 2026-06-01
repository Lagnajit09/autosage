/**
 * AI Script Generator (T22, part 1).
 *
 * Inline streaming chat panel that lives in the ScriptEditor's right
 * sidebar. **Does not** redirect the user to /ai/autobot — the chat
 * happens here, scoped strictly to script create / update / read /
 * list operations.
 *
 * Why a panel instead of a redirect:
 *   • The user is mid-edit. Sending them to a separate chat page
 *     breaks their flow. They want "make this script do X" right next
 *     to the editor pane.
 *   • Tool callbacks (`create_script`, `update_script`) wire DIRECTLY
 *     back into the editor — new scripts open automatically, updates
 *     refresh the visible content without a manual reload.
 *
 * Thread lifecycle:
 *   - Created lazily on first prompt, with `is_archived: true` so it
 *     stays out of the main /ai/autobot chat history sidebar.
 *   - Held in component state — fresh thread per page load. No
 *     localStorage persistence (avoids stale context bleeding into
 *     unrelated editing sessions).
 *   - The "Clear chat" button wipes local state; the next prompt
 *     creates a new thread.
 *
 * Per-turn payload shape (only the LLM sees the context block; the
 * chat UI displays the user's typed text alone):
 *
 *     <context>
 *     language: python
 *     open_script_id: 42
 *     open_script_name: deploy.py
 *     </context>
 *
 *     <user's actual prompt>
 *
 * The system_prompt_override taught the LLM how to parse that block
 * (see `SCRIPT_EDITOR_SYSTEM_PROMPT` below).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Send, Sparkles, Wand2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CodeBlock } from "@/components/Autobot/Chat/CodeBlock";
import ToolCallBadge, {
  type ToolCallStatus,
} from "@/components/Autobot/Chat/ToolCallBadge";
import {
  createThread,
  getSettings,
  listLLMConfigs,
  patchThread,
  type AutobotMessage,
  type AutobotToolCall,
  type LLMConfig,
} from "@/lib/api/autobot";
import {
  streamMessage,
  type AutobotStreamEvent,
} from "@/lib/api/autobot-stream";
import type { ScriptLanguage } from "@/utils/types";
import { AutobotIcon } from "../AutobotIcon";
import ModelPicker from "@/components/Autobot/Chat/ModelPicker";

// Languages that map to real Autosage runtime targets. JavaScript is
// excluded because the runtime can't execute it — it's an editor-only
// language. Match the backend `_SCRIPT_LANGUAGES` in autobot/tools/scripts.py.
const LANGUAGES: { value: ScriptLanguage; label: string }[] = [
  { value: "python", label: "Python" },
  { value: "powershell", label: "PowerShell" },
  { value: "shell", label: "Shell / Bash" },
];

interface OpenScript {
  /** Stringified Django Script.id — `useScriptEditor` already coerces
   * the numeric pk to a string when building `ScriptFile.id`, so we
   * accept the same type here. */
  id: string;
  name: string;
  language: ScriptLanguage;
}

interface AIScriptGeneratorProps {
  /** The script currently open in the editor (if any). Used to seed
   * the language picker and inject context so the LLM knows which
   * script the user is editing. */
  openScript?: OpenScript | null;
  /** Fired with the numeric Script.id (as a string, matching ScriptFile)
   * when the LLM successfully `create_script`s. Parent should refetch
   * files + navigate to the new script. */
  onScriptCreated: (scriptId: string, scriptName: string) => void;
  /** Fired when the LLM successfully `update_script`s. Parent should
   * refetch the affected script's content so the editor reflects the
   * new version. */
  onScriptUpdated: (scriptId: string) => void;
  /** Lets the panel close itself via the X icon. */
  onClose?: () => void;
}

// System prompt for this panel lives in autobot/llm/prompts.py
// (_SCRIPT_EDITOR_PANEL_PROMPT). The frontend just sends `panel:
// "script_editor"` on each turn; the backend composes the right
// prompt AND filters the advertised tool schemas to the script-only
// subset, so the LLM literally can't reach create_workflow etc. from
// this panel.

interface PendingToolCall {
  id: string;
  name: string;
  argumentsJson: string;
  status: ToolCallStatus;
  result?: Record<string, unknown>;
}

interface PendingAssistant {
  content: string;
  toolCalls: PendingToolCall[];
}

// Display copy of an AutobotMessage trimmed to what this panel needs.
// Stored locally — we don't refetch history, we just accumulate as the
// user sends prompts within one editor session.
interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: AutobotToolCall[];
}

const newClientId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
};

const buildContextBlock = (
  language: ScriptLanguage,
  openScript: OpenScript | null | undefined,
): string => {
  const lines = [`language: ${language}`];
  if (openScript) {
    lines.push(`open_script_id: ${openScript.id}`);
    lines.push(`open_script_name: ${openScript.name}`);
  }
  return `<context>\n${lines.join("\n")}\n</context>`;
};

const extractScriptId = (
  result: Record<string, unknown> | undefined,
): string | null => {
  if (!result || typeof result !== "object") return null;
  if ("error" in result) return null;
  const id = (result as { id?: unknown }).id;
  if (typeof id === "number") return String(id);
  if (typeof id === "string" && id) return id;
  return null;
};

const extractScriptName = (
  result: Record<string, unknown> | undefined,
): string => {
  if (!result || typeof result !== "object") return "";
  const name = (result as { name?: unknown }).name;
  return typeof name === "string" ? name : "";
};

const AIScriptGenerator: React.FC<AIScriptGeneratorProps> = ({
  openScript,
  onScriptCreated,
  onScriptUpdated,
  onClose,
}) => {
  const { getToken } = useAuth();

  // ── State ──────────────────────────────────────────────────────────
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  // Language defaults to the open script's language so the picker
  // doesn't need touching when the user is editing an existing file.
  // If no script is open, default to python (most common autobot use).
  const [language, setLanguage] = useState<ScriptLanguage>(
    openScript?.language && openScript.language !== "javascript"
      ? openScript.language
      : "python",
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingAssistant, setPendingAssistant] =
    useState<PendingAssistant | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  // ── BYO LLM state ──────────────────────────────────────────────────
  // Same shape as the main /ai/autobot Interface picker — keeps the
  // UX consistent. `selectedConfigId` is the per-thread choice; null
  // means "fall through to UserSettings.default_llm_config or admin".
  // We load configs + settings ONCE on mount; if the user adds a new
  // BYO config in the main chat's Customize modal mid-session, they'd
  // need to reload the editor page to see it here (the panel doesn't
  // re-fetch since it stays mounted forever — see sidebar.tsx for
  // why). This is a deliberate simplicity trade-off.
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [userDefaultId, setUserDefaultId] = useState<string | null>(null);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [modelSwitching, setModelSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const [configList, settings] = await Promise.all([
          listLLMConfigs(token),
          getSettings(token),
        ]);
        if (cancelled) return;
        setConfigs(configList);
        setUserDefaultId(settings.default_llm_config);
      } catch (err) {
        // Non-fatal — picker just shows "Default" with an empty list.
        console.warn("Failed to load LLM configs for Script Generator:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  // When the user opens / switches between scripts, follow the new
  // script's language unless they've explicitly diverged. To avoid
  // overriding a deliberate user choice, we only seed on `openScript`
  // identity changes (a fresh ref means a new script was selected).
  useEffect(() => {
    if (openScript?.language && openScript.language !== "javascript") {
      setLanguage(openScript.language);
    }
  }, [openScript?.id, openScript?.language]);

  const messagesRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom on any content change.
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, pendingAssistant]);

  // Abort any in-flight stream if the panel unmounts.
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  // ── Clear chat ─────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    abortRef.current?.abort();
    setThreadId(null);
    setMessages([]);
    setPendingAssistant(null);
    setStreamError(null);
    setPrompt("");
    // Reset to default model choice on a fresh thread. The new thread
    // mints with no override, falling back through user-default → admin.
    setSelectedConfigId(null);
  }, []);

  // ── Send ───────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isStreaming) return;

    setStreamError(null);
    const clientId = newClientId();

    // Optimistically append the user's typed text to the visible chat.
    // We do NOT include the context block here — the network payload
    // gets it separately so the chat UI stays clean.
    setMessages((prev) => [
      ...prev,
      {
        id: `local-user-${clientId}`,
        role: "user",
        content: trimmed,
        toolCalls: [],
      },
    ]);
    setPrompt("");
    setIsStreaming(true);
    setPendingAssistant({ content: "", toolCalls: [] });

    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in.");

      // Lazily mint the thread on the first prompt. `is_archived: true`
      // keeps it out of the main chat history sidebar — the user never
      // sees this thread in /ai/autobot. The system_prompt_override is
      // appended to the base Autosage prompt (NOT replacing it), so the
      // LLM keeps its workflow / script / trigger domain knowledge AND
      // gets the script-scope constraint we add here.
      let activeThreadId = threadId;
      if (!activeThreadId) {
        const titleSeed =
          trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
        const created = await createThread(token, {
          title: `[Script Editor] ${titleSeed}`,
          is_archived: true,
          // Seed the per-thread llm_config with whatever the user picked
          // from the panel's model picker. Falls through to user default
          // / admin when null, identical to the main chat's resolution.
          llm_config: selectedConfigId,
          // No `system_prompt_override` here — the per-panel system
          // prompt now lives in autobot/llm/prompts.py and is composed
          // per-turn via the `panel` field on streamMessage below.
          // Keeping it server-side lets us iterate on the prompt
          // without a frontend deploy.
        });
        activeThreadId = created.id;
        setThreadId(activeThreadId);
      }

      const contextBlock = buildContextBlock(language, openScript);
      const networkContent = `${contextBlock}\n\n${trimmed}`;

      const controller = new AbortController();
      abortRef.current = controller;

      // Tool results captured during the turn. Fired AFTER the stream
      // closes so the parent doesn't re-render the editor mid-stream
      // (which would steal focus from the chat input).
      const createdScripts: { id: string; name: string }[] = [];
      const updatedScriptIds: string[] = [];

      await streamMessage(
        token,
        activeThreadId,
        {
          content: networkContent,
          client_id: clientId,
          content_type: "text/plain",
          // "generation" mode is the right bias for the Script
          // Generator panel — the user is here because they want to
          // build something.
          mode: "generation",
          // Surface identifier — backend uses this to (a) append the
          // script-editor system-prompt addendum and (b) FILTER the
          // tool schemas to script-only tools. The LLM can't even
          // see `create_workflow` from this panel.
          panel: "script_editor",
        },
        (event: AutobotStreamEvent) => {
          switch (event.type) {
            case "stream_start":
              break;
            case "token":
              setPendingAssistant((prev) =>
                prev
                  ? { ...prev, content: prev.content + event.content }
                  : { content: event.content, toolCalls: [] },
              );
              break;
            case "tool_call_start":
              setPendingAssistant((prev) => {
                const base = prev ?? { content: "", toolCalls: [] };
                const without = base.toolCalls.filter(
                  (tc) => tc.id !== event.id,
                );
                return {
                  ...base,
                  toolCalls: [
                    ...without,
                    {
                      id: event.id,
                      name: event.name,
                      argumentsJson: event.arguments,
                      status: "running",
                    },
                  ],
                };
              });
              break;
            case "tool_result": {
              const hasError =
                event.result != null &&
                typeof event.result === "object" &&
                "error" in event.result;
              setPendingAssistant((prev) => {
                const base = prev ?? { content: "", toolCalls: [] };
                return {
                  ...base,
                  toolCalls: base.toolCalls.map((tc) =>
                    tc.id === event.id
                      ? {
                          ...tc,
                          status: hasError ? "error" : "done",
                          result: event.result,
                        }
                      : tc,
                  ),
                };
              });
              // Capture successful create/update results for post-stream
              // dispatch to the parent. We don't fire callbacks inline
              // because they may trigger navigation, which would unmount
              // this component mid-stream.
              if (!hasError) {
                const sid = extractScriptId(event.result);
                if (sid && event.name === "create_script") {
                  createdScripts.push({
                    id: sid,
                    name: extractScriptName(event.result),
                  });
                } else if (sid && event.name === "update_script") {
                  updatedScriptIds.push(sid);
                }
              }
              break;
            }
            case "done": {
              // Replace the streaming draft with a finalized assistant
              // message. The server-side persisted Message is in
              // `event.message` but we only need the rendered content
              // + tool_calls — copy those fields into our local shape.
              const final = event.message as AutobotMessage;
              setMessages((prev) => [
                ...prev,
                {
                  id: final.id,
                  role: "assistant",
                  content: final.content,
                  toolCalls: final.tool_calls ?? [],
                },
              ]);
              setPendingAssistant(null);
              break;
            }
            case "error":
              // Tear down the streaming bubble immediately — leaving
              // `pendingAssistant` populated would keep "Thinking…" or
              // the half-streamed cursor on screen even though the
              // error banner says the turn is over.
              setPendingAssistant(null);
              setStreamError(event.message);
              toast.error(event.message);
              break;
          }
        },
        { signal: controller.signal },
      );

      // Post-stream side effects. Run after the stream closes so the
      // parent's navigation / refetch doesn't race with the SSE reducer.
      for (const created of createdScripts) {
        onScriptCreated(created.id, created.name);
      }
      for (const sid of updatedScriptIds) {
        onScriptUpdated(sid);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Send failed.";
      setStreamError(msg);
      toast.error(msg);
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [
    prompt,
    isStreaming,
    threadId,
    language,
    openScript,
    getToken,
    onScriptCreated,
    onScriptUpdated,
    selectedConfigId,
  ]);

  // ── Model change ──────────────────────────────────────────────────
  // Two paths:
  //   • Thread already exists  → PATCH it so the next turn uses the
  //                              new provider/model. Roll back local
  //                              state on failure.
  //   • No thread yet          → just stash the choice; createThread
  //                              on the next send carries it.
  const handleModelChange = useCallback(
    async (newId: string | null) => {
      const previous = selectedConfigId;
      if (previous === newId) return;
      setSelectedConfigId(newId);
      if (!threadId) return;
      setModelSwitching(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not signed in.");
        const updated = await patchThread(token, threadId, {
          llm_config: newId,
        });
        // Re-sync from server truth so a stale config FK (e.g. just
        // deleted from CustomizeModal) doesn't keep the picker pointing
        // at a phantom row.
        setSelectedConfigId(updated.llm_config);
      } catch (err) {
        setSelectedConfigId(previous);
        const msg =
          err instanceof Error ? err.message : "Failed to switch model.";
        toast.error(msg);
      } finally {
        setModelSwitching(false);
      }
    },
    [threadId, selectedConfigId, getToken],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const isEmpty = messages.length === 0 && !pendingAssistant && !streamError;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <AutobotIcon />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Autobot
          </span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClear}
              disabled={isStreaming}
              className="h-7 w-7 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              title="Clear chat"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Context strip — shows what will be sent with the prompt. */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/30">
        <div className="flex items-center gap-2 text-[11px]">
          <Sparkles className="h-3 w-3 text-purple-500 shrink-0" />
          {openScript ? (
            <span className="text-gray-600 dark:text-gray-400 truncate">
              Editing{" "}
              <span className="font-mono font-medium text-gray-900 dark:text-gray-200">
                {openScript.name}
              </span>
            </span>
          ) : (
            <span className="text-gray-500 dark:text-gray-500 italic">
              No script open — ask me to create one
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesRef}
        className="flex-1 overflow-y-auto thin-scrollbar px-3 py-3 space-y-3"
      >
        {isEmpty && (
          <div className="text-center py-8 text-xs text-gray-500 dark:text-gray-400 px-4 leading-relaxed">
            <Wand2 className="h-5 w-5 mx-auto mb-2 text-purple-400" />
            Describe the script you want — I'll create or update it for you.
            Pick the language below before sending.
          </div>
        )}

        {messages.map((msg) =>
          msg.role === "user" ? (
            <UserBubble key={msg.id} content={msg.content} />
          ) : (
            <AssistantBubble
              key={msg.id}
              content={msg.content}
              toolCalls={msg.toolCalls.map(toBadgeFromHistorical)}
            />
          ),
        )}

        {pendingAssistant && (
          <AssistantBubble
            content={pendingAssistant.content}
            toolCalls={pendingAssistant.toolCalls}
            streaming
          />
        )}

        {streamError && !isStreaming && (
          <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300">
            {streamError}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Select
            value={language}
            onValueChange={(v) => setLanguage(v as ScriptLanguage)}
            disabled={isStreaming}
          >
            <SelectTrigger className="h-7 text-xs flex-1 max-w-[160px] bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value} className="text-xs">
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex justify-end">
            <ModelPicker
              selectedConfigId={selectedConfigId}
              configs={configs}
              userDefaultId={userDefaultId}
              disabled={isStreaming || modelSwitching}
              onChange={(id) => void handleModelChange(id)}
            />
          </div>
        </div>

        <div className="flex items-end gap-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={
              openScript
                ? "Describe how to update this script…"
                : "Describe a script to create…"
            }
            maxLength={2000}
            className="resize-none min-h-[80px] max-h-[160px] text-sm bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
          />
          <Button
            onClick={() => void handleSend()}
            disabled={isStreaming || !prompt.trim()}
            className="bg-purple-600 hover:bg-purple-700 text-white h-9 px-3 shrink-0 disabled:opacity-40"
            title="Send"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <span className="text-[10px] text-gray-500 dark:text-gray-500 ml-auto">
          Enter to send · Shift+Enter for newline
        </span>
      </div>
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────

const toBadgeFromHistorical = (tc: AutobotToolCall): PendingToolCall => ({
  id: tc.id,
  name: tc.function.name,
  argumentsJson: tc.function.arguments,
  status: "done",
  result: undefined,
});

const UserBubble = ({ content }: { content: string }) => (
  <div className="flex justify-end">
    <div className="bg-purple-100 dark:bg-purple-900/30 text-gray-900 dark:text-gray-100 px-3 py-2 rounded-2xl rounded-tr-sm max-w-[85%] text-xs leading-relaxed whitespace-pre-wrap break-words shadow-sm">
      {content}
    </div>
  </div>
);

interface AssistantBubbleProps {
  content: string;
  toolCalls: PendingToolCall[];
  streaming?: boolean;
}

const AssistantBubble = ({
  content,
  toolCalls,
  streaming = false,
}: AssistantBubbleProps) => (
  <div className="w-full">
    {toolCalls.length > 0 && (
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {toolCalls.map((tc) => (
          <ToolCallBadge
            key={tc.id}
            name={tc.name}
            status={tc.status}
            argumentsJson={tc.argumentsJson}
            result={tc.result}
          />
        ))}
      </div>
    )}
    {content && !streaming && (
      // Final assistant turn renders through ReactMarkdown so fenced
      // code blocks get syntax highlighting via CodeBlock. The wrapper
      // suppresses prose's default <pre> styling — CodeBlock owns the
      // surface.
      <div className="text-xs text-gray-900 dark:text-gray-200 prose prose-xs prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0 prose-pre:border-0 max-w-none leading-relaxed">
        <ReactMarkdown
          components={{
            code(props: React.ComponentPropsWithoutRef<"code">) {
              const { children, className, ...rest } = props;
              const match = /language-(\w+)/.exec(className || "");
              const language = match ? match[1] : "";
              const isInline = !match;
              return isInline ? (
                <code
                  className="px-1 py-0.5 text-purple-700 dark:text-purple-300/80 bg-gray-200/60 dark:bg-gray-700/60 rounded text-[11px] font-mono"
                  {...rest}
                >
                  {children}
                </code>
              ) : (
                <CodeBlock
                  code={String(children).replace(/\n$/, "")}
                  language={language}
                />
              );
            },
            pre(props: React.ComponentPropsWithoutRef<"pre">) {
              return <>{props.children}</>;
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    )}
    {streaming && (
      <p className="text-xs text-gray-900 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
        {content || (
          <span className="italic text-gray-500 dark:text-gray-400">
            Thinking…
          </span>
        )}
        {content && (
          <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-gray-700 dark:bg-gray-300 align-middle" />
        )}
      </p>
    )}
  </div>
);

export default AIScriptGenerator;
