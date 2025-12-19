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

export const DecisionNode = ({ data }: { data: DecisionNodeData }) => {
  return (
    <div className="group relative bg-white dark:bg-gray-900 border-2 border-amber-200 dark:border-amber-900/50 rounded-2xl shadow-sm min-w-[180px] hover:shadow-md transition-all duration-200">
      <Handle
        type="target"
        position={Position.Left}
        className="w-4 h-4 bg-amber-200 dark:bg-amber-800 border-2 border-white dark:border-gray-900"
      />

      <div className="relative p-4 z-10">
        {/* Enhanced header */}
        <div className="flex items-center space-x-3 mb-3">
          <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800 group-hover:scale-110 transition-transform duration-300">
            <GitBranch
              size={14}
              className="text-amber-600 dark:text-amber-400"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">
              {data.label || "Decision"}
            </h4>
          </div>
        </div>

        {/* Enhanced condition display */}
        {data.condition && (
          <div className="text-xs text-gray-700 dark:text-gray-300 mb-3 truncate bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg border border-amber-100 dark:border-amber-800">
            {data.condition}
          </div>
        )}

        {/* Enhanced footer */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-xs font-semibold rounded-lg border border-amber-100 dark:border-amber-800">
            ⚡ Decision
          </div>
          <div className="w-2 h-2 bg-amber-400 dark:bg-amber-500 rounded-full animate-pulse"></div>
        </div>
      </div>

      {/* Enhanced output handles with labels */}
      <div className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 flex flex-col space-y-4">
        {/* True handle */}
        <div className="relative group/handle">
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ position: "static", transform: "none" }}
            className="w-4 h-4 bg-emerald-500 border-2 border-white dark:border-gray-900"
          />
          <div className="absolute left-6 top-1/2 transform -translate-y-1/2 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 opacity-0 group-hover/handle:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              True
            </span>
          </div>
        </div>

        {/* False handle */}
        <div className="relative group/handle">
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ position: "static", transform: "none" }}
            className="w-4 h-4 bg-red-500 border-2 border-white dark:border-gray-900"
          />
          <div className="absolute left-6 top-1/2 transform -translate-y-1/2 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-md border border-red-200 dark:border-red-800 opacity-0 group-hover/handle:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              False
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
