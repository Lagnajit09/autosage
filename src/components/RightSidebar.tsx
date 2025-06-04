import React from "react";
import { X, Trash2, Code, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "react-router-dom";

// Define the shape of node data
interface NodeData {
  label?: string;
  description?: string;
  executionMode?: "local" | "remote";
  scriptType?: "Python Script" | "Powershell Script" | "Shell Script";
  serverAddress?: string;
  selectedCredential?: {
    id: string;
    name: string;
    username: string;
    password: string;
  };
  selectedScript?: string; // ID of selected script
}

// Define a ScriptFile interface
interface ScriptFile {
  id: string;
  name: string;
  content: string;
  language: "python" | "powershell" | "shell" | "javascript";
  lastModified: Date;
  source: "upload" | "editor";
}

// Define a simplified Node interface (we're only using the properties we need)
interface Node {
  id: string;
  type?: string;
  data?: NodeData;
}

// Define a Credential interface
interface Credential {
  id: string;
  name: string;
  username: string;
  password: string;
}

interface RightSidebarProps {
  selectedNode: Node | null;
  onUpdateNode: (nodeId: string, data: Partial<NodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
  onSaveWorkflow?: () => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  selectedNode,
  onUpdateNode,
  onDeleteNode,
  onClose,
}) => {
  // Don't render if no node is selected
  if (!selectedNode) return null;

  // Handle input changes and update the node
  const handleInputChange = (field: string, value: string) => {
    onUpdateNode(selectedNode.id, { [field]: value });
  };

  // Handle node deletion
  const handleDelete = () => {
    onDeleteNode(selectedNode.id);
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
        },
      });
    }
  };

  return (
    <div className="w-72 bg-slate-800/60 backdrop-blur-xl border-l border-slate-700/50 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-semibold text-white flex items-center">
          <div className="w-1 h-1 bg-blue-500 rounded-full mr-2"></div>
          Node Configuration
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-slate-700/50 rounded-md transition-colors duration-200 text-slate-400 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
      <div className="space-y-6">
        {/* Node Info */}
        <div className="bg-slate-700/30 backdrop-blur-sm rounded-lg p-4 border border-slate-600/30">
          <div className="text-xs text-slate-400 mb-1">Node Type</div>
          <div className="text-sm text-white font-medium capitalize mb-2">
            {selectedNode.type}
          </div>
          <div className="text-xs text-slate-500">ID: {selectedNode.id}</div>
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
              className="w-full px-3 py-2 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
              placeholder="Enter node label"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Description
            </label>
            <textarea
              value={String(selectedNode.data?.description || "")}
              onChange={(e) => handleInputChange("description", e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 resize-none"
              rows={3}
              placeholder="Enter description"
            />
          </div>
        </div>

        {/* Action Node Specific Settings */}
        {selectedNode.type === "action" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Script Type
              </label>
              <select
                value={String(selectedNode.data?.scriptType || "Python Script")}
                onChange={(e) =>
                  handleInputChange("scriptType", e.target.value)
                }
                className="w-full px-3 py-2 text-sm bg-slate-700 border border-slate-600/50 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
              >
                <option value="Python Script">Python Script</option>
                <option value="Powershell Script">Powershell Script</option>
                <option value="Shell Script">Shell Script</option>
              </select>
            </div>

            {/* Script Management Section */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">
                Script Management
              </label>

              <div className="grid grid-cols-1 gap-2">
                <Link
                  to={getEditorUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full"
                >
                  <Button
                    size="sm"
                    className="w-full text-sm py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 hover:text-blue-300 transition-all duration-200"
                  >
                    <Code size={14} className="mr-2" />
                    Write Script
                  </Button>
                </Link>

                <Button
                  onClick={handleUploadScript}
                  size="sm"
                  variant="outline"
                  className="w-full text-sm py-2 bg-slate-700/30 hover:bg-slate-600/30 border border-slate-600/50 text-slate-300 hover:text-white transition-all duration-200"
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
                  <SelectTrigger className="w-full h-10 text-sm bg-slate-700/50 border border-slate-600/50 text-white">
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
                        className="text-xs text-slate-500"
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
                className="w-full px-3 py-2 text-sm bg-slate-700 border border-slate-600/50 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
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
                    className="w-full px-3 py-2 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
                    placeholder="Enter server address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Credentials
                  </label>
                  <Select
                    onValueChange={handleCredentialSelect}
                    value={selectedNode.data?.selectedCredential?.id || ""}
                  >
                    <SelectTrigger className="w-full h-10 text-sm bg-slate-700/50 border border-slate-600/50 text-white">
                      <SelectValue placeholder="Select credentials..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border border-slate-600 text-white">
                      {getSavedCredentials().map((credential: Credential) => (
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
                      ))}
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
                  <p className="text-xs text-slate-500 mt-1">
                    Add credentials via the hamburger menu
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Delete Node Button */}
        <div className="pt-4 border-t border-slate-600/30">
          <Button
            onClick={handleDelete}
            variant="destructive"
            className="w-full text-sm py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 hover:text-red-300 transition-all duration-200"
          >
            <Trash2 size={14} className="mr-2" />
            Delete Node
          </Button>
        </div>
      </div>
    </div>
  );
};
