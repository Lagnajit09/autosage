import { TriggerNodeData } from "@/utils/types";
import { Handle, Position } from "@xyflow/react";
import { Globe, Play, Zap } from "lucide-react";

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

export const TriggerNode = ({
  data,
  selected,
}: {
  data: TriggerNodeData;
  selected?: boolean;
}) => {
  return (
    <div
      className={`group relative bg-white dark:bg-gray-900 border-2 rounded-full w-40 h-40 flex flex-col justify-center items-center transition-all duration-200 ${
        selected
          ? "border-emerald-400 dark:border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.5)] dark:shadow-[0_0_25px_rgba(52,211,153,0.5)]"
          : "border-emerald-400 dark:border-emerald-700/50 shadow-sm hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] dark:hover:shadow-[0_0_20px_rgba(52,211,153,0.3)]"
      }`}
    >
      <div className="relative z-10 flex flex-col items-center p-4 w-full">
        {/* Icon */}
        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-full border border-emerald-100 dark:border-emerald-800 mb-2 group-hover:scale-110 transition-transform duration-300">
          {getIcon(data.type)}
        </div>

        {/* Label */}
        <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm text-center w-full px-2 whitespace-normal break-words leading-tight">
          {data.label || "Trigger"}
        </h4>

        {/* Type Badge - simplified for circular layout */}
        <div className="mt-2 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-full border border-emerald-100 dark:border-emerald-800">
          Trigger
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-4 h-4 bg-emerald-200 dark:bg-emerald-800 border-2 border-white dark:border-gray-900 -right-2"
      />
    </div>
  );
};
