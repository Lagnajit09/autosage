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
      return <Globe size={12} className="text-emerald-400" />;
    case "manual":
      return <Play size={12} className="text-emerald-400" />;
    case "event":
      return <Zap size={12} className="text-emerald-400" />;
    default:
      return <Play size={12} className="text-emerald-400" />;
  }
};

export const TriggerNode = ({ data }: { data: TriggerNodeData }) => {
  return (
    <div className="group relative bg-node-trigger/35 backdrop-blur-xl border-2 border-node-trigger_border rounded-2xl shadow-2xl min-w-[180px] hover:shadow-node-success/30">
      <div className="relative p-4 z-10">
        {/* Enhanced header */}
        <div className="flex items-center space-x-3 mb-3">
          <div className="p-2 bg-gradient-to-br from-node-success/40 via-status-online/30 to-node-success/20 rounded-xl backdrop-blur-sm border border-node-success/30 group-hover:scale-110 transition-transform duration-300">
            {getIcon(data.type)}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-text-primary text-sm truncate">
              {data.label || "Trigger"}
            </h4>
          </div>
        </div>

        {/* Enhanced footer */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center px-2.5 py-1 bg-gradient-to-r from-node-success/30 to-status-online/20 text-node-success text-xs font-semibold rounded-lg backdrop-blur-sm border border-node-success/20">
            ⚡ Trigger
          </div>
          <div className="w-2 h-2 bg-gradient-to-r from-node-success to-status-online rounded-full animate-pulse-glow shadow-lg shadow-node-success/50"></div>
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-4 h-4 bg-node-trigger_border shadow-lg hover:shadow-node-success/50"
      />
    </div>
  );
};
