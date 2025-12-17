import React from "react";
import { BaseConfigProps } from "@/utils/types";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export const TriggerConf: React.FC<BaseConfigProps> = ({
  selectedNode,
  onUpdateNode,
}) => {
  const handleInputChange = (field: string, value: string) => {
    onUpdateNode(selectedNode.id, { [field]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
          Trigger Type
        </Label>
        <Select
          value={selectedNode.data?.type || "schedule"}
          onValueChange={(value) => handleInputChange("type", value)}
        >
          <SelectTrigger className="w-full h-11 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 text-white dark:text-white">
            {" "}
            <SelectValue placeholder="Select trigger type" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
            <SelectItem value="schedule">Schedule</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="file">File Watcher</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedNode.data?.type === "schedule" && (
        <div>
          <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
            Schedule (Cron Expression)
          </Label>
          <Input
            type="text"
            value={String(selectedNode.data?.schedule || "")}
            onChange={(e) => handleInputChange("schedule", e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none"
            placeholder="0 9 * * 1-5"
          />
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
            Example: "0 9 * * 1-5" runs at 9 AM on weekdays
          </p>
        </div>
      )}

      {selectedNode.data?.type === "webhook" && (
        <div>
          <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
            Webhook URL
          </Label>
          <Input
            type="url"
            value={String(selectedNode.data?.webhookUrl || "")}
            onChange={(e) => handleInputChange("webhookUrl", e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none"
            placeholder="https://api.example.com/webhook"
          />
        </div>
      )}

      {selectedNode.data?.type === "file" && (
        <div>
          <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
            Watch Path
          </Label>
          <input
            type="text"
            value={String(selectedNode.data?.watchPath || "")}
            onChange={(e) => handleInputChange("watchPath", e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none"
            placeholder="/path/to/watch"
          />
        </div>
      )}
    </div>
  );
};
