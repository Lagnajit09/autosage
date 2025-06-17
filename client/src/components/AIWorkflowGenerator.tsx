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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

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
  const [workflowType, setWorkflowType] = useState("");
  const [generationType, setGenerationType] = useState("");
  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);

    try {
      let response;
      if (generationType === "complete") {
        console.log("Workflow + Scripts requested.");
        // Use master agent endpoint for Workflow + Scripts
        response = await fetch(
          "http://localhost:3001/api/generate-workflow-with-scripts",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt: prompt.trim(),
              // Script type optional
            }),
          }
        );
      } else {
        console.log("Workflow requested.");
        // Use original endpoint for Workflow only
        response = await fetch("http://localhost:3001/api/generate-workflow", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: prompt.trim(),
          }),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to generate workflow");
      }

      if (data.success && data.workflow) {
        // Save generated scripts to localStorage if present in workflow nodes
        const scriptFiles = [];
        for (const node of data.workflow.nodes || []) {
          if (node.data && node.data.scriptFile) {
            scriptFiles.push(node.data.scriptFile);
          }
        }
        if (scriptFiles.length > 0) {
          // Merge with existing script files in localStorage
          const savedFiles = localStorage.getItem("scriptFiles");
          const files: import("@/utils/types").ScriptFile[] = savedFiles
            ? (JSON.parse(savedFiles) as import("@/utils/types").ScriptFile[])
            : [];
          // Avoid duplicates by id
          for (const file of scriptFiles) {
            if (!files.some((f) => f.id === file.id)) {
              files.push(file);
            }
          }
          localStorage.setItem("scriptFiles", JSON.stringify(files));
        }
        onGenerate(data.workflow);
        setPrompt("");
        onClose();

        if (data.fallback) {
          console.warn(
            generationType === "complete"
              ? "Generated fallback workflow+scripts:"
              : "Generated fallback workflow:",
            data.message
          );
        }
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      console.error(
        generationType === "complete"
          ? "Error generating workflow+scripts:"
          : "Error generating workflow:",
        error
      );
      // setError(
      //   error instanceof Error ? error.message : "An unexpected error occurred"
      // );
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
            Genie Workflow
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

          {/* Generation Configuration */}
          <div className="flex items-center justify-between gap-2">
            <div className="w-1/2">
              <Select
                value={workflowType}
                onValueChange={(value) => setWorkflowType(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Workflow Type" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 text-white">
                  <SelectItem
                    value="complete"
                    className="hover:text-gray-800 hover:bg-slate-300"
                  >
                    New Workflow
                  </SelectItem>
                  <SelectItem
                    value="workflow"
                    className="hover:text-gray-800 hover:bg-slate-300"
                  >
                    Edit existing workflow
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-1/2">
              <Select
                value={generationType}
                onValueChange={(value) => setGenerationType(value)}
              >
                <SelectTrigger className="">
                  <SelectValue placeholder="Generation Type" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 text-white">
                  <SelectItem
                    value="complete"
                    className="hover:text-gray-800 hover:bg-slate-300"
                  >
                    Workflow + Scripts
                  </SelectItem>
                  <SelectItem
                    value="workflow"
                    className="hover:text-gray-800 hover:bg-slate-300"
                  >
                    Workflow
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/30">
            <p className="text-xs text-slate-400 mb-1">✨ AI Features:</p>
            <ul className="text-xs text-slate-500 space-y-1">
              <li>• Automatically generates nodes and connections</li>
              <li>• Suggests parameters and configurations</li>
              <li>• Creates decision logic and branching</li>
            </ul>
            <div className="mt-3 p-2 bg-slate-800/60 rounded text-xs text-blue-300 border border-blue-700/30">
              <b>Tip:</b> You can specify the script language for each step in
              your prompt.
              <br />
              <span className="text-slate-400">
                Example:{" "}
                <i>
                  "Check disk usage in Python, then archive logs using Bash, and
                  send an alert email."
                </i>
              </span>
              <br />
              If you don't specify a language, the AI will choose the most
              suitable one for each step. Mixed-language workflows are
              supported!
            </div>
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
