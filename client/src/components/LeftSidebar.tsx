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
    <div className="w-56 bg-bg-primary/30 backdrop-blur-xl border-r border-borders-primary/30 p-4 flex flex-col h-full relative">
      {/* Ambient glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-workflow-royal/10 via-transparent to-workflow-nebula/5 pointer-events-none" />

      {/* Header */}
      <div className="flex items-center mb-6 relative z-10">
        <div className="w-2 h-2 bg-gradient-to-r from-workflow-nebula to-workflow-aurora rounded-full mr-3 animate-pulse-glow"></div>
        <h2 className="text-sm font-semibold text-text-primary">Components</h2>
      </div>

      {/* Triggers Section */}
      <div className="mb-6 relative z-10">
        <div className="text-xs text-text-tertiary mb-4 uppercase tracking-wider font-medium flex items-center">
          <div className="w-1 h-1 bg-node-success rounded-full mr-2"></div>
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
                         bg-gradient-to-r from-bg-secondary/40 to-bg-tertiary/20 
                         hover:from-node-success/20 hover:to-node-success/10
                         backdrop-blur-sm rounded-xl p-3 
                         border border-borders-secondary/40 
                         hover:border-node-success/50 hover:shadow-lg
                         hover:shadow-node-success/20
                         transition-all duration-300 ease-out
                         transform hover:scale-[1.02] hover:-translate-y-0.5"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className="p-2 bg-gradient-to-br from-node-success/30 to-node-success/20 
                                rounded-lg group-hover:from-node-success/40 group-hover:to-node-success/30 
                                transition-all duration-300 group-hover:scale-110"
                  >
                    <Icon
                      size={14}
                      className="text-node-success group-hover:text-white transition-colors duration-300"
                    />
                  </div>
                  <span className="text-sm text-text-secondary group-hover:text-text-primary font-medium transition-colors duration-300">
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
        <div className="text-xs text-text-tertiary mb-4 uppercase tracking-wider font-medium flex items-center">
          <div className="w-1 h-1 bg-ai-accent rounded-full mr-2"></div>
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
                         bg-gradient-to-r from-bg-secondary/40 to-bg-tertiary/20 
                         hover:from-workflow-midnight/20 hover:to-workflow-midnight/10
                         backdrop-blur-sm rounded-xl p-3 
                         border border-borders-secondary/40 
                         hover:border-node-action_border/90 hover:shadow-lg
                         hover:shadow-ai-primary/20
                         transition-all duration-300 ease-out
                         transform hover:scale-[1.02] hover:-translate-y-0.5"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className="p-2 bg-gradient-to-br from-ai-primary/30 to-ai-secondary/20 
                                rounded-lg group-hover:from-ai-primary/40 group-hover:to-ai-secondary/30 
                                transition-all duration-300 group-hover:scale-110"
                  >
                    <Icon
                      size={14}
                      className="text-ai-accent group-hover:text-text-primary transition-colors duration-300"
                    />
                  </div>
                  <span className="text-sm text-text-secondary group-hover:text-text-primary font-medium transition-colors duration-300">
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
        <div className="text-xs text-text-tertiary mb-4 uppercase tracking-wider font-medium flex items-center">
          <div className="w-1 h-1 bg-status-pending rounded-full mr-2"></div>
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
                         bg-gradient-to-r from-bg-secondary/40 to-bg-tertiary/20 
                         hover:from-status-pending/20 hover:to-status-pending/10
                         backdrop-blur-sm rounded-xl p-3 
                         border border-borders-secondary/40 
                         hover:border-status-pending/50 hover:shadow-lg
                         hover:shadow-status-pending/20
                         transition-all duration-300 ease-out
                         transform hover:scale-[1.02] hover:-translate-y-0.5"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className="p-2 bg-gradient-to-br from-status-pending/30 to-status-pending/20 
                                rounded-lg group-hover:from-status-pending/40 group-hover:to-status-pending/30 
                                transition-all duration-300 group-hover:scale-110"
                  >
                    <Icon
                      size={14}
                      className="text-status-pending group-hover:text-text-primary transition-colors duration-300"
                    />
                  </div>
                  <span className="text-sm text-text-secondary group-hover:text-text-primary font-medium transition-colors duration-300">
                    {decision.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save Button at bottom */}
      <div className="mt-auto pt-4 border-t border-borders-primary/20 relative z-10">
        <button
          onClick={onSaveWorkflow}
          className="w-full bg-gradient-to-r from-ai-primary/20 via-ai-secondary/20 to-ai-accent/20 
                   hover:from-ai-primary/30 hover:via-ai-secondary/30 hover:to-ai-accent/30 
                   border border-ai-primary/40 hover:border-ai-secondary/60
                   text-text-secondary hover:text-text-primary 
                   transition-all duration-300 ease-out
                   text-sm py-3 px-4 rounded-xl
                   backdrop-blur-sm
                   hover:shadow-lg hover:shadow-ai-primary/20
                   transform hover:scale-[1.02] hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-gradient-to-r from-ai-secondary to-ai-accent rounded-full animate-pulse"></div>
            <span className="font-medium">Save Workflow</span>
          </div>
        </button>
      </div>
    </div>
  );
};
