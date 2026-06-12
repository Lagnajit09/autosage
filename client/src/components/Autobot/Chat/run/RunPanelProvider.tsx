/**
 * Context wiring for the execution renderer:
 *   • a single `RunStore` shared by every `RunCard`/`RunPanel` in the thread,
 *   • the "active run" drawer state (which run is expanded in the right
 *     sidebar, and on which tab),
 *   • `seedPrompt` — lets a card/history-row prefill the chat composer
 *     (e.g. clicking a failed run seeds "investigate run <id>").
 *
 * Hooks:
 *   useEnsureRun(descriptor)  — idempotently start streaming a run (render-safe)
 *   useRunSnapshot(runId)     — subscribe to one run's live state
 *   useRunPanel()             — drawer controls + seedPrompt
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { RunStore } from "./runStore";
import type {
  PendingSecret,
  RunDescriptor,
  RunKind,
  RunSnapshot,
} from "./runTypes";

export type RunTab = "graph" | "logs" | "response";

export interface ActiveRun {
  runId: string;
  kind: RunKind;
  tab: RunTab;
}

interface RunPanelContextValue {
  store: RunStore;
  activeRun: ActiveRun | null;
  openRun: (runId: string, kind: RunKind, tab?: RunTab) => void;
  setTab: (tab: RunTab) => void;
  closeRun: () => void;
  seedPrompt: (text: string) => void;
  /** The run awaiting confirmation in the composer form, if any. */
  pendingSecret: PendingSecret | null;
  /** Open the composer-anchored confirmation form (manual — always opens). */
  requestSecret: (intent: PendingSecret) => void;
  /** Open it only the FIRST time an intent is seen — used by the live card so
   * a historical bubble doesn't re-pop the form on reload. */
  autoRequestSecret: (intent: PendingSecret) => void;
  /** Dismiss the composer form (cancel, or after a successful submit). */
  clearSecret: () => void;
}

const RunPanelContext = createContext<RunPanelContextValue | null>(null);

interface RunPanelProviderProps {
  children: ReactNode;
  /** Latest Clerk JWT getter — the store calls it when (re)opening streams. */
  getToken: () => Promise<string | null>;
  /** Prefill the chat composer without sending (history-row / "Run it"). */
  onSeedPrompt?: (text: string) => void;
  /** Changing this closes the open drawer (e.g. on thread navigation) so a
   * run from the previous thread doesn't stay pinned open. */
  resetKey?: string;
}

export const RunPanelProvider = ({
  children,
  getToken,
  onSeedPrompt,
  resetKey,
}: RunPanelProviderProps) => {
  // One store for the provider's lifetime.
  const [store] = useState(() => new RunStore());
  // Keep the token getter fresh (Clerk rotates JWTs). Setting a ref is cheap
  // and side-effect-free, so doing it in render is fine.
  store.setTokenGetter(getToken);

  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);

  // ── Composer-anchored confirmation form ────────────────────────────────
  const [pendingSecret, setPendingSecret] = useState<PendingSecret | null>(null);
  // Intents we've already surfaced — so the live card auto-opens once, and a
  // historical card (on reload) never auto-pops a stale form.
  const seenIntentsRef = useRef<Set<string>>(new Set());

  useEffect(() => () => store.dispose(), [store]);
  // Collapse the drawer + drop any pending form when the thread changes.
  useEffect(() => {
    setActiveRun(null);
    setPendingSecret(null);
    seenIntentsRef.current.clear();
  }, [resetKey]);

  const openRun = useCallback(
    (runId: string, kind: RunKind, tab: RunTab = kind === "workflow" ? "graph" : "logs") => {
      // Idempotent — also covers runs opened from a history row / get_*_run
      // result that were never mounted as a live RunCard. Hydration fills in
      // name/graph/status; an in-flight run reconnects its stream.
      store.register({ runId, kind });
      setActiveRun({ runId, kind, tab });
    },
    [store],
  );
  const setTab = useCallback(
    (tab: RunTab) => setActiveRun((cur) => (cur ? { ...cur, tab } : cur)),
    [],
  );
  const closeRun = useCallback(() => setActiveRun(null), []);
  const seedPrompt = useCallback(
    (text: string) => onSeedPrompt?.(text),
    [onSeedPrompt],
  );
  const requestSecret = useCallback((intent: PendingSecret) => {
    seenIntentsRef.current.add(intent.runIntentId);
    setPendingSecret(intent);
  }, []);
  const autoRequestSecret = useCallback((intent: PendingSecret) => {
    // First sighting only — keeps a reloaded historical card from re-opening.
    if (seenIntentsRef.current.has(intent.runIntentId)) return;
    seenIntentsRef.current.add(intent.runIntentId);
    setPendingSecret(intent);
  }, []);
  const clearSecret = useCallback(() => setPendingSecret(null), []);

  const value = useMemo<RunPanelContextValue>(
    () => ({
      store,
      activeRun,
      openRun,
      setTab,
      closeRun,
      seedPrompt,
      pendingSecret,
      requestSecret,
      autoRequestSecret,
      clearSecret,
    }),
    [
      store,
      activeRun,
      openRun,
      setTab,
      closeRun,
      seedPrompt,
      pendingSecret,
      requestSecret,
      autoRequestSecret,
      clearSecret,
    ],
  );

  return (
    <RunPanelContext.Provider value={value}>{children}</RunPanelContext.Provider>
  );
};

export const useRunPanel = (): RunPanelContextValue => {
  const ctx = useContext(RunPanelContext);
  if (!ctx) throw new Error("useRunPanel must be used within a RunPanelProvider");
  return ctx;
};

/** Render-safe, idempotent: starts the run's stream/poll exactly once. */
export const useEnsureRun = (descriptor: RunDescriptor | null): void => {
  const { store } = useRunPanel();
  if (descriptor) store.register(descriptor);
};

/** Subscribe to one run's live snapshot (undefined until registered). */
export const useRunSnapshot = (runId: string): RunSnapshot | undefined => {
  const { store } = useRunPanel();
  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(runId, cb),
    [store, runId],
  );
  const getSnapshot = useCallback(() => store.getSnapshot(runId), [store, runId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
