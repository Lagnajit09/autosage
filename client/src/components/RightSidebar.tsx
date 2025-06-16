import React, { useState } from "react";
import { X, Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ParametersModal } from "./ParametersModal";
import { EdgeConf } from "./RightSidebar/EdgeConf";
import { DecisionConf } from "./RightSidebar/DecisionConf";
import { ScriptConf } from "./RightSidebar/ScriptConf";
import { EmailConf } from "./RightSidebar/EmailConf";
import { TriggerConf } from "./RightSidebar/TriggerConf";
import { Node, Edge, Parameter, NodeData } from "@/utils/types";

interface RightSidebarProps {
  selectedNode: Node | null;
  selectedEdge: Edge | null;
  onUpdateNode: (nodeId: string, data: Partial<NodeData>) => void;
  onUpdateEdge: (edgeId: string, updates: Partial<Edge>) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onClose: () => void;
  onSaveWorkflow: () => void;
  nodes?: Node[];
  onCreateEdge?: (
    sourceId: string,
    targetId: string,
    sourceHandle?: string
  ) => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  selectedNode,
  selectedEdge,
  onUpdateNode,
  onUpdateEdge,
  onDeleteNode,
  onDeleteEdge,
  onClose,
  nodes = [],
  onCreateEdge,
}) => {
  const [showParametersModal, setShowParametersModal] = useState(false);

  if (!selectedNode && !selectedEdge) return null;

  const handleInputChange = (field: string, value: string) => {
    if (selectedNode) {
      onUpdateNode(selectedNode.id, { [field]: value });
    }
  };

  const handleDeleteNode = () => {
    if (selectedNode) {
      onDeleteNode(selectedNode.id);
    }
  };

  const handleUpdateParameters = (parameters: Parameter[]) => {
    if (selectedNode) {
      onUpdateNode(selectedNode.id, { parameters });
    }
  };

  const renderNodeSpecificConfig = () => {
    if (!selectedNode) return null;

    switch (selectedNode.type) {
      case "decision":
        return (
          <DecisionConf
            selectedNode={selectedNode}
            onUpdateNode={onUpdateNode}
            nodes={nodes}
            onCreateEdge={onCreateEdge}
          />
        );
      case "action":
        if (selectedNode.data?.type === "email") {
          return (
            <EmailConf
              selectedNode={selectedNode}
              onUpdateNode={onUpdateNode}
            />
          );
        } else {
          return (
            <ScriptConf
              selectedNode={selectedNode}
              onUpdateNode={onUpdateNode}
            />
          );
        }
      case "trigger":
        return (
          <TriggerConf
            selectedNode={selectedNode}
            onUpdateNode={onUpdateNode}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-80 bg-slate-800/60 backdrop-blur-xl border-l border-slate-700/50 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-semibold text-white flex items-center">
          <div className="w-1 h-1 bg-blue-500 rounded-full mr-2"></div>
          {selectedNode ? "Node Configuration" : "Edge Configuration"}
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-slate-700/50 rounded-md transition-colors duration-200 text-slate-400 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-6">
        {/* Edge Configuration */}
        {selectedEdge && (
          <EdgeConf
            selectedEdge={selectedEdge}
            onUpdateEdge={onUpdateEdge}
            onDeleteEdge={onDeleteEdge}
          />
        )}

        {/* Node Configuration */}
        {selectedNode && (
          <>
            {/* Node Info */}
            <div className="bg-slate-700/30 backdrop-blur-sm rounded-lg p-4 border border-slate-600/30">
              <div className="text-xs text-slate-400 mb-1">Node Type</div>
              <div className="text-sm text-white font-medium capitalize mb-2">
                {selectedNode.type}
              </div>
              <div className="text-xs text-slate-500">
                ID: {selectedNode.id}
              </div>
            </div>

            {/* Basic Settings */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Label
                </label>
                <input
                  type="text"
                  value={String(selectedNode.data?.label || "")}
                  onChange={(e) => handleInputChange("label", e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
                  placeholder="Enter node label"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Description
                </label>
                <textarea
                  value={String(selectedNode.data?.description || "")}
                  onChange={(e) =>
                    handleInputChange("description", e.target.value)
                  }
                  className="w-full px-3 py-2.5 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 resize-none"
                  rows={3}
                  placeholder="Enter description"
                />
              </div>
            </div>

            {/* Parameters Section */}
            {!(selectedNode.type === "trigger") && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-300">
                    Parameters
                  </label>
                  <Button
                    onClick={() => setShowParametersModal(true)}
                    size="sm"
                    className="text-xs py-1.5 px-3 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-400 hover:text-purple-300 transition-all duration-200"
                  >
                    <Settings size={12} className="mr-1" />
                    Configure
                  </Button>
                </div>
                <div className="text-xs text-slate-500">
                  {selectedNode.data?.parameters?.length || 0} parameter(s)
                  configured
                </div>
              </div>
            )}

            {/* Action Type Selection for Action Nodes */}
            {selectedNode.type === "action" && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Action Type
                </label>
                <select
                  value={String(selectedNode.data?.type || "script")}
                  onChange={(e) => handleInputChange("type", e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-slate-700 border border-slate-600/50 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
                >
                  <option value="script">Script</option>
                  <option value="email">Email</option>
                </select>
              </div>
            )}

            {/* Node-specific configuration */}
            {renderNodeSpecificConfig()}

            {/* Delete Node Button */}
            <div className="pt-6 border-t border-slate-600/30">
              <Button
                onClick={handleDeleteNode}
                variant="destructive"
                className="w-full text-sm py-2.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 hover:text-red-300 transition-all duration-200"
              >
                <Trash2 size={14} className="mr-2" />
                Delete Node
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Parameters Modal */}
      {selectedNode && (
        <ParametersModal
          isOpen={showParametersModal}
          onClose={() => setShowParametersModal(false)}
          parameters={selectedNode.data?.parameters || []}
          onUpdateParameters={handleUpdateParameters}
          nodeId={selectedNode.id}
        />
      )}
    </div>
  );
};
