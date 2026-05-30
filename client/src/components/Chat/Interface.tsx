/**
 * Autobot chat interface (T20).
 *
 * Two routing modes:
 *   • `/ai/autobot`          → "welcome" state with no thread yet. The
 *     first submitted message creates a thread, then we navigate to
 *     `/ai/autobot/<id>` (replace, so back-button doesn't return to the
 *     blank state) and pick up streaming where the create left off.
 *   • `/ai/autobot/:id`      → load thread + history on mount, stream
 *     new turns into a live assistant draft.
 *
 * Streaming state shape:
 *   - `messages` is the persisted history (loaded from Django).
 *   - `pendingAssistant` holds the in-flight assistant turn — accumulated
 *     `token` deltas plus a running list of tool calls (id-keyed). When
 *     `done` fires we replace `pendingAssistant` with the persisted
 *     `AutobotMessage` from the payload (authoritative — its content may
 *     differ from the concatenated tokens if the provider trimmed).
 *   - `pendingUser` is the optimistically-rendered user turn shown while
 *     the first SSE frame is still in flight. Cleared once `stream_start`
 *     lands (by which point Django has persisted the user message and the
 *     follow-up history fetch — or the live stream — will re-emit it).
 *
 * Markdown rendering policy: live assistant text streams as plain text
 * (no markdown parse on every token — would be expensive and visually
 * jumpy as fence detection flickers). Once `done` fires we render the
 * authoritative content through ReactMarkdown like the rest of history.
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
import { AutobotIcon } from "../AutobotIcon";
import { Vault } from "../vault/Vault";
import { NavItems } from "../LeftNav";
import { SidebarTrigger } from "../ui/sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatabaseZap, Menu, Settings2, ShareIcon } from "lucide-react";

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

// `crypto.randomUUID` is available in all modern browsers + secure
// contexts (https + localhost). Fall back to a basic random string in
// the unlikely case it isn't available — the value only needs to be
// unique within a thread.
const newClientId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
};

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
  // Default to "research" — read-only is the safest assumption for a
  // fresh thread. Mode is held in client state (no server persistence)
  // because it's a per-turn UI hint that prepends an instruction to the
  // user message before sending. Persisting would mean PATCH-ing the
  // thread on every change, which is overkill.
  const [mode, setMode] = useState<ChatMode>("research");

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [customizeModalOpen, setCustomizeModalOpen] = useState(false);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Abort controller for the in-flight SSE stream. Keyed by component
  // instance so navigating away or unmounting cancels cleanly.
  const abortRef = useRef<AbortController | null>(null);

  // ── Load LLM configs + user settings once on mount ────────────────
  // These don't depend on threadId — the user's keys and global default
  // are stable across threads. CustomizeModal can refresh via the
  // `onConfigsChanged` callback when the user adds/edits/deletes.
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
      // Non-fatal — picker just shows "Default (admin keys)" with an
      // empty list. Surface to console for debugging but don't toast
      // (this fires on every mount and would spam errors if Django is
      // temporarily down).
      console.warn("Failed to load LLM configs:", err);
    }
  }, [getToken]);

  useEffect(() => {
    void refreshConfigs();
  }, [refreshConfigs]);

  // ── History load on thread change ──────────────────────────────────
  useEffect(() => {
    if (!threadId) {
      // Welcome state — clear any prior thread's data. The picker
      // selection ALSO resets so the user starts with "Default" on
      // every new chat (avoids surprise inheritance from the last
      // visited thread).
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
        // Fetch thread metadata + first page of history in parallel.
        const [threadData, historyPage] = await Promise.all([
          getThread(token, threadId),
          listMessages(token, threadId, 1, 50),
        ]);
        if (cancelled) return;
        setThread(threadData);
        // Picker mirrors the thread's stored override. `null` = no
        // thread-level override (falls through to user default / admin).
        setSelectedConfigId(threadData.llm_config);
        // Django returns ASC by default — keep as-is for chronological
        // render. We trust the backend's `?ordering=created_at` default.
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

  // ── Cancel any in-flight stream on unmount ─────────────────────────
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  // ── Auto-scroll on any content change ──────────────────────────────
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    // Defer to next paint so newly-appended DOM is measured before scroll.
    const timeoutId = setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [messages.length, pendingUser, pendingAssistant]);

  // ── Streaming helper ───────────────────────────────────────────────
  // Opens an SSE stream for `targetThreadId` and reduces every event
  // into the local state. Returns when the stream terminates (success
  // or error). Caller is responsible for setting `isStreaming` true
  // before calling and false after.
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

      // Reset the assistant draft to empty for this fresh turn. Tool
      // calls start empty and grow as the LLM emits them.
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
              // Stream is live — the user message has been persisted by
              // Django. Drop the optimistic bubble; the next history
              // refresh (or page reload) will re-render from server truth.
              // We DON'T clear it here because the live UI needs to keep
              // showing it until `done` lands; clearing now would make
              // the bubble flicker out and back in. Stored stream_id is
              // unused for now (T18 token-refresh wiring is for later).
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
                // Replace any existing entry with the same id (re-emit
                // safety) rather than appending a duplicate.
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
              // Authoritative finalization. Build an optimistic user
              // message from the local input (server has already
              // persisted the canonical version with the same content,
              // different id — a future refresh will swap it in
              // transparently). Without this, clearing `pendingUser`
              // below would erase the user's bubble from the visible
              // thread and they'd think their message vanished.
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
              setStreamError(event.message);
              toast.error(event.message);
              // Keep the pending bubbles visible so the user can see
              // what they sent + any partial reply for context.
              break;
            }
          }
        },
        { signal: controller.signal },
      );
    },
    [getToken],
  );

  // ── Submit handler ─────────────────────────────────────────────────
  // Handles both modes:
  //   1. Existing thread → POST stream directly.
  //   2. New thread     → create thread, navigate to /ai/autobot/<id>,
  //      then POST stream against the new id.
  const handleSend = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isStreaming) return;

      setStreamError(null);

      const clientId = newClientId();
      setPendingUser({ content: trimmed, clientId });
      setIsStreaming(true);

      try {
        let activeThreadId = threadId;

        if (!activeThreadId) {
          // ── New-thread bootstrap ─────────────────────────────────
          // Derive a title from the first 60 chars of the message. The
          // user can rename later via the history sidebar.
          //
          // The picker selection (`selectedConfigId`) is passed through
          // as the thread's `llm_config` override. Backend treats null
          // as "no thread-level override; resolve via UserSettings then
          // admin keys."
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
          // `replace: true` so the empty-state URL doesn't end up in
          // history. Otherwise back-button → blank screen → forward.
          navigate(`/ai/autobot/${activeThreadId}`, { replace: true });
          // Refresh the sidebar so the new thread appears immediately.
          window.dispatchEvent(new CustomEvent(THREADS_CHANGED_EVENT));
        }

        await runStream(activeThreadId, trimmed, clientId, mode);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to send.";
        setStreamError(msg);
        toast.error(msg);
        // Keep the pending user bubble visible so the user can see what
        // they typed and retry without re-entering it.
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
    ],
  );

  // Adapter for ChatInput's (e, value, category) signature. The category
  // arg is legacy ServiceNow-flow plumbing that autobot doesn't use.
  const onChatInputSubmit = useCallback(
    (_e: React.FormEvent, value: string) => {
      void handleSend(value);
    },
    [handleSend],
  );

  // ── Model picker change ────────────────────────────────────────────
  // Two paths:
  //   • Existing thread → optimistically update local state, fire a
  //     background PATCH. Roll back on failure (toast + restore).
  //   • Welcome screen  → just stash the choice; createThread on the
  //     next send will persist it.
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
        // ReactMarkdown wraps fenced code in `<pre><code>...</code></pre>`
        // by default. The prose plugin then styles the <pre> with its own
        // background + padding, which surrounds our CodeBlock in a second
        // visible "frame" (the user-reported outer gray box). Render the
        // pre as a transparent passthrough so only our CodeBlock surface
        // is visible.
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

  // Suppress system + tool messages from the visible thread. System
  // prompts are server-injected (not user-authored); tool messages are
  // already represented as badges under their preceding assistant turn.
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

      {/* Desktop top navbar — true glass effect.
       *
       * `absolute` (not flex-flow) so it OVERLAYS the scrolling
       * messages area. As messages scroll inside their container they
       * pass behind the navbar and `backdrop-blur-md` catches them —
       * the actual frosted-glass look. The messages + welcome state
       * compensate with `pt-16` so the first row clears the navbar. */}
      <div className="hidden lg:flex items-center justify-between absolute top-0 left-0 right-0 px-6 py-3 z-30 backdrop-blur-md bg-white/40 dark:bg-gray-900/40 border-b border-gray-200/30 dark:border-gray-800/30 shadow-sm">
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
        // Welcome state padded `lg:pt-16` to clear the absolute-positioned
        // navbar (only present on lg+). Mobile uses the in-flow header
        // above, so no extra padding needed there.
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
            <ChatInput
              handleSubmit={onChatInputSubmit}
              disabled={isStreaming}
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
            {/* Responsive: tight on mobile so bubbles use the full
             * width, capped on larger screens so very long lines stay
             * comfortably readable. `lg:pt-20` clears the absolute
             * glass navbar overhead so the first message isn't tucked
             * underneath it on page load — once the user scrolls,
             * subsequent messages pass behind the navbar (which is
             * exactly what produces the frosted-glass effect). */}
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
                  // on every token is wasteful and visually jumpy. Theme-
                  // aware text color so dark-mode users can actually
                  // read the incremental tokens.
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
              <ChatInput
                handleSubmit={onChatInputSubmit}
                disabled={isStreaming}
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
    // We don't have the matching tool result attached to the assistant
    // row — that's a separate role=tool Message. For v1 we surface the
    // call as "done" with no body. T21 can wire history-expansion that
    // joins the result back in if users ask for it.
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
