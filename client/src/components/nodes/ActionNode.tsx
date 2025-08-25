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
      return (
        <Terminal size={12} className="text-blue-400 dark:text-blue-400" />
      );
    case "email":
      return <Mail size={12} className="text-blue-400 dark:text-blue-400" />;
    default:
      return (
        <Terminal size={12} className="text-blue-400 dark:text-blue-400" />
      );
  }
};

export const ActionNode = ({ data }: { data: ActionNodeData }) => {
  return (
    <div className="group relative bg-node-action/35 dark:bg-node-action/35 backdrop-blur-xl border-2 border-node-action_border dark:border-node-action_border rounded-2xl shadow-2xl min-w-[180px] hover:shadow-ai-primary/30 dark:hover:shadow-ai-primary/30">
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-4 h-4 bg-node-action_border dark:bg-node-action_border shadow-lg hover:shadow-ai-primary/50 dark:hover:shadow-ai-primary/50"
      />

      <div className="relative p-4 z-10">
        {/* Enhanced header */}
        <div className="flex items-center space-x-3 mb-3">
          <div className="p-2 bg-gradient-to-br from-ai-primary/40 via-ai-secondary/30 to-ai-accent/20 dark:from-ai-primary/40 dark:via-ai-secondary/30 dark:to-ai-accent/20 rounded-xl backdrop-blur-sm border border-ai-primary/30 dark:border-ai-primary/30 group-hover:scale-110 transition-transform duration-300">
            {getIcon(data.type)}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-text-primary dark:text-text-primary text-sm truncate">
              {data.label || "Action"}
            </h4>
          </div>
        </div>

        {/* Enhanced footer */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center px-2.5 py-1 bg-gradient-to-r from-ai-primary/30 to-ai-secondary/20 dark:from-ai-primary/30 dark:to-ai-secondary/20 text-ai-accent dark:text-ai-accent text-xs font-semibold rounded-lg backdrop-blur-sm border border-ai-primary/20 dark:border-ai-primary/20">
            🔧 Action
          </div>
          {data.executionMode && (
            <div className="text-xs text-text-tertiary dark:text-text-tertiary bg-gradient-to-r from-workflow-deep/60 to-workflow-royal/40 dark:from-workflow-deep/60 dark:to-workflow-royal/40 px-2 py-1 rounded-lg backdrop-blur-sm border border-borders-secondary/30 dark:border-borders-secondary/30">
              {data.executionMode}
            </div>
          )}
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-4 h-4 bg-node-action_border dark:bg-node-action_border shadow-lg hover:shadow-ai-primary/50 dark:hover:shadow-ai-primary/50"
      />
    </div>
  );
};
