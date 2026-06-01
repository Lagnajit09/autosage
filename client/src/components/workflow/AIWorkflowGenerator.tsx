/**
 * AI Workflow Generator (T22, part 2).
 *
 * Mirrors the inline Script Generator (`@/components/AIScriptGenerator`)
 * but scoped to workflow operations. Lives in the WorkflowBuilder's
 * right sidebar — NO modal, NO redirect to /ai/autobot.
 *
 * Why the same UX as the Script Generator:
 *   • The user is mid-canvas. Sending them to /ai/autobot pulls them
 *     out of the builder. They want "rebuild this with a decision
 *     branch" right next to the graph they're editing.
 *   • Tool callbacks (`create_workflow`, `update_workflow`) wire
 *     DIRECTLY back into WorkflowBuilder — the canvas re-hydrates
 *     from the server result without manual reload / re-import.
 *
 * Thread lifecycle:
 *   - Created lazily on first prompt, archived from the start so it
 *     never appears in the main /ai/autobot history sidebar.
 *   - Component stays mounted across panel close/open (the sidebar
 *     wrapper uses `hidden` instead of unmounting) so the same thread
 *     persists across toggles — open the panel 10 times, still 1
 *     thread, not 10.
 *
 * Per-turn payload shape (LLM-only context — the chat UI shows the
 * user's typed text alone):
 *
 *     <context>
 *     open_workflow_id: 4a7e-...   (only when the canvas is on a
 *     open_workflow_name: <name>    saved workflow)
 *     </context>
 *
 *     <user's actual prompt>
 */

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Send, Sparkles, Wand2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CodeBlock } from "@/components/Autobot/Chat/CodeBlock";
import ToolCallBadge, {
  type ToolCallStatus,
} from "@/components/Autobot/Chat/ToolCallBadge";
import ModelPicker from "@/components/Autobot/Chat/ModelPicker";
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
import { AutobotIcon } from "../AutobotIcon";

// ── Props ──────────────────────────────────────────────────────────

interface OpenWorkflow {
  /** Django Workflow UUID — present when the user is editing an
   * already-saved workflow. Absent when the canvas is on `/workflow/new`. */
  id: string;
  name: string;
}

interface AIWorkflowGeneratorProps {
  /** Workflow currently loaded on the WorkflowBuilder canvas. Null when
   * no saved workflow exists yet (e.g. /workflow/new). Used to inject
   * context so the LLM defaults to UPDATING the open workflow instead
   * of creating a new one. */
  openWorkflow?: OpenWorkflow | null;
  /** Fired with the new Workflow.id after a successful
   * `create_workflow` tool call. Parent should navigate to
   * `/workflow/<id>` (which reloads the canvas from the persisted
   * version). */
  onWorkflowCreated: (workflowId: string, workflowName: string) => void;
  /** Fired with the Workflow.id after a successful `update_workflow`.
   * If it matches the current canvas workflow, parent should refetch
   * + re-hydrate the canvas with the new nodes/edges. */
  onWorkflowUpdated: (workflowId: string) => void;
  /** Close the panel via the X button. */
  onClose?: () => void;
}

// System prompt for this panel lives in autobot/llm/prompts.py
// (_WORKFLOW_BUILDER_PANEL_PROMPT). The frontend just sends `panel:
// "workflow_builder"` on each turn; the backend composes the prompt
// AND filters the advertised tool schemas to a workflow-scoped subset
// — `create_script` / `update_script` aren't in the tool list this
// panel sees, so the LLM literally can't call them no matter what
// the user asks. That's the real fix for "tried to create a workflow,
// got two extra scripts."

// ── Local state shapes ─────────────────────────────────────────────

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
  openWorkflow: OpenWorkflow | null | undefined,
): string => {
  if (!openWorkflow) {
    // No workflow yet — the LLM should infer "create" intent from the
    // user prompt. An empty <context> is still useful as a marker that
    // the message came from this panel (helps debugging).
    return `<context>\nmode: new\n</context>`;
  }
  return `<context>\nopen_workflow_id: ${openWorkflow.id}\nopen_workflow_name: ${openWorkflow.name}\n</context>`;
};

// Extract the Django Workflow UUID from a tool result. The autobot
// tool dispatcher returns the unwrapped Django `data` dict on success
// (`(body or {}).get("data") or {}`), or `{ error: "..." }` on failure.
const extractWorkflowId = (
  result: Record<string, unknown> | undefined,
): string | null => {
  if (!result || typeof result !== "object") return null;
  if ("error" in result) return null;
  const id = (result as { id?: unknown }).id;
  if (typeof id === "string" && id) return id;
  if (typeof id === "number") return String(id);
  return null;
};

const extractWorkflowName = (
  result: Record<string, unknown> | undefined,
): string => {
  if (!result || typeof result !== "object") return "";
  const name = (result as { name?: unknown }).name;
  return typeof name === "string" ? name : "";
};

// ── Component ──────────────────────────────────────────────────────

const AIWorkflowGenerator: React.FC<AIWorkflowGeneratorProps> = ({
  openWorkflow,
  onWorkflowCreated,
  onWorkflowUpdated,
  onClose,
}) => {
  const { getToken } = useAuth();

  // Chat state.
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingAssistant, setPendingAssistant] =
    useState<PendingAssistant | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  // BYO LLM state — same shape as the main chat + Script Generator.
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [userDefaultId, setUserDefaultId] = useState<string | null>(null);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [modelSwitching, setModelSwitching] = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load configs + user default on mount (once). Refresh-on-open is
  // unnecessary because this panel doesn't unmount.
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
        console.warn("Failed to load LLM configs for Workflow Generator:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  // Auto-scroll on any content change.
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, pendingAssistant]);

  // Abort in-flight stream on unmount (rare — the parent uses
  // `hidden` for toggles, not unmounting).
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
    setSelectedConfigId(null);
  }, []);

  // ── Send ───────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isStreaming) return;

    setStreamError(null);
    const clientId = newClientId();

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

      let activeThreadId = threadId;
      if (!activeThreadId) {
        const titleSeed =
          trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
        const created = await createThread(token, {
          title: `[Workflow Builder] ${titleSeed}`,
          is_archived: true,
          llm_config: selectedConfigId,
          // No `system_prompt_override` — the per-panel prompt now
          // lives in autobot/llm/prompts.py and is composed per-turn
          // via the `panel` field on streamMessage below.
        });
        activeThreadId = created.id;
        setThreadId(activeThreadId);
      }

      const contextBlock = buildContextBlock(openWorkflow);
      const networkContent = `${contextBlock}\n\n${trimmed}`;

      const controller = new AbortController();
      abortRef.current = controller;

      // Capture successful tool results during the turn; dispatch to
      // the parent AFTER the stream closes so the canvas re-hydration
      // doesn't race the SSE reducer.
      const createdWorkflows: { id: string; name: string }[] = [];
      const updatedWorkflowIds: string[] = [];

      await streamMessage(
        token,
        activeThreadId,
        {
          content: networkContent,
          client_id: clientId,
          content_type: "text/plain",
          mode: "generation",
          // Surface identifier — backend uses this to (a) append the
          // workflow-builder system-prompt addendum and (b) FILTER the
          // tool schemas to workflow-scoped tools. `create_script` /
          // `update_script` are NOT in the panel's allow-list, so the
          // LLM literally can't call them from here even if the user
          // implicitly asks for new scripts as part of the workflow.
          panel: "workflow_builder",
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
              if (!hasError) {
                const wid = extractWorkflowId(event.result);
                if (wid && event.name === "create_workflow") {
                  createdWorkflows.push({
                    id: wid,
                    name: extractWorkflowName(event.result),
                  });
                } else if (wid && event.name === "update_workflow") {
                  updatedWorkflowIds.push(wid);
                }
              }
              break;
            }
            case "done": {
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
              // Same fix as Script Generator + main chat: drop the
              // pending streaming bubble so "Thinking…" or the cursor
              // doesn't linger next to the error toast/banner.
              setPendingAssistant(null);
              setStreamError(event.message);
              toast.error(event.message);
              break;
          }
        },
        { signal: controller.signal },
      );

      for (const created of createdWorkflows) {
        onWorkflowCreated(created.id, created.name);
      }
      for (const wid of updatedWorkflowIds) {
        onWorkflowUpdated(wid);
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
    openWorkflow,
    getToken,
    onWorkflowCreated,
    onWorkflowUpdated,
    selectedConfigId,
  ]);

  // ── Model change ───────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
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

      {/* Context strip */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/30">
        <div className="flex items-center gap-2 text-[11px]">
          <Sparkles className="h-3 w-3 text-purple-500 shrink-0" />
          {openWorkflow ? (
            <span className="text-gray-600 dark:text-gray-400 truncate">
              Editing{" "}
              <span className="font-mono font-medium text-gray-900 dark:text-gray-200">
                {openWorkflow.name || "untitled"}
              </span>
            </span>
          ) : (
            <span className="text-gray-500 dark:text-gray-500 italic">
              New canvas — ask me to build a workflow
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
            Describe the workflow you want — I'll wire up nodes, edges,
            triggers, and decisions. Mention specific scripts or servers from
            your library if you want them bound.
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
        <div className="flex justify-end">
          <ModelPicker
            selectedConfigId={selectedConfigId}
            configs={configs}
            userDefaultId={userDefaultId}
            disabled={isStreaming || modelSwitching}
            onChange={(id) => void handleModelChange(id)}
          />
        </div>

        <div className="flex items-end gap-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={
              openWorkflow
                ? "Describe how to change this workflow…"
                : "Describe a workflow to build…"
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
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 dark:text-gray-500">
            Enter to send · Shift+Enter for newline
          </span>
        </div>
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

export default AIWorkflowGenerator;
export { AIWorkflowGenerator };
