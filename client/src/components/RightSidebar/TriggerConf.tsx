import React from "react";
import { BaseConfigProps } from "@/utils/types";

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
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Trigger Type
        </label>
        <select
          value={String(selectedNode.data?.type || "schedule")}
          onChange={(e) => handleInputChange("type", e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-slate-700 border border-slate-600/50 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
        >
          <option value="schedule">Schedule</option>
          <option value="webhook">Webhook</option>
          <option value="file">File Watcher</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      {selectedNode.data?.type === "schedule" && (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Schedule (Cron Expression)
          </label>
          <input
            type="text"
            value={String(selectedNode.data?.schedule || "")}
            onChange={(e) => handleInputChange("schedule", e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
            placeholder="0 9 * * 1-5"
          />
          <p className="text-xs text-slate-500 mt-1">
            Example: "0 9 * * 1-5" runs at 9 AM on weekdays
          </p>
        </div>
      )}

      {selectedNode.data?.type === "webhook" && (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Webhook URL
          </label>
          <input
            type="url"
            value={String(selectedNode.data?.webhookUrl || "")}
            onChange={(e) => handleInputChange("webhookUrl", e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
            placeholder="https://api.example.com/webhook"
          />
        </div>
      )}

      {selectedNode.data?.type === "file" && (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Watch Path
          </label>
          <input
            type="text"
            value={String(selectedNode.data?.watchPath || "")}
            onChange={(e) => handleInputChange("watchPath", e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
            placeholder="/path/to/watch"
          />
        </div>
      )}
    </div>
  );
};
