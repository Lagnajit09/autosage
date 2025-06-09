import React, { useState } from "react";
import { X, Trash2, Code, Upload, FileText, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "react-router-dom";
import {
  NodeData,
  ScriptFile,
  Node,
  Edge,
  Parameter,
  Credential,
} from "@/utils/types";
import { ParametersModal } from "./ParametersModal";

interface RightSidebarProps {
  nodes: Node[];
  selectedNode: Node | null;
  selectedEdge: Edge | null;
  onUpdateNode: (nodeId: string, data: Partial<NodeData>) => void;
  onUpdateEdge: (edgeId: string, data: Partial<Edge>) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onClose: () => void;
  onSaveWorkflow?: () => void;
  onCreateEdge: (
    sourceId: string,
    targetId: string,
    sourceHandle?: string
  ) => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  nodes = [],
  selectedNode,
  selectedEdge,
  onUpdateNode,
  onUpdateEdge,
  onDeleteEdge,
  onDeleteNode,
  onClose,
  onCreateEdge,
}) => {
  const [showParametersModal, setShowParametersModal] = useState(false);

  // Don't render if no node or edge is selected
  if (!selectedNode && !selectedEdge) return null;

  // Handle input changes and update the node
  const handleInputChange = (field: string, value: string) => {
    if (selectedNode) {
      onUpdateNode(selectedNode.id, { [field]: value });
    }
  };

  // Handle array input changes for decision nodes
  const handleArrayInputChange = (field: string, value: string[]) => {
    if (selectedNode) {
      onUpdateNode(selectedNode.id, { [field]: value });
    }
  };

  // Handle edge updates
  const handleEdgeUpdate = (field: string, value: number | string) => {
    if (selectedEdge) {
      if (field === "stroke" || field === "strokeWidth") {
        onUpdateEdge(selectedEdge.id, {
          style: {
            ...selectedEdge.style,
            [field]: value,
          },
        });
      } else {
        onUpdateEdge(selectedEdge.id, { [field]: value });
      }
    }
  };

  // Handle node deletion
  const handleDeleteNode = () => {
    if (selectedNode) {
      onDeleteNode(selectedNode.id);
    }
  };

  // Handle edge deletion
  const handleDeleteEdge = () => {
    if (selectedEdge) {
      onDeleteEdge(selectedEdge.id);
    }
  };

  // Handle parameters update
  const handleUpdateParameters = (parameters: Parameter[]) => {
    if (selectedNode) {
      onUpdateNode(selectedNode.id, { parameters });
    }
  };

  // Handle script upload
  const handleUploadScript = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".py,.ps1,.sh,.js";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;

          // Save uploaded script to localStorage
          const savedFiles = localStorage.getItem("scriptFiles");
          const files = savedFiles ? JSON.parse(savedFiles) : [];
          const newFile = {
            id: `${Date.now()}-${Math.random()}`,
            name: file.name,
            content: content,
            language: file.name.endsWith(".py")
              ? "python"
              : file.name.endsWith(".ps1")
              ? "powershell"
              : file.name.endsWith(".sh")
              ? "shell"
              : "javascript",
            lastModified: new Date(),
            source: "upload",
          };
          files.push(newFile);
          localStorage.setItem("scriptFiles", JSON.stringify(files));
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  // Get saved scripts from localStorage
  const getSavedScripts = () => {
    try {
      const savedFiles = localStorage.getItem("scriptFiles");
      if (savedFiles) {
        const files = JSON.parse(savedFiles);
        return files.filter((file: ScriptFile) => {
          const scriptType = selectedNode.data?.scriptType || "Python Script";
          const expectedLanguage = scriptType
            .replace(" Script", "")
            .toLowerCase();
          return file.language === expectedLanguage;
        });
      }
    } catch (error) {
      console.error("Error loading scripts:", error);
    }
    return [];
  };

  // Get saved credentials from sessionStorage
  const getSavedCredentials = () => {
    try {
      const savedCredentials = sessionStorage.getItem("workflowCredentials");
      if (savedCredentials) {
        return JSON.parse(savedCredentials);
      }
    } catch (error) {
      console.error("Error loading credentials:", error);
    }
    return [];
  };

  // Get the credential ID as a string for the Select component
  const getSelectedCredentialId = () => {
    const selectedCred = selectedNode.data?.selectedCredential;
    if (typeof selectedCred === "string") {
      return selectedCred;
    } else if (selectedCred && typeof selectedCred === "object") {
      return selectedCred.id;
    }
    return "";
  };

  // Navigate to code editor
  const getEditorUrl = () => {
    const scriptType = selectedNode.data?.scriptType || "Python Script";
    const type = scriptType.replace(" Script", "").toLowerCase();
    return `/code-editor?type=${type}&nodeId=${selectedNode.id}`;
  };

  // Handle script selection
  const handleScriptSelect = (scriptId: string) => {
    onUpdateNode(selectedNode.id, { selectedScript: scriptId });
  };

  // Handle credential selection
  const handleCredentialSelect = (credentialId: string) => {
    const selectedCred = getSavedCredentials().find(
      (cred) => cred.id === credentialId
    );
    if (selectedCred) {
      onUpdateNode(selectedNode.id, {
        selectedCredential: {
          id: selectedCred.id,
          name: selectedCred.name,
          username: selectedCred.username,
          password: selectedCred.password,
          createdAt: selectedCred.createdAt,
        },
      });
    }
  };

  // Handle decision node label changes
  const handleTrueLabelChange = (nodeIds: string[]) => {
    if (selectedNode && onCreateEdge) {
      // Update the node data
      handleArrayInputChange("trueLabel", nodeIds);

      // Create edges for each selected node
      nodeIds.forEach((targetId) => {
        onCreateEdge(selectedNode.id, targetId, "true");
      });
    }
  };

  const handleFalseLabelChange = (nodeIds: string[]) => {
    if (selectedNode && onCreateEdge) {
      // Update the node data
      handleArrayInputChange("falseLabel", nodeIds);

      // Create edges for each selected node
      nodeIds.forEach((targetId) => {
        onCreateEdge(selectedNode.id, targetId, "false");
      });
    }
  };

  // Get available nodes for decision connections (exclude current node)
  const getAvailableNodes = () => {
    return nodes.filter(
      (node) => node.id !== selectedNode?.id && node.type !== "trigger"
    );
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
          <>
            <div className="bg-slate-700/30 backdrop-blur-sm rounded-lg p-4 border border-slate-600/30">
              <div className="text-xs text-slate-400 mb-1">Edge Type</div>
              <div className="text-sm text-white font-medium capitalize mb-2">
                Connection
              </div>
              <div className="text-xs text-slate-500">
                ID: {selectedEdge.id}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Label
                </label>
                <input
                  type="text"
                  value={selectedEdge.label || ""}
                  onChange={(e) => handleEdgeUpdate("label", e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
                  placeholder="Enter edge label"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Type
                </label>
                <select
                  value={selectedEdge.type || "default"}
                  onChange={(e) => handleEdgeUpdate("type", e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-slate-700 border border-slate-600/50 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
                >
                  <option value="default">Default</option>
                  <option value="straight">Straight</option>
                  <option value="step">Step</option>
                  <option value="smoothstep">Smooth Step</option>
                  <option value="bezier">Bezier</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Stroke Color
                </label>
                <div className="flex space-x-2">
                  <input
                    type="color"
                    value={selectedEdge.style?.stroke || "#64748b"}
                    onChange={(e) => handleEdgeUpdate("stroke", e.target.value)}
                    className="w-12 h-10 rounded border border-slate-600"
                  />
                  <input
                    type="text"
                    value={selectedEdge.style?.stroke || "#64748b"}
                    onChange={(e) => handleEdgeUpdate("stroke", e.target.value)}
                    className="flex-1 px-3 py-2 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder="#64748b"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Stroke Width
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={selectedEdge.style?.strokeWidth || 2}
                  onChange={(e) =>
                    handleEdgeUpdate("strokeWidth", Number(e.target.value))
                  }
                  className="w-full"
                />
                <div className="text-center text-sm text-slate-400 mt-1">
                  {selectedEdge.style?.strokeWidth || 2}px
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-600/30">
              <Button
                onClick={handleDeleteEdge}
                variant="destructive"
                className="w-full text-sm py-2.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 hover:text-red-300 transition-all duration-200"
              >
                <Trash2 size={14} className="mr-2" />
                Delete Edge
              </Button>
            </div>
          </>
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
            {/* Parameters Section - Available for action node types */}
            {selectedNode.type === "action" && (
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
            {/* Decision Node Specific Settings */}
            {selectedNode.type === "decision" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Condition
                  </label>
                  <input
                    type="text"
                    value={String(selectedNode.data?.condition || "")}
                    onChange={(e) =>
                      handleInputChange("condition", e.target.value)
                    }
                    className="w-full px-3 py-2.5 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
                    placeholder="e.g., x > 0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    True Label (Node IDs)
                  </label>
                  <Select
                    onValueChange={(value) => handleTrueLabelChange([value])}
                    value=""
                  >
                    <SelectTrigger className="w-full h-11 text-sm bg-slate-700/50 border border-slate-600/50 text-white">
                      <SelectValue placeholder="Select node for true condition..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border border-slate-600 text-white">
                      {getAvailableNodes().map((node) => (
                        <SelectItem
                          key={node.id}
                          value={node.id}
                          className="text-sm hover:bg-slate-600 focus:bg-slate-600"
                        >
                          {node.data?.label || node.id} ({node.type})
                        </SelectItem>
                      ))}
                      {getAvailableNodes().length === 0 && (
                        <SelectItem
                          value="none"
                          disabled
                          className="text-sm text-slate-500"
                        >
                          No nodes available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {selectedNode.data?.trueLabel &&
                    selectedNode.data.trueLabel.length > 0 && (
                      <div className="mt-2 text-xs text-green-400">
                        Connected to: {selectedNode.data.trueLabel.join(", ")}
                      </div>
                    )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    False Label (Node IDs)
                  </label>
                  <Select
                    onValueChange={(value) => handleFalseLabelChange([value])}
                    value=""
                  >
                    <SelectTrigger className="w-full h-11 text-sm bg-slate-700/50 border border-slate-600/50 text-white">
                      <SelectValue placeholder="Select node for false condition..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border border-slate-600 text-white">
                      {getAvailableNodes().map((node) => (
                        <SelectItem
                          key={node.id}
                          value={node.id}
                          className="text-sm hover:bg-slate-600 focus:bg-slate-600"
                        >
                          {node.data?.label || node.id} ({node.type})
                        </SelectItem>
                      ))}
                      {getAvailableNodes().length === 0 && (
                        <SelectItem
                          value="none"
                          disabled
                          className="text-sm text-slate-500"
                        >
                          No nodes available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {selectedNode.data?.falseLabel &&
                    selectedNode.data.falseLabel.length > 0 && (
                      <div className="mt-2 text-xs text-red-400">
                        Connected to: {selectedNode.data.falseLabel.join(", ")}
                      </div>
                    )}
                </div>
              </div>
            )}
            {/* Action Node Specific Settings */}
            {selectedNode.type === "action" && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Script Type
                  </label>
                  <select
                    value={String(
                      selectedNode.data?.scriptType || "Python Script"
                    )}
                    onChange={(e) =>
                      handleInputChange("scriptType", e.target.value)
                    }
                    className="w-full px-3 py-2.5 text-sm bg-slate-700 border border-slate-600/50 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
                  >
                    <option value="Python Script">Python Script</option>
                    <option value="Powershell Script">Powershell Script</option>
                    <option value="Shell Script">Shell Script</option>
                  </select>
                </div>

                {/* Script Management Section */}
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-slate-300">
                    Script Management
                  </label>

                  <div className="grid grid-cols-1 gap-3">
                    <Link
                      to={getEditorUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full"
                    >
                      <Button
                        size="sm"
                        className="w-full text-sm py-2.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 hover:text-blue-300 transition-all duration-200"
                      >
                        <Code size={14} className="mr-2" />
                        Write Script
                      </Button>
                    </Link>

                    <Button
                      onClick={handleUploadScript}
                      size="sm"
                      variant="outline"
                      className="w-full text-sm py-2.5 bg-slate-700/30 hover:bg-slate-600/30 border border-slate-600/50 text-slate-300 hover:text-white transition-all duration-200"
                    >
                      <Upload size={14} className="mr-2" />
                      Upload Script
                    </Button>
                  </div>

                  {/* Script Selection */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Select Script
                    </label>
                    <Select
                      onValueChange={handleScriptSelect}
                      value={selectedNode.data?.selectedScript || ""}
                    >
                      <SelectTrigger className="w-full h-11 text-sm bg-slate-700/50 border border-slate-600/50 text-white">
                        <SelectValue placeholder="Choose a script..." />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 border border-slate-600 text-white">
                        {getSavedScripts().map((script: ScriptFile) => (
                          <SelectItem
                            key={script.id}
                            value={script.id}
                            className="text-sm hover:bg-slate-600 focus:bg-slate-600"
                          >
                            <div className="flex items-center space-x-2">
                              <FileText size={14} />
                              <span>{script.name}</span>
                              <span className="text-xs text-slate-400">
                                {script.source === "upload" ? "↑" : "✏️"}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                        {getSavedScripts().length === 0 && (
                          <SelectItem
                            value="none"
                            disabled
                            className="text-sm text-slate-500"
                          >
                            No scripts available
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Execution Mode
                  </label>
                  <select
                    value={String(selectedNode.data?.executionMode || "local")}
                    onChange={(e) =>
                      handleInputChange("executionMode", e.target.value)
                    }
                    className="w-full px-3 py-2.5 text-sm bg-slate-700 border border-slate-600/50 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
                  >
                    <option value="local">Local</option>
                    <option value="remote">Remote</option>
                  </select>
                </div>

                {selectedNode.data?.executionMode === "remote" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Server Address
                      </label>
                      <input
                        type="text"
                        value={String(selectedNode.data?.serverAddress || "")}
                        onChange={(e) =>
                          handleInputChange("serverAddress", e.target.value)
                        }
                        className="w-full px-3 py-2.5 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
                        placeholder="Enter server address"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Credentials
                      </label>
                      <Select
                        onValueChange={handleCredentialSelect}
                        value={getSelectedCredentialId()}
                      >
                        <SelectTrigger className="w-full h-11 text-sm bg-slate-700/50 border border-slate-600/50 text-white">
                          <SelectValue placeholder="Select credentials..." />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-700 border border-slate-600 text-white">
                          {getSavedCredentials().map(
                            (credential: Credential) => (
                              <SelectItem
                                key={credential.id}
                                value={credential.id}
                                className="text-sm hover:bg-slate-600 focus:bg-slate-600"
                              >
                                <div className="flex items-center space-x-2">
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                                    />
                                  </svg>
                                  <span>{credential.name}</span>
                                </div>
                              </SelectItem>
                            )
                          )}
                          {getSavedCredentials().length === 0 && (
                            <SelectItem
                              value="none"
                              disabled
                              className="text-sm text-slate-500"
                            >
                              No credentials available
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500 mt-2">
                        Add credentials via the hamburger menu
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
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
