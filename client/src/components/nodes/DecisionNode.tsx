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
    <div className="group relative bg-node-decision/25 dark:bg-node-decision/25 backdrop-blur-xl border-2 border-node-decision_border dark:border-node-decision_border rounded-2xl shadow-2xl min-w-[180px] hover:shadow-status-pending/30 dark:hover:shadow-status-pending/30">
      <Handle
        type="target"
        position={Position.Left}
        className="w-4 h-4 bg-node-decision_border dark:bg-node-decision_border shadow-lg hover:shadow-status-pending/50 dark:hover:shadow-status-pending/50"
      />

      <div className="relative p-4 z-10">
        {/* Enhanced header */}
        <div className="flex items-center space-x-3 mb-3">
          <div className="p-2 bg-gradient-to-br from-status-pending/40 via-node-warning/30 to-status-pending/20 dark:from-status-pending/40 dark:via-node-warning/30 dark:to-status-pending/20 rounded-xl backdrop-blur-sm border border-status-pending/30 dark:border-status-pending/30 group-hover:scale-110 transition-transform duration-300">
            <GitBranch
              size={14}
              className="text-status-pending dark:text-status-pending"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-text-primary dark:text-text-primary text-sm truncate">
              {data.label || "Decision"}
            </h4>
          </div>
        </div>

        {/* Enhanced condition display */}
        {data.condition && (
          <div className="text-xs text-text-primary dark:text-text-primary mb-3 truncate bg-gradient-to-r from-status-pending/10 to-node-warning/10 dark:from-status-pending/10 dark:to-node-warning/10 px-2 py-1 rounded-lg backdrop-blur-sm border border-status-pending/20 dark:border-status-pending/20">
            {data.condition}
          </div>
        )}

        {/* Enhanced footer */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center px-2.5 py-1 bg-gradient-to-r from-status-pending/30 to-node-warning/20 dark:from-status-pending/30 dark:to-node-warning/20 text-status-pending dark:text-status-pending text-xs font-semibold rounded-lg backdrop-blur-sm border border-status-pending/20 dark:border-status-pending/20">
            ⚡ Decision
          </div>
          <div className="w-2 h-2 bg-gradient-to-r from-status-pending to-node-warning dark:from-status-pending dark:to-node-warning rounded-full animate-pulse-glow shadow-lg shadow-status-pending/50 dark:shadow-status-pending/50"></div>
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
            className="w-4 h-4 bg-node-success dark:bg-node-success shadow-lg hover:shadow-node-success/50 dark:hover:shadow-node-success/50"
          />
          <div className="absolute left-6 top-1/2 transform -translate-y-1/2 bg-gradient-to-r from-node-success/20 to-status-online/10 dark:from-node-success/20 dark:to-status-online/10 px-2 py-1 rounded-md backdrop-blur-sm border border-node-success/30 dark:border-node-success/30 opacity-0 group-hover/handle:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            <span className="text-xs font-medium text-node-success dark:text-node-success">
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
            className="w-4 h-4 bg-node-error dark:bg-node-error shadow-lg hover:shadow-node-error/50 dark:hover:shadow-node-error/50"
          />
          <div className="absolute left-6 top-1/2 transform -translate-y-1/2 bg-gradient-to-r from-node-error/20 to-status-error/10 dark:from-node-error/20 dark:to-status-error/10 px-2 py-1 rounded-md backdrop-blur-sm border border-node-error/30 dark:border-node-error/30 opacity-0 group-hover/handle:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            <span className="text-xs font-medium text-node-error dark:text-node-error">
              False
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
