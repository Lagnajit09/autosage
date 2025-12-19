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
        <Terminal size={12} className="text-blue-600 dark:text-blue-400" />
      );
    case "email":
      return <Mail size={12} className="text-blue-600 dark:text-blue-400" />;
    default:
      return (
        <Terminal size={12} className="text-blue-600 dark:text-blue-400" />
      );
  }
};

export const ActionNode = ({ data }: { data: ActionNodeData }) => {
  return (
    <div className="group relative bg-white dark:bg-gray-900 border-2 border-blue-200 dark:border-blue-900/50 rounded-2xl shadow-sm min-w-[180px] hover:shadow-md transition-all duration-200">
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-4 h-4 bg-blue-200 dark:bg-blue-800 border-2 border-white dark:border-gray-900"
      />

      <div className="relative p-4 z-10">
        {/* Enhanced header */}
        <div className="flex items-center space-x-3 mb-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 group-hover:scale-110 transition-transform duration-300">
            {getIcon(data.type)}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">
              {data.label || "Action"}
            </h4>
          </div>
        </div>

        {/* Enhanced footer */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-semibold rounded-lg border border-blue-100 dark:border-blue-800">
            🔧 Action
          </div>
          {data.executionMode && (
            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700">
              {data.executionMode}
            </div>
          )}
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-4 h-4 bg-blue-200 dark:bg-blue-800 border-2 border-white dark:border-gray-900"
      />
    </div>
  );
};
