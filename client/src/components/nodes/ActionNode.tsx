import { Handle, Position } from "@xyflow/react";
import { Terminal, Mail } from "lucide-react";

interface ActionNodeData {
  type: string;
  label: string;
  description?: string;
  executionMode?: "local" | "remote";
  serverAddress?: string;
  userID?: string;
  password?: string;
}

// Helper function to get the appropriate icon based on action type
const getIcon = (type: string) => {
  switch (type) {
    case "script":
      return <Terminal size={12} className="text-blue-400" />;
    case "email":
      return <Mail size={12} className="text-blue-400" />;
    default:
      return <Terminal size={12} className="text-blue-400" />;
  }
};

export const ActionNode = ({ data }: { data: ActionNodeData }) => {
  return (
    <div className="group relative bg-slate-800/90 backdrop-blur-sm border-2 border-blue-500/50 rounded-xl shadow-2xl min-w-[160px] hover:shadow-blue-500/20 transition-all duration-300">
      {/* Glow effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"></div>

      {/* Input handle - actions can receive data from triggers or other actions */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-blue-500 border-2 border-slate-800 shadow-lg hover:scale-125 transition-transform duration-200"
      />

      <div className="relative p-3">
        {/* Header with icon and label */}
        <div className="flex items-center space-x-2 mb-2">
          <div className="p-1.5 bg-blue-500/20 rounded-lg">
            {getIcon(data.type)}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-white text-xs truncate">
              {data.label || "Action"}
            </h4>
          </div>
        </div>

        {/* Footer with badge and execution mode */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-xs font-medium rounded-md">
            🔧 Action
          </div>
          {data.executionMode && (
            <div className="text-xs text-slate-400 bg-slate-700/50 px-1.5 py-0.5 rounded">
              {data.executionMode}
            </div>
          )}
        </div>
      </div>

      {/* Output handle - actions can chain to other actions */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-blue-500 border-2 border-slate-800 shadow-lg hover:scale-125 transition-transform duration-200"
      />
    </div>
  );
};
