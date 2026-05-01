import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { Loader2, Menu } from "lucide-react";

import LeftNav, { NavItems } from "@/components/LeftNav";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  listAllTriggers,
  updateHttpTriggerStatus,
  updateScheduleTriggerStatus,
  deleteGlobalHttpTrigger,
  deleteGlobalScheduleTrigger,
} from "@/lib/actions/triggers";
import { useNavigate } from "react-router-dom";
import { toast as toast2 } from "sonner";
import { DeleteConfirmationModal } from "@/components/DeleteConfirmationModal";
import { Plus } from "lucide-react";

// Sub-components
import { ScheduleTriggersTable } from "@/components/Triggers/ScheduleTriggersTable";
import { HttpTriggersTable } from "@/components/Triggers/HttpTriggersTable";

export default function Triggers() {
  const navigate = useNavigate();
  const { getToken, isSignedIn } = useAuth();
  const [httpTriggers, setHttpTriggers] = useState<any[]>([]);
  const [scheduleTriggers, setScheduleTriggers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [triggerToDelete, setTriggerToDelete] = useState<{
    id: string;
    type: "http" | "schedule";
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTriggers = async () => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      const res = await listAllTriggers(token);
      if (res?.success) {
        setHttpTriggers(res.data.http_triggers || []);
        setScheduleTriggers(res.data.schedule_triggers || []);
      } else {
        toast.error("Failed to load triggers");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error fetching triggers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTriggers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, getToken]);

  const handleToggleHttp = async (id: string, current: boolean) => {
    toast2.loading(`${!current ? "Enabling" : "Disabling"} trigger...`);
    try {
      const token = await getToken();
      const res = await updateHttpTriggerStatus(id, !current, token);
      if (res?.success) {
        toast.success(`HTTP Trigger ${!current ? "enabled" : "disabled"}`);
        setHttpTriggers((prev) =>
          prev.map((t) => (t.id === id ? { ...t, is_active: !current } : t)),
        );
      } else {
        toast.error("Failed to update trigger");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error updating trigger");
    } finally {
      toast2.dismiss();
    }
  };

  const handleToggleSchedule = async (id: string, current: boolean) => {
    toast2.loading(`${!current ? "Enabling" : "Disabling"} trigger...`);
    try {
      const token = await getToken();
      const res = await updateScheduleTriggerStatus(id, !current, token);
      if (res?.success) {
        toast.success(`Schedule Trigger ${!current ? "enabled" : "disabled"}`);
        setScheduleTriggers((prev) =>
          prev.map((t) => (t.id === id ? { ...t, is_active: !current } : t)),
        );
      } else {
        toast.error("Failed to update trigger");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error updating trigger");
    } finally {
      toast2.dismiss();
    }
  };

  const handleDeleteHttp = async (id: string) => {
    try {
      const token = await getToken();
      const res = await deleteGlobalHttpTrigger(id, token);
      if (res?.success || res?.status_code === 204) {
        toast.success("HTTP Trigger deleted");
        setHttpTriggers((prev) => prev.filter((t) => t.id !== id));
      } else {
        toast.error("Failed to delete trigger");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error deleting trigger");
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    try {
      const token = await getToken();
      const res = await deleteGlobalScheduleTrigger(id, token);
      if (res?.success || res?.status_code === 204) {
        toast.success("Schedule Trigger deleted");
        setScheduleTriggers((prev) => prev.filter((t) => t.id !== id));
      } else {
        toast.error("Failed to delete trigger");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error deleting trigger");
    }
  };

  const confirmDelete = async () => {
    if (!triggerToDelete) return;
    setDeleting(true);
    try {
      if (triggerToDelete.type === "http") {
        await handleDeleteHttp(triggerToDelete.id);
      } else {
        await handleDeleteSchedule(triggerToDelete.id);
      }
    } finally {
      setDeleting(false);
      setDeleteModalOpen(false);
      setTriggerToDelete(null);
    }
  };

  const openDeleteModal = (id: string, type: "http" | "schedule") => {
    setTriggerToDelete({ id, type });
    setDeleteModalOpen(true);
  };

  return (
    <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
      <LeftNav />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
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
                    className="h-10 md:h-12 w-auto rounded-full object-contain"
                  />
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                      Triggers
                    </h1>
                    <p className="text-sm md:text-lg text-gray-500 dark:text-gray-400 mt-1 hidden md:block">
                      Manage all HTTP triggers and Schedulers across your
                      workflows.
                    </p>
                  </div>
                </div>
              </div>
              <Button
                onClick={() => navigate("/workflow/new")}
                className="bg-[#a768d0] hover:bg-[#9556bf] text-white shadow-md shadow-purple-500/20 transition-all hover:shadow-purple-500/40"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Trigger
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              </div>
            ) : (
              <div className="space-y-12">
                <ScheduleTriggersTable
                  triggers={scheduleTriggers}
                  onToggle={handleToggleSchedule}
                  onDelete={(id) => openDeleteModal(id, "schedule")}
                />

                <HttpTriggersTable
                  triggers={httpTriggers}
                  onToggle={handleToggleHttp}
                  onDelete={(id) => openDeleteModal(id, "http")}
                />
              </div>
            )}
          </div>
        </main>
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title={`Delete ${triggerToDelete?.type === "http" ? "HTTP" : "Schedule"} Trigger?`}
        description={`Are you sure you want to delete this ${triggerToDelete?.type === "http" ? "HTTP" : "Schedule"} trigger? This action cannot be undone.`}
        isLoading={deleting}
      />
    </div>
  );
}
