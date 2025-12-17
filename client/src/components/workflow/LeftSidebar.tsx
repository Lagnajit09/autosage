import React from "react";
import {
  Play,
  Zap,
  Terminal,
  Globe,
  Mail,
  GitBranch,
  LucideIcon,
} from "lucide-react";
import { NodeData } from "@/utils/types";
import Logo from "../Logo";

interface LeftSidebarProps {
  onSaveWorkflow: () => void;
}

type DecisionType = "output-eval" | "condition" | "custom";

export const LeftSidebar: React.FC<LeftSidebarProps> = ({ onSaveWorkflow }) => {
  // Handle drag start - this is where we prepare data for the drop
  const onDragStart = (
    event: React.DragEvent,
    nodeType: string, // "trigger" or "action"
    nodeData: NodeData // The data we want to attach to the new node
  ) => {
    // Store the node type and data in the drag event
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.setData(
      "application/nodedata",
      JSON.stringify(nodeData)
    );
    event.dataTransfer.effectAllowed = "move";
  };

  // Define available triggers
  const triggers = [
    { type: "manual", label: "Manual Trigger", icon: Play, color: "emerald" },
    { type: "http", label: "HTTP Request", icon: Globe, color: "emerald" },
    { type: "event", label: "Event Trigger", icon: Zap, color: "emerald" },
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

        <div className="flex items-center mb-6 relative z-10">
          <div className="w-2 h-2 bg-gradient-to-r from-workflow-royal to-workflow-nebula dark:from-workflow-nebula dark:to-workflow-aurora rounded-full mr-3 animate-pulse-glow"></div>
          <h2 className="text-sm font-semibold text-text-light-accent dark:text-text-primary">
            Components
          </h2>
        </div>
      </div>

      {/* Triggers Section */}
      <div className="mb-6 relative z-10">
        <div className="text-xs text-node-trigger dark:text-text-primary mb-4 uppercase tracking-wider font-medium flex items-center">
          <div className="w-1 h-1 bg-node-trigger dark:bg-node-success rounded-full mr-2"></div>
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
                         hover:bg-purple-50 dark:hover:bg-purple-900/10
                         rounded-xl p-3 
                         border border-gray-200 dark:border-gray-800
                         hover:border-purple-200 dark:hover:border-purple-800
                         transition-all duration-200 ease-out
                         transform hover:scale-[1.02]"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg text-purple-600 dark:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-300">
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
        <div className="text-xs text-node-action dark:text-text-primary mb-4 uppercase tracking-wider font-medium flex items-center">
          <div className="w-1 h-1 bg-node-action dark:bg-ai-accent rounded-full mr-2"></div>
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
                         rounded-xl p-3 
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
        <div className="text-xs text-node-decision dark:text-text-primary mb-4 uppercase tracking-wider font-medium flex items-center">
          <div className="w-1 h-1 bg-node-decision dark:bg-status-pending rounded-full mr-2"></div>
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
                         rounded-xl p-3 
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
      <div className="mt-auto pt-4 border-t border-button-light-primary-bg dark:border-borders-primary/20 relative z-10">
        <button
          onClick={onSaveWorkflow}
          className="w-full bg-gradient-to-r from-button-light-primary-active to-button-light-primary-active dark:from-ai-primary/20 dark:via-ai-secondary/20 dark:to-ai-accent/20 
                   hover:from-button-light-primary-bg/90 hover:to-button-light-primary-bg/90 dark:hover:from-ai-primary/30 dark:hover:via-ai-secondary/30 dark:hover:to-ai-accent/30 
                   border border-ai-primary/40 hover:border-ai-secondary/60 dark:border-ai-primary/40 dark:hover:border-ai-secondary/60
                   text-text-secondary hover:text-text-primary dark:text-text-secondary dark:hover:text-text-primary 
                   text-sm py-3 px-4 rounded-xl
                   backdrop-blur-sm
                   hover:shadow-lg hover:shadow-ai-primary/20 dark:hover:shadow-ai-primary/20
                   transform hover:scale-[1.02] hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-gradient-to-r from-ai-secondary to-ai-accent dark:from-ai-secondary dark:to-ai-accent rounded-full animate-pulse"></div>
            <span className="font-medium">Save Workflow</span>
          </div>
        </button>
      </div>
    </div>
  );
};
