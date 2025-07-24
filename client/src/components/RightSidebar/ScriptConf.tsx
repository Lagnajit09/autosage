import React from "react";
import { Code, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "react-router-dom";
import { BaseConfigProps, Credential, ScriptFile } from "@/utils/types";
import { Label } from "../ui/label";
import { Input } from "../ui/input";

export const ScriptConf: React.FC<BaseConfigProps> = ({
  selectedNode,
  onUpdateNode,
}) => {
  const handleInputChange = (field: string, value: string) => {
    onUpdateNode(selectedNode.id, { [field]: value });
  };

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

  const getEditorUrl = () => {
    const scriptType = selectedNode.data?.scriptType || "Python Script";
    const type = scriptType.replace(" Script", "").toLowerCase();
    return `/code-editor?type=${type}&nodeId=${selectedNode.id}`;
  };

  const handleScriptSelect = (scriptId: string) => {
    onUpdateNode(selectedNode.id, { selectedScript: scriptId });
  };

  const handleCredentialSelect = (credentialId: string) => {
    const selectedCred = getSavedCredentials().find(
      (cred: Credential) => cred.id === credentialId
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

  const getSelectedCredentialId = () => {
    const selectedCred = selectedNode.data?.selectedCredential;
    if (typeof selectedCred === "string") {
      return selectedCred;
    } else if (selectedCred && typeof selectedCred === "object") {
      return selectedCred.id;
    }
    return "";
  };

  return (
    <div className="space-y-5">
      <h4 className="text-sm font-medium text-slate-300 border-b border-slate-600/30 pb-2">
        Script Configuration
      </h4>
      <div>
        <Label className="block text-sm font-medium text-slate-300 mb-2">
          Script Type
        </Label>
        <Select
          value={selectedNode.data?.scriptType || "Python Script"}
          onValueChange={(value) => handleInputChange("scriptType", value)}
        >
          <SelectTrigger className="w-full h-11 text-sm bg-slate-700/25 border border-slate-600/50 text-white">
            <SelectValue placeholder="Select script type" />
          </SelectTrigger>
          <SelectContent className="bg-bg-primary text-text-primary border border-borders-primary">
            <SelectItem value="Python Script">Python Script</SelectItem>
            <SelectItem value="Powershell Script">Powershell Script</SelectItem>
            <SelectItem value="Shell Script">Shell Script</SelectItem>
          </SelectContent>
        </Select>
      </div>

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

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Select Script
          </label>
          <Select
            onValueChange={handleScriptSelect}
            value={selectedNode.data?.selectedScript || ""}
          >
            <SelectTrigger className="w-full h-11 text-sm bg-slate-700/25 border border-slate-600/50 text-white">
              <SelectValue placeholder="Choose a script..." />
            </SelectTrigger>
            <SelectContent className="bg-bg-primary text-text-primary border border-borders-primary">
              {getSavedScripts().map((script: ScriptFile) => (
                <SelectItem
                  key={script.id}
                  value={script.id}
                  className="text-sm"
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
        <Label className="block text-sm font-medium text-slate-300 mb-2">
          Execution Mode
        </Label>
        <Select
          value={selectedNode.data?.executionMode || "local"}
          onValueChange={(value) => handleInputChange("executionMode", value)}
        >
          <SelectTrigger className="w-full h-11 text-sm bg-slate-700/25 border border-slate-600/50 text-white">
            <SelectValue placeholder="Select execution mode" />
          </SelectTrigger>
          <SelectContent className="bg-bg-primary text-text-primary border border-borders-primary">
            <SelectItem value="local">Local</SelectItem>
            <SelectItem value="remote">Remote</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedNode.data?.executionMode === "remote" && (
        <>
          <div>
            <Label className="block text-sm font-medium text-slate-300 mb-2">
              Server Address
            </Label>
            <Input
              type="text"
              value={String(selectedNode.data?.serverAddress || "")}
              onChange={(e) =>
                handleInputChange("serverAddress", e.target.value)
              }
              className="w-full px-3 py-2.5 text-sm bg-slate-700/25 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none"
              placeholder="Enter server address"
            />
          </div>

          <div>
            <Label className="block text-sm font-medium text-slate-300 mb-2">
              Credentials
            </Label>
            <Select
              onValueChange={handleCredentialSelect}
              value={getSelectedCredentialId()}
            >
              <SelectTrigger className="w-full h-11 text-sm bg-slate-700/25 border border-slate-600/50 text-white">
                <SelectValue placeholder="Select credentials..." />
              </SelectTrigger>
              <SelectContent className="bg-bg-primary text-text-primary border border-borders-primary">
                {getSavedCredentials().map((credential: Credential) => (
                  <SelectItem
                    key={credential.id}
                    value={credential.id}
                    className="text-sm"
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
            <p className="text-xs text-slate-500 mt-2">
              Add credentials via the hamburger menu
            </p>
          </div>
        </>
      )}
    </div>
  );
};
