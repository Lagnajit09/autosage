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
      <DialogContent className="max-w-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100 flex items-center">
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
            <Label className="text-sm text-gray-700 dark:text-gray-300 mb-2 block">
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
                className="w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-500 rounded-md cursor-pointer transition-all duration-300 flex items-center justify-center space-x-3 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
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
              className="w-full h-64 px-3 py-3 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-500 focus:border-transparent resize-none font-mono"
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
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
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

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <li>
                JSON must contain valid nodes (id, type, position, data) and
                edges (id, source, target) arrays
              </li>
            </ul>
            <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              <b>Supported formats:</b> Standard workflow JSON with nodes and
              edges structure.
              <br />
              <span className="text-gray-500 dark:text-gray-400">
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
              className="flex-1 bg-purple-600 dark:bg-purple-600 hover:bg-purple-700 dark:hover:bg-purple-700 text-white dark:text-white"
            >
              {isValidating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
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
              className="border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
