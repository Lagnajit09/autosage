import React, { useState } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { WorkflowData } from "@/utils/types";

interface AIWorkflowGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (workflowData: WorkflowData) => void;
}

export const AIWorkflowGenerator: React.FC<AIWorkflowGeneratorProps> = ({
  isOpen,
  onClose,
  onGenerate,
}) => {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);

    try {
      // Mock AI generation - replace with actual AI API call
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Mock generated workflow based on prompt
      const mockWorkflow: WorkflowData = {
        nodes: [
          {
            id: `trigger-${Date.now()}`,
            type: "trigger",
            position: { x: 100, y: 100 },
            data: {
              label: "Start",
              description: "Generated workflow trigger",
              type: "manual",
              parameters: [],
            },
          },
          {
            id: `action-${Date.now() + 1}`,
            type: "action",
            position: { x: 300, y: 100 },
            data: {
              label: "Process Data",
              description: `Action based on: ${prompt}`,
              type: "script",
              scriptType: "Python Script",
              executionMode: "local",
              parameters: [
                {
                  id: `param-${Date.now()}`,
                  name: "input_data",
                  type: "string",
                  description: "Input data for processing",
                },
              ],
            },
          },
        ],
        edges: [
          {
            id: `edge-${Date.now()}`,
            source: `trigger-${Date.now()}`,
            target: `action-${Date.now() + 1}`,
            type: "smoothstep",
            style: { stroke: "#64748b", strokeWidth: 2 },
          },
        ],
      };

      onGenerate(mockWorkflow);
      setPrompt("");
      onClose();
    } catch (error) {
      console.error("Error generating workflow:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-slate-800 border border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center">
            <Wand2 size={18} className="mr-2 text-purple-400" />
            AI Workflow Generator
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label
              htmlFor="workflow-prompt"
              className="text-sm text-slate-300 mb-2 block"
            >
              Describe your workflow
            </Label>
            <textarea
              id="workflow-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Create a workflow that monitors server health, checks disk usage, and sends alerts if usage is above 80%"
              className="w-full px-3 py-3 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent resize-none"
              rows={4}
            />
          </div>

          <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/30">
            <p className="text-xs text-slate-400 mb-1">✨ AI Features:</p>
            <ul className="text-xs text-slate-500 space-y-1">
              <li>• Automatically generates nodes and connections</li>
              <li>• Suggests parameters and configurations</li>
              <li>• Creates decision logic and branching</li>
            </ul>
          </div>

          <div className="flex space-x-3">
            <Button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 size={14} className="mr-2" />
                  Generate Workflow
                </>
              )}
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="border-slate-600 text-slate-800 hover:bg-slate-300"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
