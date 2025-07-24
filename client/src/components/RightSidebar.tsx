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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

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
    <div className="w-80 bg-bg-primary/40 backdrop-blur-xl border-l border-borders-primary/30 p-6 overflow-y-auto relative">
      <div className="flex items-center justify-between mb-6 relative z-10">
        <h3 className="text-sm font-semibold text-text-primary flex items-center">
          <div className="w-1.5 h-1.5 bg-gradient-to-r from-ai-secondary to-ai-accent rounded-full mr-3 animate-pulse"></div>
          {selectedNode ? "Node Configuration" : "Edge Configuration"}
        </h3>
        <button
          onClick={onClose}
          className="p-2 hover:bg-bg-secondary/60 rounded-lg transition-all duration-200 
                   text-text-tertiary hover:text-text-primary
                   hover:scale-110 transform border border-transparent hover:border-borders-secondary/50"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-6 relative z-10">
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
            <div
              className="bg-gradient-to-r from-bg-secondary/40 to-bg-tertiary/20 
                          backdrop-blur-sm rounded-xl p-4 
                          border border-borders-primary/40
                          hover:border-borders-primary/60 transition-all duration-300"
            >
              <div className="text-xs text-text-tertiary mb-2 uppercase tracking-wider">
                Node Type
              </div>
              <div className="text-sm text-text-primary font-semibold capitalize mb-3 flex items-center">
                <div
                  className={`w-2 h-2 rounded-full mr-2 ${
                    selectedNode.type === "trigger"
                      ? "bg-node-success"
                      : selectedNode.type === "action"
                      ? "bg-workflow-nebula"
                      : "bg-status-pending"
                  }`}
                ></div>
                {selectedNode.type}
              </div>
              <div className="text-xs text-text-muted bg-bg-card/50 px-2 py-1 rounded-md">
                ID: {selectedNode.id}
              </div>
            </div>

            {/* Basic Settings */}
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-3">
                  Label
                </label>
                <input
                  type="text"
                  value={String(selectedNode.data?.label || "")}
                  onChange={(e) => handleInputChange("label", e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-transparent
                           border border-borders-primary rounded-xl 
                           text-text-primary placeholder-text-muted 
                           hover:border-borders-primary/50"
                  placeholder="Enter node label"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-3">
                  Description
                </label>
                <textarea
                  value={String(selectedNode.data?.description || "")}
                  onChange={(e) =>
                    handleInputChange("description", e.target.value)
                  }
                  className="w-full px-4 py-3 text-sm bg-transparent
                           border border-borders-primary rounded-xl 
                           text-text-primary placeholder-text-muted 
                           hover:border-borders-primary/50 resize-none"
                  rows={3}
                  placeholder="Enter description"
                />
              </div>
            </div>

            {/* Parameters Section */}
            {!(selectedNode.type === "trigger") && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-text-secondary">
                    Parameters
                  </label>
                  <Button
                    onClick={() => setShowParametersModal(true)}
                    size="sm"
                    className="text-xs py-2 px-3 
                             bg-bg-secondary
                             hover:from-ai-secondary/30 hover:to-ai-accent/30 
                             border border-ai-secondary/40 hover:border-ai-accent/60
                             text-ai-secondary hover:text-ai-accent rounded-lg
                             transform hover:scale-105"
                  >
                    <Settings size={12} className="mr-1.5" />
                    Configure
                  </Button>
                </div>
                <div className="text-xs text-text-muted bg-bg-card/30 px-3 py-2 rounded-lg">
                  {selectedNode.data?.parameters?.length || 0} parameter(s)
                  configured
                </div>
              </div>
            )}

            {/* Action Type Selection for Action Nodes */}
            {selectedNode.type === "action" && (
              <div>
                <Label className="block text-sm font-medium text-text-secondary mb-3">
                  Action Type
                </Label>
                <Select
                  value={selectedNode.data?.type || "script"}
                  onValueChange={(value) => handleInputChange("type", value)}
                >
                  <SelectTrigger className="w-full px-4 py-3 text-sm bg-transparent border border-borders-primary rounded-xl text-text-primary hover:border-borders-primary/50 focus:outline-none">
                    <SelectValue placeholder="Select action type" />
                  </SelectTrigger>
                  <SelectContent className="bg-bg-primary text-text-primary border border-borders-primary">
                    <SelectItem value="script">Script</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Node-specific configuration */}
            {renderNodeSpecificConfig()}

            {/* Delete Node Button */}
            <div className="pt-6 border-t border-borders-primary/20">
              <Button
                onClick={handleDeleteNode}
                variant="destructive"
                className="w-full text-sm py-3 bg-bg-error/30
                         hover:bg-bg-error/50
                         border border-status-error/40 hover:border-status-error/60
                         text-status-error hover:text-white 
                         transition-all duration-300 rounded-xl
                         transform hover:scale-[1.02] hover:-translate-y-0.5"
              >
                <Trash2 size={16} className="mr-2" />
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
