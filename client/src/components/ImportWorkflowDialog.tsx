import React, { useState } from "react";
import { Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
      setError("");
      onClose();
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
        setError("");
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
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl bg-workflow-midnight/40 dark:bg-workflow-midnight/40 backdrop-blur-sm border border-slate-700 dark:border-slate-700 text-white dark:text-white">
        <DialogHeader>
          <DialogTitle className="text-white dark:text-white flex items-center">
            <FileText
              size={18}
              className="mr-2 text-purple-400 dark:text-purple-400"
            />
            Import Workflow
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload File Option */}
          <div>
            <Label className="text-sm text-slate-300 dark:text-slate-300 mb-2 block">
              Upload JSON File
            </Label>
            <div className="relative">
              <Input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
                id="json-file-upload"
              />
              <label
                htmlFor="json-file-upload"
                className="w-full px-4 py-3 border-2 border-dashed border-slate-600/50 dark:border-slate-600/50 hover:border-purple-500/50 dark:hover:border-purple-500/50 rounded-md cursor-pointer transition-all duration-300 flex items-center justify-center space-x-3 text-slate-400 dark:text-slate-400 hover:text-slate-300 dark:hover:text-slate-300 bg-bg-primary/20 dark:bg-bg-primary/20 hover:bg-bg-primary/30 dark:hover:bg-bg-primary/30"
              >
                <Upload
                  size={16}
                  className="text-purple-400 dark:text-purple-400"
                />
                <span className="text-sm">Click to upload JSON file</span>
              </label>
            </div>
          </div>

          {/* JSON Input */}
          <div>
            <Label className="text-sm text-slate-300 dark:text-slate-300 mb-2 block">
              Paste JSON
            </Label>
            <textarea
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value);
                setError("");
              }}
              className="w-full h-64 px-3 py-3 text-sm bg-bg-primary/20 dark:bg-bg-primary/20 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 dark:focus:ring-purple-500/50 focus:border-transparent resize-none font-mono"
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
            <div className="bg-red-900/30 dark:bg-red-900/30 border border-red-500/30 dark:border-red-500/30 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 text-red-400 dark:text-red-400">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-red-300 dark:text-red-300">
                  {error}
                </p>
              </div>
            </div>
          )}

          <div className="bg-slate-700/30 dark:bg-slate-700/30 rounded-lg p-3 border border-slate-600/30 dark:border-slate-600/30">
            <p className="text-xs text-slate-400 dark:text-slate-400 mb-1">
              📁 Import Tips:
            </p>
            <ul className="text-xs text-slate-500 dark:text-slate-500 space-y-1">
              <li>• JSON must contain valid nodes and edges arrays</li>
              <li>• Each node needs id, type, and position properties</li>
              <li>• Each edge needs id, source, and target properties</li>
            </ul>
            <div className="mt-3 p-2 bg-slate-800/60 dark:bg-slate-800/60 rounded text-xs text-blue-300 dark:text-blue-300 border border-blue-700/30 dark:border-blue-700/30">
              <b>Supported formats:</b> Standard workflow JSON with nodes and
              edges structure.
              <br />
              <span className="text-slate-400 dark:text-slate-400">
                <i>
                  Upload a .json file or paste the JSON content directly into
                  the text area above.
                </i>
              </span>
            </div>
          </div>

          <div className="flex space-x-3">
            <Button
              onClick={validateAndImport}
              disabled={!jsonInput.trim() || isValidating}
              className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-600 dark:to-blue-600 hover:from-purple-700 hover:to-blue-700 dark:hover:from-purple-700 dark:hover:to-blue-700 text-white dark:text-white"
            >
              {isValidating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 dark:border-white/30 border-t-white dark:border-t-white rounded-full animate-spin mr-2" />
                  Validating...
                </>
              ) : (
                <>
                  <FileText size={14} className="mr-2" />
                  Import Workflow
                </>
              )}
            </Button>
            <Button
              onClick={handleClose}
              variant="outline"
              className="border-slate-600 dark:border-slate-600 text-slate-800 dark:text-slate-800 hover:bg-slate-300 dark:hover:bg-slate-300"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
