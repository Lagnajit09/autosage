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

import { HTTPTrigger } from "./HTTPTrigger";
import { ScheduleTrigger } from "./ScheduleTrigger";
import { ManualTrigger } from "./ManualTrigger";

export const TriggerConf: React.FC<BaseConfigProps> = ({
  selectedNode,
  onUpdateNode,
  workflowId,
  nodes,
}) => {
  const handleInputChange = (field: string, value: string) => {
    onUpdateNode(selectedNode.id, { [field]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Trigger Type
        </Label>
        <Select
          value={selectedNode.data?.type || "manual"}
          onValueChange={(value) => handleInputChange("type", value)}
        >
          <SelectTrigger className="w-full h-11 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
            {" "}
            <SelectValue placeholder="Select trigger type" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
            <SelectItem value="manual">Manual Trigger</SelectItem>
            <SelectItem value="http">HTTP Webhook</SelectItem>
            <SelectItem value="schedule">Job Scheduler</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(!selectedNode.data?.type || selectedNode.data?.type === "manual") && (
        <ManualTrigger
          selectedNode={selectedNode}
          onUpdateNode={onUpdateNode}
          workflowId={workflowId}
          nodes={nodes}
        />
      )}

      {selectedNode.data?.type === "http" && (
        <HTTPTrigger
          selectedNode={selectedNode}
          onUpdateNode={onUpdateNode}
          workflowId={workflowId}
          nodes={nodes}
        />
      )}

      {selectedNode.data?.type === "schedule" && (
        <ScheduleTrigger
          selectedNode={selectedNode}
          onUpdateNode={onUpdateNode}
          workflowId={workflowId}
          nodes={nodes}
        />
      )}

      {selectedNode.data?.type === "webhook" && (
        <div>
          <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Webhook URL
          </Label>
          <Input
            type="url"
            value={String(selectedNode.data?.webhookUrl || "")}
            onChange={(e) => handleInputChange("webhookUrl", e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
            placeholder="https://api.example.com/webhook"
          />
        </div>
      )}

      {selectedNode.data?.type === "file" && (
        <div>
          <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Watch Path
          </Label>
          <input
            type="text"
            value={String(selectedNode.data?.watchPath || "")}
            onChange={(e) => handleInputChange("watchPath", e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
            placeholder="/path/to/watch"
          />
        </div>
      )}
    </div>
  );
};
