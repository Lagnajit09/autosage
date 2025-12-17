import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DecisionConfigProps } from "@/utils/types";
import { Label } from "@/components/ui/label";

export const DecisionConf: React.FC<DecisionConfigProps> = ({
  selectedNode,
  onUpdateNode,
  nodes,
  onCreateEdge,
}) => {
  const handleInputChange = (field: string, value: string) => {
    onUpdateNode(selectedNode.id, { [field]: value });
  };

  const handleTrueLabelChange = (nodeIds: string[]) => {
    if (onCreateEdge) {
      onUpdateNode(selectedNode.id, { trueLabel: nodeIds });
      nodeIds.forEach((targetId) => {
        onCreateEdge(selectedNode.id, targetId, "true");
      });
    }
  };

  const handleFalseLabelChange = (nodeIds: string[]) => {
    if (onCreateEdge) {
      onUpdateNode(selectedNode.id, { falseLabel: nodeIds });
      nodeIds.forEach((targetId) => {
        onCreateEdge(selectedNode.id, targetId, "false");
      });
    }
  };

  const getAvailableNodes = () => {
    return nodes.filter((node) => node.id !== selectedNode?.id);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
          Condition
        </Label>
        <input
          type="text"
          value={String(selectedNode.data?.condition || "")}
          onChange={(e) => handleInputChange("condition", e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none"
          placeholder="e.g., x > 0"
        />
      </div>

      <div>
        <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
          True Label (Node IDs)
        </Label>
        <Select
          onValueChange={(value) => handleTrueLabelChange([value])}
          value=""
        >
          <SelectTrigger className="w-full h-11 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 text-white dark:text-white">
            <SelectValue placeholder="Select node for true condition..." />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
            {getAvailableNodes().map((node) => (
              <SelectItem key={node.id} value={node.id} className="text-sm">
                {node.data?.label || node.id} ({node.type})
              </SelectItem>
            ))}
            {getAvailableNodes().length === 0 && (
              <SelectItem
                value="none"
                disabled
                className="text-sm text-slate-500 dark:text-slate-500"
              >
                No nodes available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {selectedNode.data?.trueLabel &&
          selectedNode.data.trueLabel.length > 0 && (
            <div className="mt-2 text-xs text-green-400 dark:text-green-400">
              Connected to: {selectedNode.data.trueLabel.join(", ")}
            </div>
          )}
      </div>

      <div>
        <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
          False Label (Node IDs)
        </Label>
        <Select
          onValueChange={(value) => handleFalseLabelChange([value])}
          value=""
        >
          <SelectTrigger className="w-full h-11 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 text-white dark:text-white">
            <SelectValue placeholder="Select node for false condition..." />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
            {getAvailableNodes().map((node) => (
              <SelectItem key={node.id} value={node.id} className="text-sm">
                {node.data?.label || node.id} ({node.type})
              </SelectItem>
            ))}
            {getAvailableNodes().length === 0 && (
              <SelectItem
                value="none"
                disabled
                className="text-sm text-slate-500 dark:text-slate-500"
              >
                No nodes available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {selectedNode.data?.falseLabel &&
          selectedNode.data.falseLabel.length > 0 && (
            <div className="mt-2 text-xs text-red-400 dark:text-red-400">
              Connected to: {selectedNode.data.falseLabel.join(", ")}
            </div>
          )}
      </div>
    </div>
  );
};
