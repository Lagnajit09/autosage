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
    <div className="group relative bg-slate-800/90 backdrop-blur-sm border-2 border-emerald-500/50 rounded-xl shadow-2xl min-w-[160px] hover:shadow-emerald-500/20 transition-all duration-300">
      {/* Glow effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"></div>

      <div className="relative p-3">
        {/* Header with icon and label */}
        <div className="flex items-center space-x-2 mb-2">
          <div className="p-1.5 bg-emerald-500/20 rounded-lg">
            {getIcon(data.type)}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-white text-xs truncate">
              {data.label || "Trigger"}
            </h4>
          </div>
        </div>

        {/* Footer with badge and status indicator */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs font-medium rounded-md">
            ⚡ Trigger
          </div>
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
        </div>
      </div>

      {/* Connection handle - only source (output) for triggers */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-emerald-500 border-2 border-slate-800 shadow-lg hover:scale-125 transition-transform duration-200"
      />
    </div>
  );
};
