import { Handle, Position } from "@xyflow/react";
import { GitBranch } from "lucide-react";

interface DecisionNodeData {
  label?: string;
  conditionType?: "output-eval" | "condition" | "custom";
  condition?: string;
  trueLabel?: string;
  falseLabel?: string;
  description?: string;
}

export const DecisionNode = ({
  data,
  selected,
}: {
  data: DecisionNodeData;
  selected?: boolean;
}) => {
  return (
    <div className="relative w-40 h-40 flex items-center justify-center">
      {/* Diamond Shape Background */}
      <div
        className={`absolute inset-0 bg-white dark:bg-gray-900 border-2 rotate-45 rounded-lg transition-all duration-200 ${
          selected
            ? "border-amber-400 dark:border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.5)] dark:shadow-[0_0_25px_rgba(251,191,36,0.5)]"
            : "border-amber-400 dark:border-amber-700/50 shadow-sm hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] dark:hover:shadow-[0_0_20px_rgba(251,191,36,0.3)]"
        }`}
      ></div>

      {/* Content Container (Not Rotated) */}
      <div className="relative z-10 flex flex-col items-center justify-center p-4 text-center pointer-events-none w-full h-full">
        <div className="p-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-full border border-amber-100 dark:border-amber-800 mb-1">
          <GitBranch size={12} className="text-amber-600 dark:text-amber-400" />
        </div>
        <h4 className="font-bold text-gray-900 dark:text-gray-100 text-xs w-full px-4 whitespace-normal break-words leading-tight">
          {data.label || "Decision"}
        </h4>
        {data.condition && (
          <div className="text-sm text-gray-800 dark:text-gray-200 mt-1 w-full px-2 whitespace-normal break-words bg-amber-50 dark:bg-amber-900/20 py-0.5 rounded border border-amber-100 dark:border-amber-800">
            {data.condition.replace(/{{[^.]+\.output\.([^}]+)}}/g, "{{$1}}")}
          </div>
        )}
      </div>

      {/* Handles - Positioned on the diamond points */}

      {/* Input Handle - Left Point */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-amber-200 dark:bg-amber-800 border-2 border-white dark:border-gray-900 -left-1"
      />

      {/* True Handle - Right Point */}
      <div className="absolute -right-1 top-1/2 -translate-y-1/2 group/true">
        <Handle
          type="source"
          position={Position.Right}
          id="true"
          className="w-3 h-3 bg-emerald-500 border-2 border-white dark:border-gray-900"
        />
        <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 opacity-0 group-hover/true:opacity-100 transition-opacity duration-200 pointer-events-none">
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
            True
          </span>
        </div>
      </div>

      {/* False Handle - Bottom Point */}
      <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 group/false">
        <Handle
          type="source"
          position={Position.Bottom}
          id="false"
          className="w-3 h-3 bg-red-500 border-2 border-white dark:border-gray-900"
        />
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800 opacity-0 group-hover/false:opacity-100 transition-opacity duration-200 pointer-events-none">
          <span className="text-xs font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
            False
          </span>
        </div>
      </div>
    </div>
  );
};
