import { Handle, Position } from "@xyflow/react";
import { Globe, Play, Zap } from "lucide-react";

interface TriggerNodeData {
  type: string;
  label: string;
  description?: string;
}

// Helper function to get the appropriate icon based on trigger type
const getIcon = (type: string) => {
  switch (type) {
    case "http":
      return (
        <Globe size={12} className="text-emerald-600 dark:text-emerald-400" />
      );
    case "manual":
      return (
        <Play size={12} className="text-emerald-600 dark:text-emerald-400" />
      );
    case "event":
      return (
        <Zap size={12} className="text-emerald-600 dark:text-emerald-400" />
      );
    default:
      return (
        <Play size={12} className="text-emerald-600 dark:text-emerald-400" />
      );
  }
};

export const TriggerNode = ({ data }: { data: TriggerNodeData }) => {
  return (
    <div className="group relative bg-white dark:bg-gray-900 border-2 border-emerald-200 dark:border-emerald-900/50 rounded-2xl shadow-sm min-w-[180px] hover:shadow-md transition-all duration-200">
      <div className="relative p-4 z-10">
        {/* Enhanced header */}
        <div className="flex items-center space-x-3 mb-3">
          <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800 group-hover:scale-110 transition-transform duration-300">
            {getIcon(data.type)}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">
              {data.label || "Trigger"}
            </h4>
          </div>
        </div>

        {/* Enhanced footer */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-lg border border-emerald-100 dark:border-emerald-800">
            ⚡ Trigger
          </div>
          <div className="w-2 h-2 bg-emerald-400 dark:bg-emerald-500 rounded-full animate-pulse"></div>
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-4 h-4 bg-emerald-200 dark:bg-emerald-800 border-2 border-white dark:border-gray-900"
      />
    </div>
  );
};
