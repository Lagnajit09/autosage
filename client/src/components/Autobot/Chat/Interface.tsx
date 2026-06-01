/**
 * Autobot chat interface.
 *
 * Routes:
 *   • /ai/autobot      → welcome state; first message creates a thread.
 *   • /ai/autobot/:id  → load history, stream new turns.
 *
 * Live assistant tokens render as plain text (markdown parse on every
 * delta would be expensive and visually jumpy). On `done` we replace
 * the draft with the authoritative persisted Message and render through
 * ReactMarkdown like the rest of history.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { toast } from "sonner";

import ChatInput from "./ChatInput";
import { CodeBlock } from "./CodeBlock";
import CustomizeModal from "./CustomizeModal";
import { THREADS_CHANGED_EVENT } from "./History";
import { type ChatMode } from "./InputTypeGroup";
import ModelPicker from "./ModelPicker";
import ShareModal from "./ShareModal";
import ToolCallBadge, { type ToolCallStatus } from "./ToolCallBadge";
import { AutobotIcon } from "../../AutobotIcon";
import { Vault } from "../../vault/Vault";
import { NavItems } from "../../LeftNav";
import { SidebarTrigger } from "../../ui/sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart3,
  DatabaseZap,
  Menu,
  Settings2,
  ShareIcon,
} from "lucide-react";

import {
  createThread,
  getSettings,
  getThread,
  listLLMConfigs,
  listMessages,
  patchThread,
  type AutobotMessage,
  type AutobotThread,
  type AutobotToolCall,
  type LLMConfig,
} from "@/lib/api/autobot";
import {
  streamMessage,
  type AutobotStreamEvent,
} from "@/lib/api/autobot-stream";

const welcomeMessages = [
  "Hello! How can I help you today?",
  "What would you like to work on?",
  "Ready to automate something?",
  "What's on your mind?",
  "How can I assist you today?",
  "What can I help you build?",
  "Ready to create something amazing?",
  "What's your next project?",
  "How can I make your work easier?",
  "What would you like to explore?",
];

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

interface PendingUserMessage {
  content: string;
  clientId: string;
}

// Falls back to a random string when `crypto.randomUUID` is unavailable.
const newClientId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
};

// Non-dismissible — dismissing without unarchiving would leave the
// user staring at a disabled input with no explanation.
const ArchivedBanner = ({
  onUnarchive,
  busy,
}: {
  onUnarchive: () => void;
  busy: boolean;
}) => (
  <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
    <span>This chat is archived. Unarchive to send new messages.</span>
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={onUnarchive}
      className="bg-transparent border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
    >
      {busy ? "Unarchiving…" : "Unarchive"}
    </Button>
  </div>
);

const Interface = () => {
  const { id: threadId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { user } = useUser();

  // Static welcome message — picked once per mount so it doesn't flicker
  // on every re-render. `useMemo` with [] is the canonical "compute once"
  // pattern for derived values that don't depend on inputs.
  const welcomeText = useMemo(
    () => welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)],
    [],
  );

  const userInitial = (
    user?.firstName?.[0] ||
    user?.username?.[0] ||
    "U"
  ).toUpperCase();

  // ── State ──────────────────────────────────────────────────────────
  const [thread, setThread] = useState<AutobotThread | null>(null);
  const [messages, setMessages] = useState<AutobotMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pendingUser, setPendingUser] = useState<PendingUserMessage | null>(
    null,
  );
  const [pendingAssistant, setPendingAssistant] =
    useState<PendingAssistant | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // ── BYO LLM state ──────────────────────────────────────────────────
  // `configs` is the full user-owned LLMConfig list. `userDefaultId` is
  // the user's global default (UserSettings.default_llm_config) used to
  // annotate the picker's "Default" option. `selectedConfigId` is the
  // ACTIVE per-thread choice — null = "use default fall-through."
  //
  // For an existing thread, `selectedConfigId` mirrors thread.llm_config
  // and is updated optimistically when the picker fires; the PATCH
  // happens in the background. On welcome-screen, the value is held
  // locally and passed to `createThread({ llm_config })` on first send.
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [userDefaultId, setUserDefaultId] = useState<string | null>(null);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [modelSwitching, setModelSwitching] = useState(false);

  // ── Mode state (Research / Generation / Execution) ─────────────────
  // Mode is per-turn client state — not persisted on Thread.
  const [mode, setMode] = useState<ChatMode>("research");

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [customizeModalOpen, setCustomizeModalOpen] = useState(false);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshConfigs = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const [configList, settings] = await Promise.all([
        listLLMConfigs(token),
        getSettings(token),
      ]);
      setConfigs(configList);
      setUserDefaultId(settings.default_llm_config);
    } catch (err) {
      // Non-fatal — picker falls back to "Default (admin keys)".
      // Console-only so we don't toast on every mount during outages.
      console.warn("Failed to load LLM configs:", err);
    }
  }, [getToken]);

  useEffect(() => {
    void refreshConfigs();
  }, [refreshConfigs]);

  useEffect(() => {
    if (!threadId) {
      // Welcome state — reset picker so users don't inherit the last
      // visited thread's config.
      setThread(null);
      setMessages([]);
      setPendingUser(null);
      setPendingAssistant(null);
      setStreamError(null);
      setSelectedConfigId(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      setStreamError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not signed in.");
        const [threadData, historyPage] = await Promise.all([
          getThread(token, threadId),
          listMessages(token, threadId, 1, 50),
        ]);
        if (cancelled) return;
        setThread(threadData);
        setSelectedConfigId(threadData.llm_config);
        setMessages(historyPage.messages);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load thread.";
        setStreamError(msg);
        toast.error(msg);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threadId, getToken]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    // Defer to next paint so newly-appended DOM is measured.
    const timeoutId = setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [messages.length, pendingUser, pendingAssistant]);

  // Opens an SSE stream and reduces every event into local state.
  // Caller is responsible for the surrounding `isStreaming` flag.
  const runStream = useCallback(
    async (
      targetThreadId: string,
      content: string,
      clientId: string,
      activeMode: ChatMode,
    ): Promise<void> => {
      const controller = new AbortController();
      abortRef.current = controller;

      const token = await getToken();
      if (!token) {
        setStreamError("Not signed in.");
        return;
      }

      setPendingAssistant({ content: "", toolCalls: [] });

      await streamMessage(
        token,
        targetThreadId,
        {
          content,
          client_id: clientId,
          content_type: "text/plain",
          mode: activeMode,
        },
        (event: AutobotStreamEvent) => {
          switch (event.type) {
            case "stream_start": {
              // User message is persisted on Django. Keep the optimistic
              // bubble visible until `done` lands — clearing now would
              // make it flicker out and back in.
              break;
            }
            case "token": {
              setPendingAssistant((prev) =>
                prev
                  ? { ...prev, content: prev.content + event.content }
                  : { content: event.content, toolCalls: [] },
              );
              break;
            }
            case "tool_call_start": {
              setPendingAssistant((prev) => {
                const base = prev ?? { content: "", toolCalls: [] };
                // Replace any same-id entry (re-emit safety).
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
            }
            case "tool_result": {
              setPendingAssistant((prev) => {
                const base = prev ?? { content: "", toolCalls: [] };
                const hasError =
                  event.result != null &&
                  typeof event.result === "object" &&
                  "error" in event.result;
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
              break;
            }
            case "done": {
              // Build an optimistic user message so clearing
              // `pendingUser` below doesn't make the bubble disappear.
              // The canonical row was persisted by Django; a future
              // refresh swaps it in transparently.
              const optimisticUser: AutobotMessage = {
                id: `optimistic-user-${clientId}`,
                role: "user",
                content,
                content_type: "text/plain",
                provider: "",
                model_name: "",
                prompt_tokens: null,
                completion_tokens: null,
                total_tokens: null,
                tool_calls: [],
                tool_call_id: "",
                client_id: clientId,
                created_at: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, optimisticUser, event.message]);
              setPendingAssistant(null);
              setPendingUser(null);
              break;
            }
            case "error": {
              // Clear the assistant bubble so "Thinking…" doesn't sit
              // next to the error banner. `pendingUser` stays so the
              // user can retry without re-typing.
              setPendingAssistant(null);
              setStreamError(event.message);
              toast.error(event.message);
              break;
            }
          }
        },
        { signal: controller.signal },
      );
    },
    [getToken],
  );

  const handleSend = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isStreaming) return;
      // Hard-block sends on archived threads — UI disables the input
      // but a race could still reach this handler.
      if (thread?.is_archived) {
        toast.error("This chat is archived. Unarchive to send messages.");
        return;
      }

      setStreamError(null);

      const clientId = newClientId();
      setPendingUser({ content: trimmed, clientId });
      setIsStreaming(true);

      try {
        let activeThreadId = threadId;

        if (!activeThreadId) {
          const token = await getToken();
          if (!token) throw new Error("Not signed in.");
          const title =
            trimmed.length > 30 ? `${trimmed.slice(0, 30)}…` : trimmed;
          const created = await createThread(token, {
            title,
            llm_config: selectedConfigId,
          });
          activeThreadId = created.id;
          setThread(created);
          // replace: true so back-button doesn't return to the blank state.
          navigate(`/ai/autobot/${activeThreadId}`, { replace: true });
          window.dispatchEvent(new CustomEvent(THREADS_CHANGED_EVENT));
        }

        await runStream(activeThreadId, trimmed, clientId, mode);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to send.";
        setStreamError(msg);
        toast.error(msg);
        // Keep the pending user bubble visible so the user can retry.
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [
      threadId,
      isStreaming,
      navigate,
      getToken,
      runStream,
      selectedConfigId,
      mode,
      thread?.is_archived,
    ],
  );

  const [unarchiving, setUnarchiving] = useState(false);
  const unarchiveCurrentThread = useCallback(async () => {
    if (!thread || unarchiving) return;
    setUnarchiving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in.");
      const updated = await patchThread(token, thread.id, {
        is_archived: false,
      });
      setThread(updated);
      window.dispatchEvent(new CustomEvent(THREADS_CHANGED_EVENT));
      toast.success("Chat unarchived.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unarchive failed.";
      toast.error(msg);
    } finally {
      setUnarchiving(false);
    }
  }, [thread, unarchiving, getToken]);

  // Adapter for ChatInput's (e, value, category) signature.
  const onChatInputSubmit = useCallback(
    (_e: React.FormEvent, value: string) => {
      void handleSend(value);
    },
    [handleSend],
  );

  // Existing thread → optimistic update + background PATCH, roll back on failure.
  // Welcome screen → stash; createThread on next send persists it.
  const handleModelChange = useCallback(
    async (newId: string | null) => {
      const previous = selectedConfigId;
      if (previous === newId) return;
      // Optimistic local update so the picker label flips immediately.
      setSelectedConfigId(newId);

      if (!threadId) return; // welcome-screen path — nothing to persist yet.

      setModelSwitching(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not signed in.");
        const updated = await patchThread(token, threadId, {
          llm_config: newId,
        });
        setThread(updated);
        // Re-sync from server truth in case the backend rejected the FK
        // (e.g. config was deleted between picker mount and PATCH).
        setSelectedConfigId(updated.llm_config);
      } catch (err) {
        // Roll back the optimistic flip and surface the error.
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

  // ── Render helpers ─────────────────────────────────────────────────
  const renderMarkdown = (content: string) => (
    <ReactMarkdown
      components={{
        code(props: React.ComponentPropsWithoutRef<"code">) {
          const { children, className, ...rest } = props;
          const match = /language-(\w+)/.exec(className || "");
          const language = match ? match[1] : "";
          const isInline = !match;
          return isInline ? (
            <code
              className="px-1.5 py-0.5 text-purple-700 dark:text-purple-300/80 bg-gray-300/50 dark:bg-gray-500/30 rounded text-sm font-mono border border-gray-400/50 dark:border-gray-500/40"
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
        strong(props: React.ComponentPropsWithoutRef<"strong">) {
          return (
            <strong
              className="font-bold text-gray-900 dark:text-gray-100"
              {...props}
            >
              {props.children}
            </strong>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );

  const visibleMessages = messages.filter(
    (m) => m.role === "user" || m.role === "assistant",
  );

  // Has-content check for the welcome screen flip.
  const hasAnyContent =
    visibleMessages.length > 0 ||
    pendingUser !== null ||
    pendingAssistant !== null ||
    historyLoading;

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden">
      {/* Mobile Header */}
      <div className="flex lg:hidden items-center justify-between w-full px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900 z-50">
        <Sheet>
          <SheetTrigger asChild>
            <button className="p-2 -ml-2 rounded-md">
              <Menu className="w-5 h-5 dark:text-gray-100" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[80%] max-w-[300px] p-0 dark:bg-gray-900"
          >
            <div className="h-full flex flex-col p-4">
              <div className="flex items-center gap-2 mb-6 px-2">
                <img
                  src="/icon.png"
                  alt="AutoSage Icon"
                  className="w-8 h-8 object-contain rounded-full shadow-sm"
                />
                <span className="font-bold text-lg dark:text-gray-100 tracking-tight">
                  AutoSage
                </span>
              </div>
              <NavItems mobile />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2">
          <img
            src="/icon.png"
            alt="AutoSage Icon"
            className="w-6 h-6 object-contain rounded-full shadow-sm"
          />
          <span className="font-semibold dark:text-gray-100 tracking-tight">
            AutoSage
          </span>
        </div>

        <SidebarTrigger className="lg:hidden" />
      </div>
      <div className="hidden lg:flex items-center justify-between absolute top-0 left-0 right-0 px-6 py-3 z-30 backdrop-blur-md bg-transparent border-b border-gray-200/30 dark:border-gray-800/30 shadow-sm">
        <div className="flex items-center gap-2">
          <AutobotIcon size={24} />
          <span className="font-semibold text-gray-900 dark:text-gray-100 tracking-tight text-lg">
            Autobot
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => navigate("/ai/autobot/dashboard")}
                className="flex items-center gap-2 cursor-pointer bg-transparent hover:bg-gray-100/70 dark:hover:bg-gray-800/70 py-2 px-3 rounded-full transition-colors"
              >
                <BarChart3 className="w-4 h-4 text-gray-800 dark:text-gray-200" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Dashboard</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setVaultModalOpen(true)}
                className="flex items-center gap-2 cursor-pointer bg-transparent hover:bg-gray-100/70 dark:hover:bg-gray-800/70 py-2 px-3 rounded-full transition-colors"
              >
                <DatabaseZap className="w-4 h-4 text-gray-800 dark:text-gray-200" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Vault</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setCustomizeModalOpen(true)}
                className="flex items-center gap-2 cursor-pointer bg-transparent hover:bg-gray-100/70 dark:hover:bg-gray-800/70 py-2 px-3 rounded-full transition-colors"
              >
                <Settings2 className="w-4 h-4 text-gray-800 dark:text-gray-200" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Customize</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setShareModalOpen(true)}
                className="flex items-center gap-2 cursor-pointer bg-transparent hover:bg-gray-100/70 dark:hover:bg-gray-800/70 py-2 px-3 rounded-full transition-colors"
              >
                <ShareIcon className="w-4 h-4 text-gray-800 dark:text-gray-200" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Share</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <ShareModal open={shareModalOpen} onOpenChange={setShareModalOpen} />
      <CustomizeModal
        open={customizeModalOpen}
        onOpenChange={setCustomizeModalOpen}
        onConfigsChanged={() => void refreshConfigs()}
      />
      <Vault isOpen={vaultModalOpen} setIsOpen={setVaultModalOpen} />

      {!hasAnyContent ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 lg:pt-16">
          <div className="text-center mb-8 max-w-lg mx-auto">
            <p className="text-2xl font-medium text-gray-600 dark:text-gray-400">
              {welcomeText}
            </p>
            {thread?.title && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                {thread.title}
              </p>
            )}
          </div>
          <div className="w-full max-w-2xl flex flex-col gap-2">
            <div className="flex justify-end px-2">
              <ModelPicker
                selectedConfigId={selectedConfigId}
                configs={configs}
                userDefaultId={userDefaultId}
                disabled={isStreaming || modelSwitching}
                onChange={(id) => void handleModelChange(id)}
              />
            </div>
            {thread?.is_archived && (
              <ArchivedBanner
                onUnarchive={() => void unarchiveCurrentThread()}
                busy={unarchiving}
              />
            )}
            <ChatInput
              handleSubmit={onChatInputSubmit}
              disabled={isStreaming || !!thread?.is_archived}
              mode={mode}
              onModeChange={setMode}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Scrollable Messages Area */}
          <div
            ref={messagesContainerRef}
            className="flex-1 w-full overflow-y-auto scroll-smooth"
          >
            <div className="w-full max-w-3xl xl:max-w-[70%] mx-auto flex flex-col gap-6 px-4 py-6 pb-4 lg:pt-20">
              {historyLoading && visibleMessages.length === 0 && (
                <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                  Loading conversation…
                </p>
              )}

              {visibleMessages.map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  userInitial={userInitial}
                  renderMarkdown={renderMarkdown}
                />
              ))}

              {/* Optimistic user bubble (until `done` clears it). */}
              {pendingUser && (
                <UserBubble
                  content={pendingUser.content}
                  userInitial={userInitial}
                />
              )}

              {/* Live assistant draft. */}
              {pendingAssistant && (
                <AssistantBubble
                  toolCalls={pendingAssistant.toolCalls}
                  // While streaming, render plain text — markdown parse
                  // on every token is wasteful and visually jumpy.
                  body={
                    pendingAssistant.content ? (
                      <p className="whitespace-pre-wrap leading-relaxed text-sm text-gray-900 dark:text-gray-200">
                        {pendingAssistant.content}
                        <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-gray-700 dark:bg-gray-300 align-middle" />
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                        Thinking…
                      </p>
                    )
                  }
                />
              )}

              {streamError && !isStreaming && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
                  {streamError}
                </div>
              )}
            </div>
          </div>

          {/* Fixed Input Area */}
          <div className="w-full shrink-0 z-20 pb-4 pt-2 px-4 bg-transparent">
            <div className="w-full max-w-3xl xl:max-w-[75%] mx-auto flex flex-col gap-2">
              <div className="flex justify-end px-2">
                <ModelPicker
                  selectedConfigId={selectedConfigId}
                  configs={configs}
                  userDefaultId={userDefaultId}
                  disabled={isStreaming || modelSwitching}
                  onChange={(id) => void handleModelChange(id)}
                />
              </div>
              {thread?.is_archived && (
                <ArchivedBanner
                  onUnarchive={() => void unarchiveCurrentThread()}
                  busy={unarchiving}
                />
              )}
              <ChatInput
                handleSubmit={onChatInputSubmit}
                disabled={isStreaming || !!thread?.is_archived}
                mode={mode}
                onModeChange={setMode}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ── Sub-components ───────────────────────────────────────────────────

interface MessageRowProps {
  message: AutobotMessage;
  userInitial: string;
  renderMarkdown: (content: string) => React.ReactNode;
}

const MessageRow = ({
  message,
  userInitial,
  renderMarkdown,
}: MessageRowProps) => {
  if (message.role === "user") {
    return <UserBubble content={message.content} userInitial={userInitial} />;
  }
  // Assistant — historical rows may carry tool_calls. For history we
  // render each tool_call as a `done` badge (we don't have the live
  // `tool_result` here — the matching role=tool message is filtered
  // out, but its content lives in Postgres if a future "expand history"
  // feature wants it).
  return (
    <AssistantBubble
      toolCalls={historicalBadges(message.tool_calls)}
      body={
        message.content ? (
          <div className="w-full text-gray-900 dark:text-gray-200 rounded-lg prose prose-sm prose-invert prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0 prose-pre:border-0 max-w-none">
            {renderMarkdown(message.content)}
          </div>
        ) : null
      }
    />
  );
};

const historicalBadges = (
  toolCalls: AutobotToolCall[] | undefined,
): PendingToolCall[] => {
  if (!toolCalls || toolCalls.length === 0) return [];
  return toolCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    argumentsJson: tc.function.arguments,
    status: "done" as const,
    // The matching tool result is a separate role=tool Message; we
    // surface this call as "done" without a body for now.
    result: undefined,
  }));
};

interface UserBubbleProps {
  content: string;
  userInitial: string;
}

const UserBubble = ({ content, userInitial }: UserBubbleProps) => (
  <div className="w-full">
    {/* Right-aligned: bubble first, avatar after — convention for
     * "this is what YOU said." The tail-sharp corner lives on the
     * top-right (rounded-tr-sm) so the bubble visually "points" at
     * the avatar that sits to its right. */}
    <div className="w-full flex items-start gap-3 justify-end">
      <div className="bg-purple-100 dark:bg-purple-900/30 text-gray-900 dark:text-gray-100 px-5 py-3.5 rounded-2xl rounded-tr-sm max-w-[85%] text-sm leading-relaxed shadow-sm font-medium whitespace-pre-wrap break-words">
        {content}
      </div>
      <div className="p-2 w-10 h-10 bg-purple-300/50 dark:bg-purple-500/30 text-gray-950 dark:text-gray-50 rounded-full flex items-center justify-center font-semibold shrink-0">
        {userInitial}
      </div>
    </div>
  </div>
);

interface AssistantBubbleProps {
  toolCalls: PendingToolCall[];
  body: React.ReactNode;
}

const AssistantBubble = ({ toolCalls, body }: AssistantBubbleProps) => (
  <div className="w-full">
    {toolCalls.length > 0 && (
      <div className="mb-2 flex flex-wrap gap-2">
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
    {body}
  </div>
);

export default Interface;
