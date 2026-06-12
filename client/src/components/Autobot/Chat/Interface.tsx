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

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
import ThreadSettingsModal from "./ThreadSettingsModal";
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
  Brain,
  ChevronRight,
  DatabaseZap,
  Loader2,
  Menu,
  Settings2,
  ShareIcon,
  SlidersHorizontal,
  X,
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
  type LLMConfig,
} from "@/lib/api/autobot";
import {
  refreshStreamToken,
  streamMessage,
  type AutobotStreamEvent,
} from "@/lib/api/autobot-stream";
import { RunPanelProvider, useRunPanel } from "./run/RunPanelProvider";
import RunPanel from "./run/RunPanel";
import { ComposerSecretForm } from "./run/SecretForm";
import {
  ToolResultCard,
  richToolKind,
  type ToolCallView,
} from "./run/ToolResultRenderer";

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

// How often to push a fresh JWT into an in-flight stream. Clerk session
// tokens are short-lived (~60s); a long tool turn makes mid-turn Django
// persists with the stream's held token, so we must refresh before it
// expires or those persists 403 ("Signature has expired").
const STREAM_TOKEN_REFRESH_MS = 40_000;

// Reverse-infinite-scroll page size. Includes role=tool rows (so a page is a
// handful of real turns); tunable in one place.
const MESSAGE_PAGE_SIZE = 50;
// Long-thread guardrails, counted in USER messages (token cost grows with the
// whole transcript each turn). Soft = nudge; hard = block, must start fresh.
const SOFT_USER_MSG_LIMIT = 20;
const HARD_USER_MSG_LIMIT = 40;

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
  /** ms epoch when this turn started — powers the live "thinking" timer. */
  startedAt: number;
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

// Turn the just-completed turn's live tool calls into the SAME message shape
// Django persists (one assistant row with tool_calls + one role=tool row per
// result), so the existing history renderer keeps showing the steps after the
// stream ends — without an extra fetch. Optimistic ids are replaced by the
// canonical rows on the next history load.
const buildStepMessages = (
  toolCalls: PendingToolCall[],
  clientId: string,
): AutobotMessage[] => {
  if (toolCalls.length === 0) return [];
  const base = {
    content_type: "text/plain" as const,
    provider: "",
    model_name: "",
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    client_id: "",
    created_at: new Date().toISOString(),
  };
  const out: AutobotMessage[] = [
    {
      ...base,
      id: `optimistic-steps-${clientId}`,
      role: "assistant",
      content: "",
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.argumentsJson },
      })),
      tool_call_id: "",
    },
  ];
  for (const tc of toolCalls) {
    if (tc.result === undefined) continue;
    out.push({
      ...base,
      id: `optimistic-toolresult-${tc.id}`,
      role: "tool",
      content: JSON.stringify(tc.result),
      tool_calls: [],
      tool_call_id: tc.id,
    });
  }
  return out;
};

// A conversational turn: the user message, the tool steps taken, and the
// assistant's final response. Past turns collapse their steps behind a
// single "Thought for Xs ›"; the live + most-recent turn stay expanded.
interface Turn {
  key: string;
  user: AutobotMessage | null;
  toolCalls: PendingToolCall[];
  response: AutobotMessage | null;
  /** user→response wall-clock, for the "Thought for Xs" label. */
  durationSec: number | null;
}

const buildTurns = (
  visible: AutobotMessage[],
  toolResults: Map<string, Record<string, unknown>>,
): Turn[] => {
  const turns: Turn[] = [];
  let cur: Turn | null = null;
  let startMs: number | null = null;
  const open = (user: AutobotMessage | null) => {
    startMs = user?.created_at ? Date.parse(user.created_at) : null;
    cur = {
      key: user?.id ?? `turn-${turns.length}`,
      user,
      toolCalls: [],
      response: null,
      durationSec: null,
    };
    turns.push(cur);
  };
  for (const m of visible) {
    if (m.role === "user") {
      open(m);
      continue;
    }
    // assistant
    if (!cur) open(null);
    if (m.tool_calls?.length) {
      for (const tc of m.tool_calls) {
        cur!.toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          argumentsJson: tc.function.arguments,
          status: "done",
          result: toolResults.get(tc.id),
        });
      }
    }
    if (m.content) {
      cur!.response = m;
      cur!.key = m.id; // stable key from the persisted response row
      const endMs = Date.parse(m.created_at);
      if (startMs != null && !Number.isNaN(endMs)) {
        cur!.durationSec = Math.max(0, Math.round((endMs - startMs) / 1000));
      }
    }
  }
  return turns;
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

  // Execution is BYO-only (AD-B3b): available iff a per-thread BYO config is
  // selected OR the user has a default BYO config. Shared/admin keys can't run.
  const canExecute = Boolean(selectedConfigId || userDefaultId);

  // Composer seed (history-row click / "Run it now") — prefills, never sends.
  const [seed, setSeed] = useState<
    { text: string; nonce: number } | undefined
  >();
  const seedNonceRef = useRef(0);
  const seedPrompt = useCallback((text: string) => {
    setSeed({ text, nonce: ++seedNonceRef.current });
  }, []);

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [customizeModalOpen, setCustomizeModalOpen] = useState(false);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [threadSettingsOpen, setThreadSettingsOpen] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Mirrors the in-flight turn's tool calls so `done` can materialize them
  // into the message list (reading state inside a setter would be impure).
  const turnToolCallsRef = useRef<PendingToolCall[]>([]);

  // ── Reverse-infinite-scroll pagination ─────────────────────────────
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const nextOlderPageRef = useRef(2);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  // Scroll anchoring on prepend + a "stick to bottom only if near bottom"
  // heuristic so loading older history doesn't yank the viewport around.
  const prependAnchorRef = useRef<{ prevHeight: number; prevTop: number } | null>(
    null,
  );
  const justPrependedRef = useRef(false);
  const nearBottomRef = useRef(true);

  // ── Long-thread guardrails ─────────────────────────────────────────
  const [userMsgCount, setUserMsgCount] = useState(0);
  const [longThreadDismissed, setLongThreadDismissed] = useState(false);
  const longThreadToastedRef = useRef<Set<string>>(new Set());

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
      setUserMsgCount(0);
      setHasMoreOlder(false);
      nextOlderPageRef.current = 2;
      return;
    }

    let cancelled = false;
    setLongThreadDismissed(false);
    nearBottomRef.current = true;
    (async () => {
      setHistoryLoading(true);
      setStreamError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not signed in.");
        // Latest-first page 1; render oldest→newest (reverse) so new turns
        // append at the bottom and older history loads on scroll-up.
        const [threadData, historyPage] = await Promise.all([
          getThread(token, threadId),
          listMessages(token, threadId, 1, MESSAGE_PAGE_SIZE, "-created_at"),
        ]);
        if (cancelled) return;
        setThread(threadData);
        setSelectedConfigId(threadData.llm_config);
        setMessages([...historyPage.messages].reverse());
        setUserMsgCount(threadData.user_message_count ?? 0);
        nextOlderPageRef.current = 2;
        setHasMoreOlder(historyPage.current_page < historyPage.total_pages);
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

  // Track whether the viewport is pinned near the bottom (so we only
  // auto-scroll on new content when the user is already at the bottom).
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    nearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // Stick to bottom for NEW content (send / stream / appended turn) — but
  // never when we just prepended older history, and never if the user has
  // scrolled up to read.
  useEffect(() => {
    if (justPrependedRef.current) {
      justPrependedRef.current = false;
      return;
    }
    const el = messagesContainerRef.current;
    if (!el || !nearBottomRef.current) return;
    const timeoutId = setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [messages.length, pendingUser, pendingAssistant]);

  // Restore scroll position after prepending older messages so the view
  // doesn't jump (classic infinite-scroll-up anchoring).
  useLayoutEffect(() => {
    const el = messagesContainerRef.current;
    const anchor = prependAnchorRef.current;
    if (el && anchor) {
      el.scrollTop = el.scrollHeight - anchor.prevHeight + anchor.prevTop;
      prependAnchorRef.current = null;
      justPrependedRef.current = true;
    }
  }, [messages]);

  // Fetch the next older page (newest-first server order → reverse → prepend).
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMoreOlder || !threadId) return;
    setLoadingOlder(true);
    try {
      const token = await getToken();
      if (!token) return;
      const page = nextOlderPageRef.current;
      const res = await listMessages(
        token,
        threadId,
        page,
        MESSAGE_PAGE_SIZE,
        "-created_at",
      );
      const older = [...res.messages].reverse();
      const el = messagesContainerRef.current;
      if (el) {
        prependAnchorRef.current = {
          prevHeight: el.scrollHeight,
          prevTop: el.scrollTop,
        };
      }
      setMessages((prev) => [...older, ...prev]);
      nextOlderPageRef.current = page + 1;
      setHasMoreOlder(res.current_page < res.total_pages);
    } catch (err) {
      console.warn("Failed to load older messages:", err);
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasMoreOlder, threadId, getToken]);

  // Fire loadOlder when the top sentinel scrolls into view.
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const root = messagesContainerRef.current;
    if (!sentinel || !root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadOlder();
      },
      { root, rootMargin: "240px 0px 0px 0px", threshold: 0 },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [loadOlder, hasMoreOlder]);

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

      const startedAt = Date.now();
      turnToolCallsRef.current = [];
      setPendingAssistant({ content: "", toolCalls: [], startedAt });

      // Keep the stream's server-side JWT fresh. Clerk session tokens expire
      // in ~60s; a long tool turn makes Django persists mid-turn with the
      // stream's held token, so without this they 403 ("Signature has
      // expired") and the turn aborts before any tool step is shown.
      let refreshTimer: ReturnType<typeof setInterval> | null = null;
      const stopTokenRefresh = () => {
        if (refreshTimer) {
          clearInterval(refreshTimer);
          refreshTimer = null;
        }
      };

      try {
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
                const streamId = event.stream_id;
                stopTokenRefresh();
                refreshTimer = setInterval(() => {
                  void (async () => {
                    try {
                      // skipCache forces a freshly-minted token each tick.
                      const fresh = await getToken({ skipCache: true });
                      if (fresh)
                        await refreshStreamToken(fresh, targetThreadId, streamId);
                    } catch (e) {
                      console.warn("Stream token refresh failed:", e);
                    }
                  })();
                }, STREAM_TOKEN_REFRESH_MS);
                break;
              }
            case "token": {
              setPendingAssistant((prev) =>
                prev
                  ? { ...prev, content: prev.content + event.content }
                  : { content: event.content, toolCalls: [], startedAt },
              );
              break;
            }
            case "tool_call_start": {
              // The ref is the source of truth (so `done` can read it
              // synchronously); state mirrors it for rendering.
              const without = turnToolCallsRef.current.filter(
                (tc) => tc.id !== event.id,
              );
              turnToolCallsRef.current = [
                ...without,
                {
                  id: event.id,
                  name: event.name,
                  argumentsJson: event.arguments,
                  status: "running",
                },
              ];
              const snapshot = turnToolCallsRef.current;
              setPendingAssistant((prev) => ({
                ...(prev ?? { content: "", toolCalls: [], startedAt }),
                toolCalls: snapshot,
              }));
              break;
            }
            case "tool_result": {
              const hasError =
                event.result != null &&
                typeof event.result === "object" &&
                "error" in event.result;
              turnToolCallsRef.current = turnToolCallsRef.current.map((tc) =>
                tc.id === event.id
                  ? {
                      ...tc,
                      status: hasError ? "error" : "done",
                      result: event.result,
                    }
                  : tc,
              );
              const snapshot = turnToolCallsRef.current;
              setPendingAssistant((prev) => ({
                ...(prev ?? { content: "", toolCalls: [], startedAt }),
                toolCalls: snapshot,
              }));
              // X17 — when a result is `awaiting_secret`, the live
              // <AwaitingSecretCard> opens the composer form itself (no state
              // to manage here); see ToolResultRenderer.
              break;
            }
            case "done": {
              stopTokenRefresh();
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
                // Turn start (not done-time) so the optimistic "Thought for Xs"
                // duration is realistic until the canonical rows load.
                created_at: new Date(startedAt).toISOString(),
              };
              // Materialize this turn's tool steps so they DON'T vanish when
              // pendingAssistant clears. We mirror exactly what a later
              // refresh produces: one assistant row carrying the tool_calls +
              // one role=tool row per result (consumed by the `toolResults`
              // map → rich cards). Live RunCards re-register idempotently and
              // keep streaming from the shared store.
              const stepMessages = buildStepMessages(
                turnToolCallsRef.current,
                clientId,
              );
              turnToolCallsRef.current = [];
              setMessages((prev) => [
                ...prev,
                optimisticUser,
                ...stepMessages,
                event.message,
              ]);
              setPendingAssistant(null);
              setPendingUser(null);
              break;
            }
            case "error": {
              stopTokenRefresh();
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
      } finally {
        // Covers normal close, abort, and any throw.
        stopTokenRefresh();
      }
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
      // Long-thread hard cap — input is disabled, but a race could reach here.
      if (threadId && userMsgCount >= HARD_USER_MSG_LIMIT) {
        toast.error(
          "This conversation has reached its length limit. Start a new thread to continue.",
        );
        return;
      }

      setStreamError(null);

      const clientId = newClientId();
      setPendingUser({ content: trimmed, clientId });
      // Optimistic — server count is authoritative on next load.
      setUserMsgCount((c) => c + 1);
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
      userMsgCount,
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
      // GFM enables tables, strikethrough, task lists, and autolinks.
      remarkPlugins={[remarkGfm]}
      components={{
        // Tables — wrapped so a wide table scrolls instead of overflowing the
        // bubble; theme-aware borders + a subtle header row.
        table(props: React.ComponentPropsWithoutRef<"table">) {
          return (
            <div className="my-2 w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full border-collapse text-sm" {...props} />
            </div>
          );
        },
        thead(props: React.ComponentPropsWithoutRef<"thead">) {
          return (
            <thead
              className="bg-gray-50 dark:bg-gray-800/60"
              {...props}
            />
          );
        },
        th(props: React.ComponentPropsWithoutRef<"th">) {
          return (
            <th
              className="border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200"
              {...props}
            />
          );
        },
        td(props: React.ComponentPropsWithoutRef<"td">) {
          return (
            <td
              className="border-b border-gray-100 px-3 py-2 align-top text-xs text-gray-700 dark:border-gray-800 dark:text-gray-300"
              {...props}
            />
          );
        },
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

  // Execution mode is BYO-gated — if the user drops their BYO key (or it
  // never resolved) while Execution is selected, fall back to Research so the
  // composer never sits in a mode the backend will refuse (AD-B3b).
  useEffect(() => {
    if (mode === "execution" && !canExecute) setMode("research");
  }, [mode, canExecute]);

  // Map tool_call_id → result by reading the role=tool history messages, so
  // historical workflow/script runs re-render as live RunCards (the role=tool
  // rows are filtered out of the bubbles but carry the result JSON).
  const toolResults = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const m of messages) {
      if (m.role === "tool" && m.tool_call_id && m.content) {
        try {
          map.set(m.tool_call_id, JSON.parse(m.content));
        } catch {
          /* non-JSON tool content — skip */
        }
      }
    }
    return map;
  }, [messages]);

  const visibleMessages = useMemo(
    () => messages.filter((m) => m.role === "user" || m.role === "assistant"),
    [messages],
  );

  // Group into turns (user → tool steps → response) so past turns can collapse
  // their steps behind a single "Thought for Xs ›".
  const turns = useMemo(
    () => buildTurns(visibleMessages, toolResults),
    [visibleMessages, toolResults],
  );

  // Long-thread guardrails (user-message count).
  const overSoft = !!threadId && userMsgCount > SOFT_USER_MSG_LIMIT;
  const overHard = !!threadId && userMsgCount >= HARD_USER_MSG_LIMIT;
  // The most recent completed turn stays expanded while idle; it collapses
  // once a new turn starts streaming. The live turn renders separately.
  const idle = !pendingUser && !pendingAssistant;

  // One-time nudge per thread when crossing the soft limit.
  useEffect(() => {
    if (overSoft && !overHard && threadId && !longThreadToastedRef.current.has(threadId)) {
      longThreadToastedRef.current.add(threadId);
      toast(
        "This conversation is getting long — consider starting a new thread. Long threads re-send the whole transcript each turn and cost more tokens.",
      );
    }
  }, [overSoft, overHard, threadId]);

  // Has-content check for the welcome screen flip.
  const hasAnyContent =
    visibleMessages.length > 0 ||
    pendingUser !== null ||
    pendingAssistant !== null ||
    historyLoading;

  return (
    <RunPanelProvider
      getToken={getToken}
      onSeedPrompt={seedPrompt}
      resetKey={threadId}
    >
      <div className="relative flex h-full w-full overflow-hidden">
        {/* Chat column — flexes to fill space left by the run drawer (which
         * compresses it on lg+; on mobile the drawer overlays instead). */}
        <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
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

              {thread && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => setThreadSettingsOpen(true)}
                      className="flex items-center gap-2 cursor-pointer bg-transparent hover:bg-gray-100/70 dark:hover:bg-gray-800/70 py-2 px-3 rounded-full transition-colors"
                    >
                      <SlidersHorizontal className="w-4 h-4 text-gray-800 dark:text-gray-200" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Thread settings</p>
                  </TooltipContent>
                </Tooltip>
              )}

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
          <ThreadSettingsModal
            open={threadSettingsOpen}
            onOpenChange={setThreadSettingsOpen}
            thread={thread}
            configs={configs}
            userDefaultId={userDefaultId}
            onSaved={(updated) => {
              // Keep the ModelPicker pill in sync — it reads from
              // `selectedConfigId`, not `thread.llm_config`.
              setThread(updated);
              setSelectedConfigId(updated.llm_config);
            }}
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
                <ComposerSecretForm />
                <ChatInput
                  handleSubmit={onChatInputSubmit}
                  disabled={isStreaming || !!thread?.is_archived}
                  mode={mode}
                  onModeChange={setMode}
                  executionEnabled={canExecute}
                  seed={seed}
                />
              </div>
            </div>
          ) : (
            <>
              {/* Scrollable Messages Area */}
              <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 w-full overflow-y-auto scroll-smooth"
              >
                <div className="w-full max-w-3xl xl:max-w-[70%] mx-auto flex flex-col gap-6 px-4 py-6 pb-4 lg:pt-20">
                  {historyLoading && visibleMessages.length === 0 && (
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                      Loading conversation…
                    </p>
                  )}

                  {/* Top sentinel — drives loading older history on scroll-up. */}
                  {hasMoreOlder && (
                    <div ref={topSentinelRef} className="flex justify-center py-1">
                      {loadingOlder && (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      )}
                    </div>
                  )}

                  {turns.map((turn, i) => (
                    <TurnRow
                      key={turn.key}
                      turn={turn}
                      expanded={idle && i === turns.length - 1}
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
                      timerStartMs={pendingAssistant.startedAt}
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
                  <div className="flex justify-end items-center gap-1.5 px-2">
                    {thread && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setThreadSettingsOpen(true)}
                            disabled={isStreaming}
                            aria-label="Thread settings"
                            className="lg:hidden inline-flex items-center justify-center rounded-full border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-800/40 px-2 py-1 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <SlidersHorizontal className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Thread settings</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
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
                  {overHard ? (
                    <ThreadLimitBanner onNewThread={() => navigate("/ai/autobot")} />
                  ) : (
                    overSoft &&
                    !longThreadDismissed && (
                      <LongThreadBanner
                        onNewThread={() => navigate("/ai/autobot")}
                        onDismiss={() => setLongThreadDismissed(true)}
                      />
                    )
                  )}
                  <ComposerSecretForm />
                  <ChatInput
                    handleSubmit={onChatInputSubmit}
                    disabled={isStreaming || !!thread?.is_archived || overHard}
                    mode={mode}
                    onModeChange={setMode}
                    executionEnabled={canExecute}
                    seed={seed}
                  />
                </div>
              </div>
            </>
          )}
        </div>
        {/* Right-sidebar run drawer (compresses chat on lg+, overlays on mobile). */}
        <RunDrawer />
      </div>
    </RunPanelProvider>
  );
};

// ── Run drawer ───────────────────────────────────────────────────────

const RunDrawer = () => {
  const { activeRun, closeRun } = useRunPanel();
  if (!activeRun) return null;
  return (
    <>
      {/* Mobile backdrop — desktop has no overlay (the panel is a column). */}
      <div
        onClick={closeRun}
        className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        aria-hidden
      />
      <aside className="animate-slide-in-right fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950 sm:w-[420px] lg:static lg:z-auto lg:w-[440px] lg:shadow-none xl:w-[500px] 2xl:w-[560px]">
        <RunPanel activeRun={activeRun} />
      </aside>
    </>
  );
};

// ── Sub-components ───────────────────────────────────────────────────

// One tool call → its rich renderer (execution/preview/history) or the
// plain badge fallback. The single source of truth for both live and history.
const ToolCallItem = ({
  tc,
  live = false,
}: {
  tc: PendingToolCall;
  /** True in the streaming turn — lets an awaiting-secret result auto-open the
   * composer confirmation form once on arrival. */
  live?: boolean;
}) => {
  const view: ToolCallView = {
    id: tc.id,
    name: tc.name,
    argumentsJson: tc.argumentsJson,
    status: tc.status,
    result: tc.result,
  };
  return richToolKind(view) ? (
    <ToolResultCard tc={view} live={live} />
  ) : (
    <ToolCallBadge
      name={tc.name}
      status={tc.status}
      argumentsJson={tc.argumentsJson}
      result={tc.result}
    />
  );
};

// Collapsed view of a past turn's tool steps. Data is already loaded (it
// arrived with the page) — expanding just reveals it; no extra fetch.
const ThoughtBlock = ({
  toolCalls,
  durationSec,
}: {
  toolCalls: PendingToolCall[];
  durationSec: number | null;
}) => {
  const [open, setOpen] = useState(false);
  const label =
    durationSec != null ? `Thought for ${formatThinking(durationSec)}` : "Thought process";
  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-200"
      >
        <Brain className="h-3.5 w-3.5" />
        {label}
        <span className="text-gray-400 dark:text-gray-500">
          · {toolCalls.length} step{toolCalls.length === 1 ? "" : "s"}
        </span>
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-2 flex flex-col items-start gap-2 border-l-2 border-gray-200 pl-3 dark:border-gray-700">
          {toolCalls.map((tc) => (
            <ToolCallItem key={tc.id} tc={tc} />
          ))}
        </div>
      )}
    </div>
  );
};

const AssistantResponse = ({
  message,
  renderMarkdown,
}: {
  message: AutobotMessage;
  renderMarkdown: (content: string) => React.ReactNode;
}) => (
  <div className="w-full text-gray-900 dark:text-gray-200 rounded-lg prose prose-sm prose-invert prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0 prose-pre:border-0 max-w-none">
    {renderMarkdown(message.content)}
  </div>
);

interface TurnRowProps {
  turn: Turn;
  /** Render steps inline (live/most-recent turn) vs collapse them (past). */
  expanded: boolean;
  userInitial: string;
  renderMarkdown: (content: string) => React.ReactNode;
}

const TurnRow = ({ turn, expanded, userInitial, renderMarkdown }: TurnRowProps) => (
  <>
    {turn.user && (
      <UserBubble content={turn.user.content} userInitial={userInitial} />
    )}
    {turn.toolCalls.length > 0 &&
      (expanded ? (
        <div className="flex w-full flex-col items-start gap-2">
          {turn.toolCalls.map((tc) => (
            <ToolCallItem key={tc.id} tc={tc} />
          ))}
        </div>
      ) : (
        <ThoughtBlock toolCalls={turn.toolCalls} durationSec={turn.durationSec} />
      ))}
    {turn.response && (
      <AssistantResponse message={turn.response} renderMarkdown={renderMarkdown} />
    )}
  </>
);

// Long-thread guardrails. Soft = dismissible nudge; hard = blocking notice.
const LongThreadBanner = ({
  onNewThread,
  onDismiss,
}: {
  onNewThread: () => void;
  onDismiss: () => void;
}) => (
  <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
    <span className="min-w-0">
      This conversation is getting long — consider a new thread to save tokens.
    </span>
    <div className="flex shrink-0 items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={onNewThread}
        className="bg-transparent border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
      >
        New thread
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded p-1 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  </div>
);

const ThreadLimitBanner = ({ onNewThread }: { onNewThread: () => void }) => (
  <div className="flex items-center justify-between gap-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
    <span className="min-w-0">
      This conversation has reached its length limit. Start a new thread to
      continue.
    </span>
    <Button
      size="sm"
      onClick={onNewThread}
      className="shrink-0 bg-purple-600 text-white hover:bg-purple-700"
    >
      New thread
    </Button>
  </div>
);

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

// Live "thinking"/elapsed timer for the in-flight turn: 12s, 1m 10s.
const formatThinking = (seconds: number): string =>
  seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;

const ThinkingTimer = ({ startMs }: { startMs: number }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startMs) / 1000));
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
      <Loader2 className="h-3 w-3 animate-spin text-purple-500" />
      {formatThinking(seconds)}
    </span>
  );
};

interface AssistantBubbleProps {
  toolCalls: PendingToolCall[];
  body: React.ReactNode;
  /** When set, render a live elapsed timer (only the in-flight turn). */
  timerStartMs?: number;
}

const AssistantBubble = ({
  toolCalls,
  body,
  timerStartMs,
}: AssistantBubbleProps) => (
  <div className="w-full">
    {timerStartMs !== undefined && (
      <div className="mb-1.5">
        <ThinkingTimer startMs={timerStartMs} />
      </div>
    )}
    {toolCalls.length > 0 && (
      <div className="mb-2 flex flex-col items-start gap-2">
        {toolCalls.map((tc) => (
          <ToolCallItem key={tc.id} tc={tc} live />
        ))}
      </div>
    )}
    {body}
  </div>
);

export default Interface;
