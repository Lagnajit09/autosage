import React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EdgeConfigProps } from "@/utils/types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export const EdgeConf: React.FC<EdgeConfigProps> = ({
  selectedEdge,
  onUpdateEdge,
  onDeleteEdge,
}) => {
  const handleEdgeUpdate = (field: string, value: string | number) => {
    if (field === "stroke" || field === "strokeWidth") {
      onUpdateEdge(selectedEdge.id, {
        style: {
          ...selectedEdge.style,
          [field]: value,
        },
      });
    } else {
      onUpdateEdge(selectedEdge.id, { [field]: value });
    }
  };

  const handleDeleteEdge = () => {
    onDeleteEdge(selectedEdge.id);
  };

  return (
    <>
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <div className="text-xs text-slate-400 dark:text-slate-400 mb-1">
          Edge Type
        </div>
        <div className="text-sm text-white dark:text-white font-medium capitalize mb-2">
          Connection
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-500">
          ID: {selectedEdge.id}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
            Label
          </Label>
          <Input
            type="text"
            value={selectedEdge.label || ""}
            onChange={(e) => handleEdgeUpdate("label", e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none"
            placeholder="Enter edge label"
          />
        </div>

        <div>
          <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
            Type
          </Label>
          <Select
            value={selectedEdge.type || "default"}
            onValueChange={(value) => handleEdgeUpdate("type", value)}
          >
            <SelectTrigger className="w-full h-11 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 text-white dark:text-white">
              <SelectValue placeholder="Select edge type" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="straight">Straight</SelectItem>
              <SelectItem value="step">Step</SelectItem>
              <SelectItem value="smoothstep">Smooth Step</SelectItem>
              <SelectItem value="bezier">Bezier</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
            Stroke Color
          </Label>
          <div className="flex space-x-2">
            <Input
              type="color"
              value={selectedEdge.style?.stroke || "#64748b"}
              onChange={(e) => handleEdgeUpdate("stroke", e.target.value)}
              className="w-12 h-10 rounded border border-slate-600 dark:border-slate-600"
            />
            <Input
              type="text"
              value={selectedEdge.style?.stroke || "#64748b"}
              onChange={(e) => handleEdgeUpdate("stroke", e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none"
              placeholder="#64748b"
            />
          </div>
        </div>

        <div>
          <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
            Stroke Width
          </Label>
          <div className="flex items-center space-x-3">
            <Input
              type="range"
              min="1"
              max="10"
              value={selectedEdge.style?.strokeWidth || 2}
              onChange={(e) =>
                handleEdgeUpdate("strokeWidth", Number(e.target.value))
              }
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 accent-blue-600 dark:accent-blue-600"
            />
            <div className="text-sm text-slate-400 dark:text-slate-400 w-10 text-center">
              {selectedEdge.style?.strokeWidth || 2}px
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-slate-600/30 dark:border-slate-600/30">
        <Button
          onClick={handleDeleteEdge}
          variant="destructive"
          className="w-full text-sm py-2.5 bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/30 dark:hover:bg-red-600/30 border border-red-500/30 dark:border-red-500/30 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 transition-all duration-200"
        >
          <Trash2 size={14} className="mr-2" />
          Delete Edge
        </Button>
      </div>
    </>
  );
};
