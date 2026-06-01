/**
 * Archived chats page (T30).
 *
 * Hidden from the main LeftNav — discoverable only via the "View archived
 * chats" button on the Autobot Dashboard (T27). Lists threads with
 * `is_archived=true` and offers two terminal actions per row: Unarchive
 * (back to active) or Delete (permanent removal).
 *
 * Why not just enable Delete from the active sidebar? Two reasons:
 *   1. Archive is the soft-hide; Delete is the hard-remove. Keeping them
 *      both available from both surfaces matches the locked decision.
 *   2. The Delete dialog uses the same two-step Radix dance as History.tsx
 *      to avoid the dropdown/alert overlay stacking that freezes the page.
 *
 * Refresh hook: dispatches THREADS_CHANGED_EVENT after every mutation so
 * the History sidebar (if mounted) re-fetches without us having to lift
 * state.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArchiveRestore,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

import { DashboardSidebar } from "@/components/Dashboard/Sidebar";
import { AutobotDashboardHeader } from "@/components/Autobot/DashboardHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { THREADS_CHANGED_EVENT } from "@/components/Autobot/Chat/History";
import {
  type AutobotThread,
  deleteThread,
  listThreads,
  patchThread,
} from "@/lib/api/autobot";

// Shared surface class — same shape used on the Autobot Dashboard so the
// two pages feel like one section. Explicit dark variants instead of
// relying on the design-system `bg-card` token.
const CARD_SURFACE =
  "bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50";

const formatTimestamp = (iso?: string | null): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const AutobotArchived = () => {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [threads, setThreads] = useState<AutobotThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Two-step delete: see History.tsx for the rationale (Radix overlay
  // stacking bug between DropdownMenu and AlertDialog).
  const openDeleteModal = (id: string) => {
    setDeleteTargetId(id);
    setTimeout(() => setDeleteModalOpen(true), 0);
  };
  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeleteTargetId(null);
  };

  const fetchArchived = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in.");
      const page = await listThreads(token, 1, 100, "archived");
      setThreads(page.threads);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load archived chats.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchArchived();
    const handler = () => {
      void fetchArchived();
    };
    window.addEventListener(THREADS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(THREADS_CHANGED_EVENT, handler);
  }, [fetchArchived]);

  const handleUnarchive = async (id: string) => {
    setPendingId(id);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in.");
      await patchThread(token, id, { is_archived: false });
      setThreads((prev) => prev.filter((t) => t.id !== id));
      window.dispatchEvent(new Event(THREADS_CHANGED_EVENT));
      toast.success("Chat unarchived.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unarchive failed.";
      toast.error(msg);
    } finally {
      setPendingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in.");
      await deleteThread(token, deleteTargetId);
      setThreads((prev) => prev.filter((t) => t.id !== deleteTargetId));
      window.dispatchEvent(new Event(THREADS_CHANGED_EVENT));
      toast.success("Chat deleted.");
      closeDeleteModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed.";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <AutobotDashboardHeader />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/ai/autobot/dashboard")}
                  className="-ml-2 mb-1 text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back to Autobot Dashboard
                </Button>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                  Archived chats
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Soft-hidden conversations. Unarchive to resume sending
                  messages, or delete to remove permanently.
                </p>
              </div>

              {loading ? (
                <div className="flex h-48 items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-[#7429a7] dark:text-[#d4b0eb]" />
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Loading archived chats…
                    </span>
                  </div>
                </div>
              ) : threads.length === 0 ? (
                <Card className={CARD_SURFACE}>
                  <CardHeader>
                    <CardTitle className="text-gray-900 dark:text-white">
                      No archived chats
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400">
                      Archive a chat from the sidebar menu to see it here.
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : (
                <Card className={CARD_SURFACE}>
                  <CardContent className="p-0">
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700/60">
                      {threads.map((thread) => (
                        <li
                          key={thread.id}
                          className="flex items-center justify-between gap-2 sm:gap-3 p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => navigate(`/ai/autobot/${thread.id}`)}
                            className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded"
                          >
                            <p className="truncate font-medium text-sm sm:text-base text-gray-900 dark:text-white">
                              {thread.title || "Untitled"}
                            </p>
                            <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
                              Last message{" "}
                              {formatTimestamp(thread.last_message_at)}
                            </p>
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
                                aria-label="Open chat actions"
                                disabled={pendingId === thread.id}
                              >
                                {pendingId === thread.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              side="bottom"
                              sideOffset={2}
                              className="w-44 bg-white dark:bg-[#262626] border border-gray-200 dark:border-transparent shadow-lg"
                            >
                              <DropdownMenuItem
                                onClick={() => void handleUnarchive(thread.id)}
                                className="text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#383838] cursor-pointer"
                              >
                                <ArchiveRestore className="mr-2 h-4 w-4" />
                                <span>Unarchive</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => openDeleteModal(thread.id)}
                                className="text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 focus:bg-red-100 dark:focus:bg-red-900/40 cursor-pointer"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Delete</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </div>
      </div>

      <AlertDialog
        open={deleteModalOpen}
        onOpenChange={(o) => !o && closeDeleteModal()}
      >
        <AlertDialogContent className="bg-white dark:bg-[#171717] border border-gray-200 dark:border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-gray-200">
              Delete this chat?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 dark:text-gray-400">
              This will permanently remove the conversation and its messages.
              Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              className="dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:border-gray-700"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default AutobotArchived;
