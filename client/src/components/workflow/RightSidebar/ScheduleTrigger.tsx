import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import cronstrue from "cronstrue";

import { BaseConfigProps } from "@/utils/types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  upsertScheduleTrigger,
  getScheduleTrigger,
  deleteScheduleTrigger,
  updateScheduleTriggerStatus,
  ScheduleTriggerInfoResponse,
} from "@/lib/actions/triggers";

export const ScheduleTrigger: React.FC<BaseConfigProps> = ({
  selectedNode,
  onUpdateNode,
  workflowId,
}) => {
  const { getToken, isSignedIn } = useAuth();
  const [info, setInfo] = useState<ScheduleTriggerInfoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [cronExpression, setCronExpression] = useState(
    String(selectedNode.data?.schedule || "0 9 * * 1-5"),
  );

  const cronDescription = useMemo(() => {
    try {
      return cronstrue.toString(cronExpression);
    } catch (e) {
      return null;
    }
  }, [cronExpression]);

  const refresh = useCallback(async () => {
    if (!workflowId || !isSignedIn) return;
    setLoading(true);
    try {
      const token = await getToken();
      const response = await getScheduleTrigger(
        workflowId,
        selectedNode.id,
        token,
      );
      if (response?.success && response.data) {
        setInfo(response.data);
        if (response.data.cron_expression !== cronExpression) {
          setCronExpression(response.data.cron_expression);
          onUpdateNode(selectedNode.id, {
            schedule: response.data.cron_expression,
            scheduleConfigured: true,
          });
        } else {
          onUpdateNode(selectedNode.id, { scheduleConfigured: true });
        }
      } else {
        setInfo(null);
        onUpdateNode(selectedNode.id, { scheduleConfigured: false });
      }
    } catch {
      setInfo(null);
      onUpdateNode(selectedNode.id, { scheduleConfigured: false });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, isSignedIn, getToken, selectedNode.id, onUpdateNode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSave = async () => {
    if (!workflowId) {
      toast.error("Save the workflow first, then save the schedule trigger.");
      return;
    }
    setWorking(true);
    try {
      const token = await getToken();
      const response = await upsertScheduleTrigger(
        workflowId,
        selectedNode.id,
        cronExpression,
        token,
      );
      if (!response?.success) {
        throw new Error(response?.message || "Failed to save schedule trigger");
      }
      setInfo(response.data);
      onUpdateNode(selectedNode.id, {
        schedule: cronExpression,
        scheduleConfigured: true,
      });
      toast.success("Schedule trigger saved.");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to save schedule trigger",
      );
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!workflowId) return;
    setWorking(true);
    try {
      const token = await getToken();
      const response = await deleteScheduleTrigger(
        workflowId,
        selectedNode.id,
        token,
      );
      if (response?.success || response?.status_code === 204) {
        setInfo(null);
        onUpdateNode(selectedNode.id, { scheduleConfigured: false });
        toast.success("Schedule trigger configuration deleted.");
      } else {
        throw new Error(
          response?.message || "Failed to delete schedule trigger",
        );
      }
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to delete schedule trigger",
      );
    } finally {
      setWorking(false);
    }
  };

  const handleToggleActive = async () => {
    if (!info || working) return;
    setWorking(true);
    try {
      const token = await getToken();
      const nextActive = !info.is_active;
      const response = await updateScheduleTriggerStatus(
        info.id,
        nextActive,
        token,
      );
      if (response?.success) {
        setInfo({ ...info, is_active: nextActive });
        toast.success(nextActive ? "Schedule enabled" : "Schedule disabled");
      } else {
        throw new Error(response?.message || "Failed to update status");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        Configure a cron schedule for this workflow. The workflow must be saved
        before the schedule can be activated.
      </div>
      {!workflowId && (
        <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md border border-amber-200 dark:border-amber-900/50">
          <p className="text-xs text-amber-800 dark:text-amber-400">
            Save the workflow first to enable schedule configuration.
          </p>
        </div>
      )}

      <div>
        <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Schedule (Cron Expression)
        </Label>
        <Input
          type="text"
          value={cronExpression}
          onChange={(e) => {
            setCronExpression(e.target.value);
            onUpdateNode(selectedNode.id, { schedule: e.target.value });
          }}
          className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none font-mono"
          placeholder="* * * * *"
        />
        {cronDescription ? (
          <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 font-medium">
            {cronDescription}
          </p>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Format: "minute hour day_of_month month_of_year day_of_week". E.g.,
            "0 9 * * 1-5" runs at 9 AM UTC on weekdays.
          </p>
        )}
      </div>

      <Button
        onClick={handleSave}
        disabled={working || !workflowId || loading}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
      >
        {working ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Save Schedule
      </Button>

      {info && (
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg">
          <div className="space-y-0.5">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Schedule Status
            </div>
            <div className="text-[10px] text-gray-500">
              {info.is_active ? "Running on schedule" : "Schedule paused"}
            </div>
          </div>
          <Button
            variant={info.is_active ? "outline" : "default"}
            size="sm"
            onClick={handleToggleActive}
            disabled={working}
            className={`h-8 px-3 text-xs ${
              info.is_active
                ? "text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                : "bg-green-600 hover:bg-green-700 text-white border-none"
            }`}
          >
            {working ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : info.is_active ? (
              "Disable"
            ) : (
              "Enable"
            )}
          </Button>
        </div>
      )}

      {info && !showDeleteConfirm && (
        <Button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={working || !workflowId}
          variant="outline"
          className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-900/50 mt-2"
        >
          Delete Configuration
        </Button>
      )}

      {info && showDeleteConfirm && (
        <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 rounded-md">
          <p className="text-xs text-red-800 dark:text-red-300 mb-3 font-medium">
            Are you sure you want to delete this schedule trigger configuration?
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={working}
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs bg-white dark:bg-gray-900"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={working}
              size="sm"
              className="flex-1 h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
            >
              {working ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Delete
            </Button>
          </div>
        </div>
      )}

      {info && (
        <div className="pt-2 space-y-2 border-t border-gray-200 dark:border-gray-800 mt-4 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex justify-between">
            <span>Status:</span>
            <span
              className={
                info.is_active
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }
            >
              {info.is_active ? "Active" : "Disabled"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Timezone:</span>
            <span>{info.timezone}</span>
          </div>
          {info.last_triggered_at && (
            <div className="flex justify-between">
              <span>Last Triggered:</span>
              <span>{new Date(info.last_triggered_at).toLocaleString()}</span>
            </div>
          )}
          {info.last_error && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded">
              <span className="font-semibold block mb-1">Last Error:</span>
              {info.last_error}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
