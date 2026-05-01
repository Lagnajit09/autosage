import React from "react";
import {
  Play,
  Zap,
  Terminal,
  Globe,
  Mail,
  GitBranch,
  LucideIcon,
  Clock,
} from "lucide-react";
import { NodeData } from "@/utils/types";
import Logo from "../Logo";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface LeftSidebarProps {
  onSaveWorkflow: () => void;
  workflowName: string;
  setWorkflowName: (name: string) => void;
}

type DecisionType = "output-eval" | "condition" | "custom";

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  onSaveWorkflow,
  workflowName,
  setWorkflowName,
}) => {
  // Handle drag start - this is where we prepare data for the drop
  const onDragStart = (
    event: React.DragEvent,
    nodeType: string, // "trigger" or "action"
    nodeData: NodeData, // The data we want to attach to the new node
  ) => {
    // Store the node type and data in the drag event
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.setData(
      "application/nodedata",
      JSON.stringify(nodeData),
    );
    event.dataTransfer.effectAllowed = "move";
  };

  // Define available triggers
  const triggers = [
    { type: "manual", label: "Manual Trigger", icon: Play, color: "emerald" },
    { type: "http", label: "HTTP Webhook", icon: Globe, color: "emerald" },
    { type: "schedule", label: "Job Scheduler", icon: Clock, color: "emerald" },
  ];

  // Define available actions
  const actions = [
    { type: "script", label: "Run Script", icon: Terminal, color: "blue" },
    { type: "email", label: "Send Email", icon: Mail, color: "blue" },
  ];

  // Define available decisions
  const decisions: Array<{
    type: DecisionType;
    label: string;
    icon: LucideIcon;
    color: string;
  }> = [
    {
      type: "condition",
      label: "Condition Check",
      icon: GitBranch,
      color: "yellow",
    },
  ];

  return (
    <div className="w-56 h-[98%] my-auto bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-4 flex flex-col relative rounded-3xl shadow-sm z-20 shrink-0 ml-2">
      {/* Header */}
      <div className="">
        <div className="flex items-center gap-2 mb-2">
          <Logo />
        </div>

        {/* Workflow Name */}
        <div className="mb-4">
          <Input
            placeholder="Workflow Name"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="w-full p-2 dark:text-gray-100 border-2 border-gray-300 dark:border-gray-800 rounded-md"
          />
        </div>

        <div className="flex items-center mb-4 relative z-10">
          <div className="w-2 h-2 bg-gradient-to-r from-workflow-royal to-workflow-nebula dark:from-workflow-nebula dark:to-workflow-aurora rounded-full mr-3 animate-pulse-glow"></div>
          <h2 className="text-sm font-semibold text-text-light-accent dark:text-text-primary">
            Components
          </h2>
        </div>
      </div>

      {/* Triggers Section */}
      <div className="mb-6 relative z-10">
        <div className="text-xs text-green-600 dark:text-green-400 mb-4 uppercase tracking-wider font-medium flex items-center">
          <div className="w-1 h-1 bg-green-600 dark:bg-green-400 rounded-full mr-2"></div>
          Triggers
        </div>
        <div className="space-y-3">
          {triggers.map((trigger) => {
            const Icon = trigger.icon;
            return (
              <div
                key={trigger.type}
                draggable
                onDragStart={(e) =>
                  onDragStart(e, "trigger", {
                    label: trigger.label,
                    type: trigger.type,
                  })
                }
                className="group cursor-grab active:cursor-grabbing 
                         bg-gray-50 dark:bg-gray-900 
                         hover:bg-green-50 dark:hover:bg-green-900/10
                         rounded-xl p-2 
                         border border-gray-200 dark:border-gray-800
                         hover:border-green-200 dark:hover:border-green-800
                         transition-all duration-200 ease-out
                         transform hover:scale-[1.02]"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg text-green-600 dark:text-green-400 group-hover:text-green-700 dark:group-hover:text-green-300">
                    <Icon size={14} />
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">
                    {trigger.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions Section */}
      <div className="mb-6 relative z-10">
        <div className="text-xs text-blue-600 dark:text-blue-400 mb-4 uppercase tracking-wider font-medium flex items-center">
          <div className="w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full mr-2"></div>
          Actions
        </div>
        <div className="space-y-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <div
                key={action.type}
                draggable
                onDragStart={(e) =>
                  onDragStart(e, "action", {
                    label: action.label,
                    type: action.type,
                  })
                }
                className="group cursor-grab active:cursor-grabbing 
                         bg-gray-50 dark:bg-gray-900 
                         hover:bg-blue-50 dark:hover:bg-blue-900/10
                         rounded-xl p-2 
                         border border-gray-200 dark:border-gray-800
                         hover:border-blue-200 dark:hover:border-blue-800
                         transition-all duration-200 ease-out
                         transform hover:scale-[1.02]"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300">
                    <Icon size={14} />
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">
                    {action.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Decisions Section */}
      <div className="mb-6 relative z-10">
        <div className="text-xs text-amber-600 dark:text-amber-400 mb-4 uppercase tracking-wider font-medium flex items-center">
          <div className="w-1 h-1 bg-amber-600 dark:bg-amber-400 rounded-full mr-2"></div>
          Decisions
        </div>
        <div className="space-y-3">
          {decisions.map((decision) => {
            const Icon = decision.icon;
            return (
              <div
                key={decision.type}
                draggable
                onDragStart={(e) =>
                  onDragStart(e, "decision", {
                    label: decision.label,
                  })
                }
                className="group cursor-grab active:cursor-grabbing 
                         bg-gray-50 dark:bg-gray-900 
                         hover:bg-amber-50 dark:hover:bg-amber-900/10
                         rounded-xl p-2 
                         border border-gray-200 dark:border-gray-800
                         hover:border-amber-200 dark:hover:border-amber-800
                         transition-all duration-200 ease-out
                         transform hover:scale-[1.02]"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/20 rounded-lg text-amber-600 dark:text-amber-400 group-hover:text-amber-700 dark:group-hover:text-amber-300">
                    <Icon size={14} />
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">
                    {decision.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save Button at bottom */}
      <div className="mt-auto pt-4 border-t border-gray-300 dark:border-borders-primary/20 relative z-10">
        <Button
          onClick={onSaveWorkflow}
          className="w-full bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 
                   text-white dark:text-white
                   text-sm py-3 px-4 rounded-xl
                   shadow-sm hover:shadow-md
                   transform hover:scale-[1.02] hover:-translate-y-0.5 transition-all duration-200"
        >
          <div className="flex items-center justify-center space-x-2">
            <span className="font-medium">Save Workflow</span>
          </div>
        </Button>
      </div>
    </div>
  );
};
