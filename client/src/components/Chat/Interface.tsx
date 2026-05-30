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
import ShareModal from "./ShareModal";
import ToolCallBadge, { type ToolCallStatus } from "./ToolCallBadge";
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
  getThread,
  listMessages,
  type AutobotMessage,
  type AutobotThread,
  type AutobotToolCall,
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
    () =>
      welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)],
    [],
  );

  const userInitial = (user?.firstName?.[0] || user?.username?.[0] || "U")
    .toUpperCase();

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

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [customizeModalOpen, setCustomizeModalOpen] = useState(false);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Abort controller for the in-flight SSE stream. Keyed by component
  // instance so navigating away or unmounting cancels cleanly.
  const abortRef = useRef<AbortController | null>(null);

  // ── History load on thread change ──────────────────────────────────
  useEffect(() => {
    if (!threadId) {
      // Welcome state — clear any prior thread's data.
      setThread(null);
      setMessages([]);
      setPendingUser(null);
      setPendingAssistant(null);
      setStreamError(null);
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
        { content, client_id: clientId, content_type: "text/plain" },
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
              // Authoritative finalization. The `event.message` is the
              // persisted assistant Message — drop the draft, append the
              // canonical row to history. We also clear `pendingUser`
              // here because the next history reload will surface the
              // persisted user row (and the live UI keeps the bubble
              // until then by including it in render below).
              setMessages((prev) => [...prev, event.message]);
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
          const token = await getToken();
          if (!token) throw new Error("Not signed in.");
          const title =
            trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
          const created = await createThread(token, { title });
          activeThreadId = created.id;
          setThread(created);
          // `replace: true` so the empty-state URL doesn't end up in
          // history. Otherwise back-button → blank screen → forward.
          navigate(`/ai/autobot/${activeThreadId}`, { replace: true });
        }

        await runStream(activeThreadId, trimmed, clientId);
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
    [threadId, isStreaming, navigate, getToken, runStream],
  );

  // Adapter for ChatInput's (e, value, category) signature. The category
  // arg is legacy ServiceNow-flow plumbing that autobot doesn't use.
  const onChatInputSubmit = useCallback(
    (_e: React.FormEvent, value: string) => {
      void handleSend(value);
    },
    [handleSend],
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

      {/* Top Controls (Desktop) */}
      <div className="hidden lg:flex items-center gap-0 absolute top-4 right-4 z-20">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => setVaultModalOpen(true)}
              className="flex items-center gap-2 cursor-pointer bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 py-2 px-3 rounded-full transition-colors"
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
              className="flex items-center gap-2 cursor-pointer bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 py-2 px-3 rounded-full transition-colors"
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
              className="flex items-center gap-2 cursor-pointer bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 py-2 px-3 rounded-full transition-colors"
            >
              <ShareIcon className="w-4 h-4 text-gray-800 dark:text-gray-200" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Share</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <ShareModal open={shareModalOpen} onOpenChange={setShareModalOpen} />
      <CustomizeModal
        open={customizeModalOpen}
        onOpenChange={setCustomizeModalOpen}
      />
      <Vault isOpen={vaultModalOpen} setIsOpen={setVaultModalOpen} />

      {!hasAnyContent ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
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
          <div className="w-full max-w-2xl">
            <ChatInput
              handleSubmit={onChatInputSubmit}
              disabled={isStreaming}
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
            <div className="max-w-[70%] mx-auto w-full flex flex-col gap-6 px-4 py-6 pb-4">
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
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {pendingAssistant.content}
                        <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-gray-500 align-middle" />
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
            <div className="max-w-[75%] mx-auto w-full">
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
          <div className="w-full text-gray-900 dark:text-gray-200 rounded-lg prose prose-sm prose-invert prose-pre:border prose-pre:border-gray-700/50 max-w-none">
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
    <div className="w-full flex items-start gap-3 justify-start">
      <div className="p-2 w-10 h-10 bg-purple-300/50 dark:bg-purple-500/30 text-gray-950 dark:text-gray-50 rounded-full flex items-center justify-center font-semibold shrink-0">
        {userInitial}
      </div>
      <div className="bg-gray-300 dark:bg-gray-950/50 text-gray-900 dark:text-gray-200 px-5 py-3.5 rounded-2xl rounded-tr-sm max-w-[85%] text-sm leading-relaxed shadow-sm font-medium whitespace-pre-wrap">
        {content}
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
