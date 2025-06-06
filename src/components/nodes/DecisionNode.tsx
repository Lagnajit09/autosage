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
    <div className="group relative bg-slate-800/90 backdrop-blur-sm border-2 border-yellow-500/50 rounded-xl shadow-2xl min-w-[160px] hover:shadow-yellow-500/20 transition-all duration-300">
      {/* Glow effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"></div>

      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-yellow-500 border-2 border-slate-800 shadow-lg hover:scale-125 transition-transform duration-200"
      />

      <div className="relative p-3">
        <div className="flex items-center space-x-2 mb-2">
          <div className="p-1.5 bg-yellow-500/20 rounded-lg">
            <GitBranch size={12} className="text-yellow-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-white text-xs truncate">
              {data.label || "Decision"}
            </h4>
          </div>
        </div>

        {data.condition && (
          <div className="text-xs text-yellow-300 mb-2 truncate">
            {data.condition}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="inline-flex items-center px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs font-medium rounded-md">
            ⚡ Decision
          </div>
          <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse"></div>
        </div>
      </div>

      {/* Multiple output handles for different conditions */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: "30%" }}
        className="w-3 h-3 bg-green-500 border-2 border-slate-800 shadow-lg hover:scale-125 transition-transform duration-200"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: "70%" }}
        className="w-3 h-3 bg-red-500 border-2 border-slate-800 shadow-lg hover:scale-125 transition-transform duration-200"
      />
    </div>
  );
};
