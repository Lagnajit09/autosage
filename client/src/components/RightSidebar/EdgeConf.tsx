import React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EdgeConfigProps } from "@/utils/types";

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
      <div className="bg-slate-700/30 backdrop-blur-sm rounded-lg p-4 border border-slate-600/30">
        <div className="text-xs text-slate-400 mb-1">Edge Type</div>
        <div className="text-sm text-white font-medium capitalize mb-2">
          Connection
        </div>
        <div className="text-xs text-slate-500">ID: {selectedEdge.id}</div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Label
          </label>
          <input
            type="text"
            value={selectedEdge.label || ""}
            onChange={(e) => handleEdgeUpdate("label", e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
            placeholder="Enter edge label"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Type
          </label>
          <select
            value={selectedEdge.type || "default"}
            onChange={(e) => handleEdgeUpdate("type", e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-slate-700 border border-slate-600/50 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
          >
            <option value="default">Default</option>
            <option value="straight">Straight</option>
            <option value="step">Step</option>
            <option value="smoothstep">Smooth Step</option>
            <option value="bezier">Bezier</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Stroke Color
          </label>
          <div className="flex space-x-2">
            <input
              type="color"
              value={selectedEdge.style?.stroke || "#64748b"}
              onChange={(e) => handleEdgeUpdate("stroke", e.target.value)}
              className="w-12 h-10 rounded border border-slate-600"
            />
            <input
              type="text"
              value={selectedEdge.style?.stroke || "#64748b"}
              onChange={(e) => handleEdgeUpdate("stroke", e.target.value)}
              className="flex-1 px-3 py-2 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="#64748b"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Stroke Width
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={selectedEdge.style?.strokeWidth || 2}
            onChange={(e) =>
              handleEdgeUpdate("strokeWidth", Number(e.target.value))
            }
            className="w-full"
          />
          <div className="text-center text-sm text-slate-400 mt-1">
            {selectedEdge.style?.strokeWidth || 2}px
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-slate-600/30">
        <Button
          onClick={handleDeleteEdge}
          variant="destructive"
          className="w-full text-sm py-2.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 hover:text-red-300 transition-all duration-200"
        >
          <Trash2 size={14} className="mr-2" />
          Delete Edge
        </Button>
      </div>
    </>
  );
};
