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

  // const nodeItems = [
  //   {
  //     type: "trigger",
  //     icon: Play,
  //     label: "Trigger",
  //     description: "Start workflow execution",
  //     color: "text-emerald-400",
  //     bgColor: "bg-emerald-500/20",
  //     data: { label: "New Trigger", type: "manual" },
  //   },
  //   {
  //     type: "action",
  //     icon: Terminal,
  //     label: "Action",
  //     description: "Execute scripts and tasks",
  //     color: "text-blue-400",
  //     bgColor: "bg-blue-500/20",
  //     data: { label: "New Action", type: "script" },
  //   },
  //   {
  //     type: "decision",
  //     icon: GitBranch,
  //     label: "Decision",
  //     description: "Branch workflow logic",
  //     color: "text-yellow-400",
  //     bgColor: "bg-yellow-500/20",
  //     data: { label: "New Decision", conditionType: "output-eval" },
  //   },
  // ];

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
    <div className="w-56 bg-slate-800/60 backdrop-blur-xl border-r border-slate-700/50 p-4 overflow-y-auto flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center mb-5">
        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></div>
        <h2 className="text-sm font-semibold text-white">Components</h2>
      </div>
      {/* Triggers Section */}
      <div className="mb-5">
        <div className="text-xs text-slate-400 mb-3 uppercase tracking-wider font-medium">
          Triggers
        </div>
        <div className="space-y-2">
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
                className="group cursor-grab active:cursor-grabbing bg-slate-700/30 backdrop-blur-sm rounded-lg p-3 border border-slate-600/30 hover:border-emerald-500/50 hover:bg-slate-600/40 transition-all duration-200"
              >
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-emerald-500/20 rounded-md group-hover:bg-emerald-500/30 transition-colors duration-200">
                    <Icon size={12} className="text-emerald-400" />
                  </div>
                  <span className="text-xs text-slate-300 group-hover:text-white font-medium">
                    {trigger.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Actions Section */}
      <div className="mb-5">
        <div className="text-xs text-slate-400 mb-3 uppercase tracking-wider font-medium">
          Actions
        </div>
        <div className="space-y-2">
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
                className="group cursor-grab active:cursor-grabbing bg-slate-700/30 backdrop-blur-sm rounded-lg p-3 border border-slate-600/30 hover:border-blue-500/50 hover:bg-slate-600/40 transition-all duration-200"
              >
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-blue-500/20 rounded-md group-hover:bg-blue-500/30 transition-colors duration-200">
                    <Icon size={12} className="text-blue-400" />
                  </div>
                  <span className="text-xs text-slate-300 group-hover:text-white font-medium">
                    {action.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Decisions Section */}
      <div className="mb-4">
        <div className="text-xs text-slate-400 mb-2 uppercase tracking-wider font-medium">
          Decisions
        </div>
        <div className="space-y-2">
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
                className="group cursor-grab active:cursor-grabbing bg-slate-700/30 backdrop-blur-sm rounded-lg p-2 border border-slate-600/30 hover:border-yellow-500/50 hover:bg-slate-600/40 transition-all duration-200"
              >
                <div className="flex items-center space-x-2">
                  <div className="p-1 bg-yellow-500/20 rounded-md group-hover:bg-yellow-500/30 transition-colors duration-200">
                    <Icon size={10} className="text-yellow-400" />
                  </div>
                  <span className="text-xs text-slate-300 group-hover:text-white font-medium">
                    {decision.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Save Button at bottom */}
      <div className="mt-auto pt-4 border-t border-slate-600/30">
        <button
          onClick={onSaveWorkflow}
          className="w-full bg-gradient-to-r from-blue-600/20 to-purple-600/20 hover:from-blue-600/30 hover:to-purple-600/30 border border-blue-500/30 text-blue-300 hover:text-blue-200 transition-all duration-200 text-xs py-2 px-4 rounded-lg"
        >
          <div className="flex items-center justify-center space-x-1.5">
            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
            <span>Save Workflow</span>
          </div>
        </button>
      </div>
    </div>
  );
};
