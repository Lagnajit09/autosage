/**
 * Chat history sidebar.
 *
 * Active thread comes from the URL via `useParams`. "New Chat" just
 * navigates to `/ai/autobot` — thread creation happens on first send.
 *
 * Refresh: window-level `autobot-threads-changed` event triggers re-fetch.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import {
  Archive,
  Loader2,
  MoreHorizontal,
  PlusCircle,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { Input } from "@/components/ui/input";

import {
  deleteThread,
  listThreads,
  patchThread,
  type AutobotThread,
} from "@/lib/api/autobot";

/** Dispatched by Interface (and consumed by History) when the thread
 * list needs to be re-fetched. Exported as a const so producers and
 * consumers agree on the exact string. */
export const THREADS_CHANGED_EVENT = "autobot-threads-changed";

type HistoryProps = {
  className?: string;
};

const History: React.FC<HistoryProps> = ({ className }) => {
  const { state } = useSidebar();
  const navigate = useNavigate();
  const { id: activeId } = useParams<{ id: string }>();
  const { getToken } = useAuth();

  const [threads, setThreads] = useState<AutobotThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  // Split target + open state so the dropdown's Radix portal fully
  // tears down before the dialog mounts — otherwise the stacked
  // overlays freeze the page (same pattern as pages/Workflows.tsx).
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const openDeleteModal = (threadId: string) => {
    setDeleteTargetId(threadId);
    setTimeout(() => setDeleteModalOpen(true), 0);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeleteTargetId(null);
  };

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in.");
      const page = await listThreads(token, 1, 50, "active");
      setThreads(page.threads);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load threads.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchThreads();
    const handler = () => {
      void fetchThreads();
    };
    window.addEventListener(THREADS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(THREADS_CHANGED_EVENT, handler);
  }, [fetchThreads]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredThreads = React.useMemo(
    () =>
      normalizedQuery
        ? threads.filter((t) =>
            (t.title || "Untitled").toLowerCase().includes(normalizedQuery),
          )
        : threads,
    [threads, normalizedQuery],
  );

  const handleNewChat = () => {
    setRenamingId(null);
    navigate("/ai/autobot");
  };

  const startRename = (thread: AutobotThread) => {
    setRenamingId(thread.id);
    setRenameDraft(thread.title || "");
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft("");
  };

  const commitRename = async (id: string) => {
    const newTitle = renameDraft.trim();
    if (!newTitle) {
      // Treat blank as cancel — server rejects blank titles anyway.
      cancelRename();
      return;
    }
    // No-op if the title didn't actually change.
    const existing = threads.find((t) => t.id === id);
    if (existing && existing.title === newTitle) {
      cancelRename();
      return;
    }
    setRenaming(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in.");
      const updated = await patchThread(token, id, { title: newTitle });
      setThreads((prev) => prev.map((t) => (t.id === id ? updated : t)));
      cancelRename();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Rename failed.";
      toast.error(msg);
    } finally {
      setRenaming(false);
    }
  };

  // Soft-hide via is_archived=true. Active thread routes back to welcome
  // so the user isn't stuck on a now-read-only view.
  const archiveThread = async (threadId: string) => {
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in.");
      await patchThread(token, threadId, { is_archived: true });
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeId === threadId) {
        navigate("/ai/autobot");
      }
      window.dispatchEvent(new Event(THREADS_CHANGED_EVENT));
      toast.success("Chat archived.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Archive failed.";
      toast.error(msg);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in.");
      await deleteThread(token, deleteTargetId);
      // Route the active thread back to welcome — its detail page 404s now.
      setThreads((prev) => prev.filter((t) => t.id !== deleteTargetId));
      if (activeId === deleteTargetId) {
        navigate("/ai/autobot");
      }
      toast.success("Thread deleted.");
      closeDeleteModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed.";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const collapsed = state === "collapsed";

  return (
    <Sidebar
      className={`${className ?? ""} hidden lg:flex ${
        collapsed
          ? "h-fit border-none [&_[data-sidebar=sidebar]]:bg-transparent dark:[&_[data-sidebar=sidebar]]:bg-transparent"
          : "h-full border-gray-300 dark:border-gray-800 [&_[data-sidebar=sidebar]]:bg-light-tertiary dark:[&_[data-sidebar=sidebar]]:bg-gray-950/20"
      } lg:ml-16 `}
      collapsible="icon"
    >
      {collapsed ? (
        <div className="flex flex-col items-center justify-center mt-4 gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <SidebarTrigger />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              Open sidebar
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleNewChat}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-200 dark:hover:text-gray-700 cursor-pointer"
              >
                <PlusCircle className="w-4 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              New Chat
            </TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <>
          <SidebarHeader className="mt-2 flex items-start gap-2 w-full">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <SidebarTrigger />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="center">
                    Close sidebar
                  </TooltipContent>
                </Tooltip>
                <img
                  src="/icon.png"
                  alt="AutoSage Icon"
                  className="w-8 h-8 object-contain rounded-full shadow-sm"
                />
                <p className="tracking-wider text-gray-950 dark:text-gray-100 font-semibold">
                  AutoSage
                </p>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleNewChat}
                    className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-200 dark:hover:text-gray-700 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  New Chat
                </TooltipContent>
              </Tooltip>
            </div>
            <SidebarInput
              placeholder="Search chats..."
              className="dark:bg-gray-800 text-gray-900 dark:text-gray-200 outline-none border border-gray-500 dark:border-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Chat History</SidebarGroupLabel>
              <SidebarGroupContent>
                {loading && threads.length === 0 ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                  </div>
                ) : filteredThreads.length === 0 ? (
                  <p className="px-2 py-4 text-xs text-gray-500 dark:text-gray-400">
                    {normalizedQuery
                      ? "No matching chats."
                      : "No chats yet. Start one by typing a message."}
                  </p>
                ) : (
                  <SidebarMenu>
                    {filteredThreads.map((thread) => {
                      // Computed once per row; used by both the wrapper
                      // (background tint) and the menu button (text
                      // color + left bar). Keep the lookup local so the
                      // map function stays a pure render expression.
                      const isActive = thread.id === activeId;
                      return (
                      <SidebarMenuItem key={thread.id} className="relative">
                        {renamingId === thread.id ? (
                          <div className="flex items-center gap-1 w-full px-2 py-1">
                            <Input
                              autoFocus
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void commitRename(thread.id);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelRename();
                                }
                              }}
                              maxLength={255}
                              disabled={renaming}
                              className="h-7 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
                            />
                            <button
                              type="button"
                              onClick={() => void commitRename(thread.id)}
                              disabled={renaming}
                              className="p-1 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded disabled:opacity-50"
                            >
                              {renaming ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={cancelRename}
                              disabled={renaming}
                              className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div
                            className={`relative flex items-center w-full group/item rounded-lg transition-colors ${
                              isActive
                                ? "bg-purple-100 dark:bg-purple-900/40"
                                : "hover:bg-purple-200/30 dark:hover:bg-purple-800/30"
                            }`}
                          >
                            {/* Left-edge accent bar on the active row —
                              * makes the highlight instantly readable
                              * even when the sidebar is scrolled past
                              * the title. Tucked inside the rounded
                              * wrapper so it inherits the radius. */}
                            {isActive && (
                              <span
                                aria-hidden
                                className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-purple-500 dark:bg-purple-400"
                              />
                            )}
                            <SidebarMenuButton
                              onClick={() =>
                                navigate(`/ai/autobot/${thread.id}`)
                              }
                              isActive={isActive}
                              tooltip={thread.title || "Untitled"}
                              className={`font-medium flex-1 hover:bg-transparent ${
                                isActive
                                  ? "text-purple-800 dark:text-purple-200 pl-3"
                                  : "text-gray-900 dark:text-gray-200"
                              }`}
                            >
                              <span className="truncate">
                                {thread.title || "Untitled"}
                              </span>
                            </SidebarMenuButton>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded p-0.5 ml-1 text-gray-700 dark:text-gray-300 opacity-0 pointer-events-none group-hover/item:opacity-100 group-hover/item:pointer-events-auto data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto hover:bg-transparent cursor-pointer"
                                  aria-label="Open chat actions"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                side="bottom"
                                sideOffset={2}
                                className="w-44 dark:bg-[#262626] border-none shadow-lg"
                              >
                                <DropdownMenuItem
                                  onClick={() => startRename(thread)}
                                  className="text-gray-800 dark:text-gray-200 dark:hover:bg-[#383838] cursor-pointer"
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  <span>Rename</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => void archiveThread(thread.id)}
                                  className="text-gray-800 dark:text-gray-200 dark:hover:bg-[#383838] cursor-pointer"
                                >
                                  <Archive className="mr-2 h-4 w-4" />
                                  <span>Archive</span>
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
                          </div>
                        )}
                      </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                )}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarSeparator />

          <SidebarFooter>
            <div className="text-xs text-muted-foreground px-2">
              Press Ctrl+B to toggle
            </div>
          </SidebarFooter>

          <SidebarRail />
        </>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteModalOpen}
        onOpenChange={(o) => !o && closeDeleteModal()}
      >
        <AlertDialogContent className="dark:bg-[#171717] dark:border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-gray-200">
              Delete this chat?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
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
    </Sidebar>
  );
};

export default History;
