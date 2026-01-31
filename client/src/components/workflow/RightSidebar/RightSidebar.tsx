import React, { useState } from "react";
import { Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ParametersModal } from "../ParametersModal";
import { EdgeConf } from "./EdgeConf";
import { DecisionConf } from "./DecisionConf";
import { ScriptConf } from "./ScriptConf";
import { EmailConf } from "./EmailConf";
import { TriggerConf } from "./TriggerConf";
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveWorkflow: () => void;
  nodes?: Node[];
  onCreateEdge?: (
    sourceId: string,
    targetId: string,
    sourceHandle?: string,
  ) => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  selectedNode,
  selectedEdge,
  onUpdateNode,
  onUpdateEdge,
  onDeleteNode,
  onDeleteEdge,
  open,
  onOpenChange,
  nodes = [],
  onCreateEdge,
}) => {
  const [showParametersModal, setShowParametersModal] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    if (selectedNode) {
      onUpdateNode(selectedNode.id, { [field]: value });
    }
  };

  const handleDeleteNode = () => {
    if (selectedNode) {
      onDeleteNode(selectedNode.id);
      onOpenChange(false); // Close sheet after deletion
    }
  };

  const handleDeleteEdge = (edgeId: string) => {
    onDeleteEdge(edgeId);
    onOpenChange(false); // Close sheet after deletion
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

  // Don't render if no node or edge is selected
  if (!selectedNode && !selectedEdge) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-80 h-[95%] bg-white dark:bg-gray-950 border-t border-l border-gray-200 dark:border-gray-800 rounded-tl-3xl overflow-y-auto top-10 shadow-xl">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center">
            <div className="w-1.5 h-1.5 bg-purple-600 dark:bg-purple-400 rounded-full mr-3"></div>
            {selectedNode ? "Node Configuration" : "Edge Configuration"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* Edge Configuration */}
          {selectedEdge && (
            <EdgeConf
              selectedEdge={selectedEdge}
              onUpdateEdge={onUpdateEdge}
              onDeleteEdge={handleDeleteEdge}
            />
          )}

          {/* Node Configuration */}
          {selectedNode && (
            <>
              {/* Node Info */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-500 transition-all duration-300">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                  Node Type
                </div>
                <div className="text-sm text-gray-900 dark:text-gray-100 font-semibold capitalize mb-3 flex items-center">
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
                <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded-md">
                  ID: {selectedNode.id}
                </div>
              </div>

              {/* Basic Settings */}
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-text-secondary dark:text-text-secondary mb-3">
                    Label
                  </label>
                  <input
                    type="text"
                    value={String(selectedNode.data?.label || "")}
                    onChange={(e) => handleInputChange("label", e.target.value)}
                    className="w-full px-4 py-3 text-sm bg-transparent
                             border border-gray-300 dark:border-gray-700 rounded-xl 
                             text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 
                             hover:border-purple-500 dark:hover:border-purple-500"
                    placeholder="Enter node label"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary dark:text-text-secondary mb-3">
                    Description
                  </label>
                  <textarea
                    value={String(selectedNode.data?.description || "")}
                    onChange={(e) =>
                      handleInputChange("description", e.target.value)
                    }
                    className="w-full px-4 py-3 text-sm bg-transparent
                             border border-gray-300 dark:border-gray-700 rounded-xl 
                             text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 
                             hover:border-purple-500 dark:hover:border-purple-500 resize-none"
                    rows={3}
                    placeholder="Enter description"
                  />
                </div>
              </div>

              {/* Parameters Section */}
              {!(selectedNode.type === "trigger") && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-text-secondary dark:text-text-secondary">
                      Parameters
                    </label>
                    <Button
                      onClick={() => setShowParametersModal(true)}
                      size="sm"
                      className="text-xs py-2 px-3 
                               bg-purple-600 dark:bg-purple-600 hover:bg-purple-700 dark:hover:bg-purple-700
                               hover:from-ai-secondary/30 hover:to-ai-accent/30 dark:hover:from-ai-secondary/30 dark:hover:to-ai-accent/30 
                               border border-ai-secondary/40 dark:border-ai-secondary/40 hover:border-ai-accent/60 dark:hover:border-ai-accent/60
                               text-gray-100 rounded-lg
                               transform hover:scale-105"
                    >
                      <Settings size={12} className="mr-1.5" />
                      Configure
                    </Button>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 px-3 py-2 rounded-lg">
                    {selectedNode.data?.parameters?.length || 0} parameter(s)
                    configured
                  </div>
                </div>
              )}

              {/* Action Type Selection for Action Nodes */}
              {selectedNode.type === "action" && (
                <div>
                  <Label className="block text-sm font-medium text-text-secondary dark:text-text-secondary mb-3">
                    Action Type
                  </Label>
                  <Select
                    value={selectedNode.data?.type || "script"}
                    onValueChange={(value) => handleInputChange("type", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 text-sm bg-transparent border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 hover:border-purple-500 dark:hover:border-purple-500 focus:outline-none">
                      <SelectValue placeholder="Select action type" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
                      <SelectItem value="script">Script</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Node-specific configuration */}
              {renderNodeSpecificConfig()}

              {/* Delete Node Button */}
              <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
                <Button
                  onClick={handleDeleteNode}
                  variant="destructive"
                  className="w-full text-sm py-3 bg-red-50 dark:bg-red-900/20
                           hover:bg-red-100 dark:hover:bg-red-900/30
                           border border-status-error/40 dark:border-status-error/40 hover:border-status-error/60 dark:hover:border-status-error/60
                           text-status-error dark:text-status-error hover:text-white dark:hover:text-white 
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
      </SheetContent>
    </Sheet>
  );
};
