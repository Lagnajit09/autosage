import React, { useState } from "react";
import { X, Upload, FileText } from "lucide-react";
import { Button } from "./ui/button";
import { WorkflowData, Node, Edge } from "@/utils/types";

interface ImportWorkflowDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (workflowData: WorkflowData) => void;
}

export const ImportWorkflowDialog: React.FC<ImportWorkflowDialogProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [jsonInput, setJsonInput] = useState("");
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  if (!isOpen) return null;

  const validateAndImport = () => {
    setIsValidating(true);
    setError("");

    try {
      const workflowData = JSON.parse(jsonInput);

      // Basic validation
      if (!workflowData || typeof workflowData !== "object") {
        throw new Error("Invalid JSON format");
      }

      // Check for required properties
      if (
        !Array.isArray(workflowData.nodes) &&
        !Array.isArray(workflowData.edges)
      ) {
        throw new Error("Workflow must contain nodes and edges arrays");
      }

      // Validate node structure
      if (workflowData.nodes) {
        workflowData.nodes.forEach((node: Node, index: number) => {
          if (!node.id || !node.type || !node.position) {
            throw new Error(
              `Node ${
                index + 1
              } is missing required properties (id, type, position)`
            );
          }
        });
      }

      // Validate edge structure
      if (workflowData.edges) {
        workflowData.edges.forEach((edge: Edge, index: number) => {
          if (!edge.id || !edge.source || !edge.target) {
            throw new Error(
              `Edge ${
                index + 1
              } is missing required properties (id, source, target)`
            );
          }
        });
      }

      onImport(workflowData);
      setJsonInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON format");
    } finally {
      setIsValidating(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setJsonInput(content);
      };
      reader.readAsText(file);
    }
  };

  const handleClose = () => {
    setJsonInput("");
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
              <FileText size={16} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Import Workflow
              </h2>
              <p className="text-sm text-slate-400">
                Paste JSON or upload a file to create a visual workflow
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors duration-200 text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Upload File Option */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">
              Upload JSON File
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
                id="json-file-upload"
              />
              <label
                htmlFor="json-file-upload"
                className="w-full px-4 py-3 border-2 border-dashed border-slate-600/50 hover:border-slate-500/50 rounded-lg cursor-pointer transition-colors duration-200 flex items-center justify-center space-x-2 text-slate-400 hover:text-slate-300"
              >
                <Upload size={18} />
                <span className="text-sm">Click to upload JSON file</span>
              </label>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center">
            <div className="flex-1 h-px bg-slate-700/50"></div>
            <span className="px-3 text-xs text-slate-500 uppercase tracking-wider">
              OR
            </span>
            <div className="flex-1 h-px bg-slate-700/50"></div>
          </div>

          {/* JSON Input */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">
              Paste JSON
            </label>
            <textarea
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value);
                setError("");
              }}
              className="w-full h-64 px-4 py-3 text-sm bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 font-mono resize-none"
              placeholder={`{
  "nodes": [
    {
      "id": "trigger-1",
      "type": "trigger",
      "position": { "x": 100, "y": 100 },
      "data": { "label": "Manual Trigger" }
    }
  ],
  "edges": []
}`}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-600/20 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-700/50">
            <Button
              onClick={handleClose}
              variant="outline"
              className="bg-slate-700/30 hover:bg-slate-600/30 border-slate-600/50 text-slate-300 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={validateAndImport}
              disabled={!jsonInput.trim() || isValidating}
              className="bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 hover:text-blue-300"
            >
              {isValidating ? "Validating..." : "Import Workflow"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
