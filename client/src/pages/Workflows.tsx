import { useState, useEffect } from "react";
import {
  listAllTriggers,
  updateHttpTriggerStatus,
  updateScheduleTriggerStatus,
  deleteGlobalHttpTrigger,
  deleteGlobalScheduleTrigger,
} from "@/lib/actions/triggers";
import { ScheduleTriggersTable } from "@/components/Workflows/Triggers/ScheduleTriggersTable";
import { HttpTriggersTable } from "@/components/Workflows/Triggers/HttpTriggersTable";
import { Loader2 } from "lucide-react";

import LeftNav, { NavItems } from "@/components/LeftNav";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, Plus, Search, Menu } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Workflow } from "@/components/Workflows/types";
import { WorkflowCard } from "@/components/Workflows/WorkflowCard";
import { WorkflowListItem } from "@/components/Workflows/WorkflowListItem";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { apiRequest } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import { toast as toast2 } from "sonner";
import { deleteWorkflow } from "@/lib/actions/workflow";
import { DeleteConfirmationModal } from "@/components/DeleteConfirmationModal";
import {
  WorkflowCardSkeleton,
  WorkflowListItemSkeleton,
} from "@/components/Workflows/WorkflowsSkeleton";

const Workflows = () => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [workflowToDelete, setWorkflowToDelete] = useState<string | null>(null);

  // Filter Tabs
  const [activeTab, setActiveTab] = useState<"workflows" | "http" | "schedule">(
    "workflows",
  );

  // Triggers State
  const [httpTriggers, setHttpTriggers] = useState<any[]>([]);
  const [scheduleTriggers, setScheduleTriggers] = useState<any[]>([]);
  const [triggersLoading, setTriggersLoading] = useState(false);
  const [deleteTriggerModalOpen, setDeleteTriggerModalOpen] = useState(false);
  const [triggerToDelete, setTriggerToDelete] = useState<{
    id: string;
    type: "http" | "schedule";
  } | null>(null);
  const [deletingTrigger, setDeletingTrigger] = useState(false);

  const navigate = useNavigate();
  const { getToken, isSignedIn } = useAuth();

  // Get Clerk Token
  useEffect(() => {
    if (isSignedIn) {
      const getClerkToken = async () => {
        try {
          const clerkToken = await getToken();
          setToken(clerkToken);
        } catch (error) {
          console.error("Failed to get token:", error);
        }
      };
      getClerkToken();
    } else {
      setLoading(false);
    }
  }, [isSignedIn, getToken]);

  // Fetch Workflows
  useEffect(() => {
    if (token) {
      const fetchWorkflows = async () => {
        toast2.loading("Fetching workflows...");
        setLoading(true);
        try {
          const response = await apiRequest("/api/workflows/", {}, token);
          const data = response?.data || response || [];

          // Map server response to client Workflow type with default values
          const mappedWorkflows: Workflow[] = Array.isArray(data)
            ? data.map(
                (item: {
                  id: string;
                  name?: string;
                  description?: string;
                  created_at: string;
                  runs?: number;
                  total_nodes?: number;
                  total_edges?: number;
                }) => ({
                  id: item.id,
                  title: item.name || "Untitled Workflow",
                  description: item.description || "Autosage Workflow",
                  lastRun: formatDate(item.created_at) || "Never",
                  runs: typeof item.runs === "number" ? item.runs : 0,
                  total_nodes:
                    typeof item.total_nodes === "number" ? item.total_nodes : 0,
                  total_edges:
                    typeof item.total_edges === "number" ? item.total_edges : 0,
                }),
              )
            : [];

          setWorkflows(mappedWorkflows);
          toast2.success("Workflows fetched successfully!");
        } catch (error) {
          console.error("Failed to fetch workflows:", error);
          toast2.error("Failed to fetch workflows!");
          setWorkflows([]); // Fallback to empty list on error
        } finally {
          setLoading(false);
          toast2.dismiss();
        }
      };
      fetchWorkflows();
    }
  }, [token]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredWorkflows = workflows.filter(
    (workflow) =>
      workflow.title
        .toLowerCase()
        .includes(debouncedSearchQuery.toLowerCase()) ||
      workflow.description
        .toLowerCase()
        .includes(debouncedSearchQuery.toLowerCase()),
  );

  const handleDeleteClick = (workflowId: string) => {
    setWorkflowToDelete(workflowId);
    setTimeout(() => setDeleteModalOpen(true), 0);
  };

  const confirmDeleteWorkflow = async () => {
    if (!workflowToDelete) return;

    toast2.loading("Deleting workflow...");
    if (!isSignedIn) {
      toast({
        title: "Unauthorized",
        description: "You must be signed in to delete a workflow.",
        variant: "destructive",
      });
      return;
    }

    try {
      const clerkToken = await getToken();
      const response = await deleteWorkflow(workflowToDelete, clerkToken);
      if (response.success) {
        toast({
          title: "Workflow Deleted",
          description: "Workflow successfully deleted.",
        });
      }

      setWorkflows((prevWorkflows) =>
        prevWorkflows.filter((workflow) => workflow.id !== workflowToDelete),
      );
    } catch (error) {
      console.error("Failed to delete workflow:", error);
      toast({
        title: "Error",
        description: "Failed to delete workflow.",
        variant: "destructive",
      });
    } finally {
      toast2.dismiss();
      setWorkflowToDelete(null);
      setDeleteModalOpen(false);
    }
  };

  // --- TRIGGERS LOGIC ---
  const fetchTriggers = async () => {
    if (!isSignedIn) return;
    setTriggersLoading(true);
    try {
      const clerkToken = await getToken();
      const res = await listAllTriggers(clerkToken);
      if (res?.success) {
        setHttpTriggers(res.data.http_triggers || []);
        setScheduleTriggers(res.data.schedule_triggers || []);
      } else {
        toast2.error("Failed to load triggers");
      }
    } catch (err) {
      console.error(err);
      toast2.error("Error fetching triggers");
    } finally {
      setTriggersLoading(false);
    }
  };

  useEffect(() => {
    if (
      (activeTab === "http" || activeTab === "schedule") &&
      httpTriggers.length === 0 &&
      scheduleTriggers.length === 0
    ) {
      fetchTriggers();
    }
  }, [activeTab, isSignedIn, getToken]);

  const handleToggleHttp = async (id: string, current: boolean) => {
    toast2.loading(`${!current ? "Enabling" : "Disabling"} trigger...`);
    try {
      const clerkToken = await getToken();
      const res = await updateHttpTriggerStatus(id, !current, clerkToken);
      if (res?.success) {
        toast2.success(`HTTP Trigger ${!current ? "enabled" : "disabled"}`);
        setHttpTriggers((prev) =>
          prev.map((t) => (t.id === id ? { ...t, is_active: !current } : t)),
        );
      } else {
        toast2.error("Failed to update trigger");
      }
    } catch (err) {
      console.error(err);
      toast2.error("Error updating trigger");
    } finally {
      toast2.dismiss();
    }
  };

  const handleToggleSchedule = async (id: string, current: boolean) => {
    toast2.loading(`${!current ? "Enabling" : "Disabling"} trigger...`);
    try {
      const clerkToken = await getToken();
      const res = await updateScheduleTriggerStatus(id, !current, clerkToken);
      if (res?.success) {
        toast2.success(`Schedule Trigger ${!current ? "enabled" : "disabled"}`);
        setScheduleTriggers((prev) =>
          prev.map((t) => (t.id === id ? { ...t, is_active: !current } : t)),
        );
      } else {
        toast2.error("Failed to update trigger");
      }
    } catch (err) {
      console.error(err);
      toast2.error("Error updating trigger");
    } finally {
      toast2.dismiss();
    }
  };

  const handleDeleteHttp = async (id: string) => {
    try {
      const clerkToken = await getToken();
      const res = await deleteGlobalHttpTrigger(id, clerkToken);
      if (res?.success || res?.status_code === 204) {
        toast2.success("HTTP Trigger deleted");
        setHttpTriggers((prev) => prev.filter((t) => t.id !== id));
      } else {
        toast2.error("Failed to delete trigger");
      }
    } catch (err) {
      console.error(err);
      toast2.error("Error deleting trigger");
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    try {
      const clerkToken = await getToken();
      const res = await deleteGlobalScheduleTrigger(id, clerkToken);
      if (res?.success || res?.status_code === 204) {
        toast2.success("Schedule Trigger deleted");
        setScheduleTriggers((prev) => prev.filter((t) => t.id !== id));
      } else {
        toast2.error("Failed to delete trigger");
      }
    } catch (err) {
      console.error(err);
      toast2.error("Error deleting trigger");
    }
  };

  const confirmDeleteTrigger = async () => {
    if (!triggerToDelete) return;
    setDeletingTrigger(true);
    try {
      if (triggerToDelete.type === "http") {
        await handleDeleteHttp(triggerToDelete.id);
      } else {
        await handleDeleteSchedule(triggerToDelete.id);
      }
    } finally {
      setDeletingTrigger(false);
      setDeleteTriggerModalOpen(false);
      setTriggerToDelete(null);
    }
  };

  const openDeleteTriggerModal = (id: string, type: "http" | "schedule") => {
    setTriggerToDelete({ id, type });
    setDeleteTriggerModalOpen(true);
  };

  return (
    <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
      <LeftNav />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
            {/* Header Section */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Mobile Menu */}
                  <div className="md:hidden">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-ml-2 hover:bg-gray-300 dark:hover:bg-gray-700"
                        >
                          <Menu className="h-6 w-6 text-gray-800 dark:text-gray-200" />
                        </Button>
                      </SheetTrigger>

                      <SheetContent
                        side="left"
                        className="w-[250px] sm:w-[300px] bg-gray-100 dark:bg-gray-900 dark:border-gray-800"
                      >
                        <SheetHeader>
                          <div className="flex items-center gap-3">
                            <img
                              src="/icon.png"
                              alt="AutoSage Icon"
                              className="w-10 h-10 object-contain rounded-full shadow-sm"
                            />
                            <div className="flex flex-col items-start">
                              <h1 className="text-gray-950 dark:text-gray-100 font-semibold text-xl tracking-tight leading-tight">
                                Autosage
                              </h1>
                              <p className="text-sidebar-foreground text-xs font-medium">
                                Automation Hub
                              </p>
                            </div>
                          </div>
                        </SheetHeader>
                        <NavItems mobile />
                      </SheetContent>
                    </Sheet>
                  </div>

                  <div className="flex items-center gap-4">
                    <img
                      src="/logo.png"
                      alt="AutoSage Logo"
                      className="h-10 md:h-12 w-auto object-contain rounded-full"
                    />
                    <div>
                      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                        Workflows
                      </h1>
                      <p className="text-sm md:text-lg text-gray-500 dark:text-gray-400 mt-1 hidden md:block">
                        Manage, monitor, and execute your automation workflows.
                      </p>
                    </div>
                  </div>
                </div>

                <Button className="md:hidden bg-[#a768d0] hover:bg-[#9556bf] text-white shadow-md shadow-purple-500/20">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="w-full flex justify-between items-center">
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  <Button
                    variant={activeTab === "workflows" ? "default" : "outline"}
                    onClick={() => setActiveTab("workflows")}
                    className={
                      activeTab === "workflows"
                        ? "bg-[#a768d0] hover:bg-[#9556bf] text-white shadow-md"
                        : "bg-white dark:bg-gray-800"
                    }
                  >
                    All Workflows
                  </Button>
                  <Button
                    variant={activeTab === "http" ? "default" : "outline"}
                    onClick={() => setActiveTab("http")}
                    className={
                      activeTab === "http"
                        ? "bg-[#a768d0] hover:bg-[#9556bf] text-white shadow-md"
                        : "bg-white dark:bg-gray-800"
                    }
                  >
                    HTTP Webhooks
                  </Button>
                  <Button
                    variant={activeTab === "schedule" ? "default" : "outline"}
                    onClick={() => setActiveTab("schedule")}
                    className={
                      activeTab === "schedule"
                        ? "bg-[#a768d0] hover:bg-[#9556bf] text-white shadow-md"
                        : "bg-white dark:bg-gray-800"
                    }
                  >
                    Job Schedulers
                  </Button>
                </div>
                <Button
                  className="hidden md:flex bg-[#a768d0] hover:bg-[#9556bf] text-white shadow-md shadow-purple-500/20 transition-all hover:shadow-purple-500/40"
                  onClick={() => navigate("/workflow/new")}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Workflow
                </Button>
              </div>

              <div
                className={
                  activeTab === "workflows"
                    ? "flex flex-col md:flex-row md:items-center justify-between gap-4"
                    : "hidden"
                }
              >
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <Input
                    placeholder="Search workflows..."
                    className="pl-8 bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 dark:text-gray-200"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between md:justify-end gap-3">
                  <div className="flex items-center bg-white dark:bg-gray-800/50 rounded-lg p-1 border border-gray-200 dark:border-gray-700/50 shadow-sm">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewMode("grid")}
                      className={cn(
                        "h-8 w-8 p-0 rounded-md transition-all",
                        viewMode === "grid"
                          ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-800",
                      )}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewMode("list")}
                      className={cn(
                        "h-8 w-8 p-0 rounded-md transition-all",
                        viewMode === "list"
                          ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-800",
                      )}
                    >
                      <List className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {activeTab === "workflows" ? (
              <>
                {loading ? (
                  <div
                    className={cn(
                      "animate-in fade-in slide-in-from-bottom-4 duration-500",
                      viewMode === "grid"
                        ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
                        : "flex flex-col space-y-4",
                    )}
                  >
                    {Array.from({ length: 3 }).map((_, i) =>
                      viewMode === "grid" ? (
                        <WorkflowCardSkeleton key={i} />
                      ) : (
                        <WorkflowListItemSkeleton key={i} />
                      ),
                    )}
                  </div>
                ) : (
                  <div
                    className={cn(
                      "animate-in fade-in slide-in-from-bottom-4 duration-500",
                      viewMode === "grid"
                        ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
                        : "flex flex-col space-y-4",
                    )}
                  >
                    {filteredWorkflows.length > 0 ? (
                      filteredWorkflows.map((workflow) =>
                        viewMode === "grid" ? (
                          <WorkflowCard
                            key={workflow.id}
                            workflow={workflow}
                            onDelete={handleDeleteClick}
                          />
                        ) : (
                          <WorkflowListItem
                            key={workflow.id}
                            workflow={workflow}
                            onDelete={handleDeleteClick}
                          />
                        ),
                      )
                    ) : (
                      <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                        <div className="bg-gray-100 dark:bg-gray-800/50 p-4 rounded-full mb-4">
                          <Search className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          No workflows found
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                          We couldn't find any workflows matching "{searchQuery}
                          ". Try adjusting your search terms.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : activeTab === "http" ? (
              triggersLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                </div>
              ) : (
                <HttpTriggersTable
                  triggers={httpTriggers}
                  onToggle={handleToggleHttp}
                  onDelete={(id) => openDeleteTriggerModal(id, "http")}
                  itemsPerPage={10}
                />
              )
            ) : triggersLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              </div>
            ) : (
              <ScheduleTriggersTable
                triggers={scheduleTriggers}
                onToggle={handleToggleSchedule}
                onDelete={(id) => openDeleteTriggerModal(id, "schedule")}
                itemsPerPage={10}
              />
            )}
          </div>
        </main>
      </div>
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDeleteWorkflow}
        title="Delete Workflow?"
        description={`Are you sure you want to delete this workflow? This action cannot be undone.`}
        isLoading={loading}
      />

      <DeleteConfirmationModal
        isOpen={deleteTriggerModalOpen}
        onClose={() => setDeleteTriggerModalOpen(false)}
        onConfirm={confirmDeleteTrigger}
        title={`Delete ${triggerToDelete?.type === "http" ? "HTTP" : "Schedule"} Trigger?`}
        description={`Are you sure you want to delete this ${triggerToDelete?.type === "http" ? "HTTP" : "Schedule"} trigger? This action cannot be undone.`}
        isLoading={deletingTrigger}
      />
    </div>
  );
};

export default Workflows;
