import React, { useState, useEffect } from "react";
import {
  Code,
  Upload,
  FileText,
  Server as ServerIcon,
  Loader2,
} from "lucide-react";
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
  BaseConfigProps,
  Credential,
  ScriptFile,
  Vault,
  Server,
} from "@/utils/types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@clerk/clerk-react";
import { apiRequest } from "@/lib/api-client";
import { toast } from "sonner";

export const ScriptConf: React.FC<BaseConfigProps> = ({
  selectedNode,
  onUpdateNode,
}) => {
  const { getToken, isSignedIn } = useAuth();
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [isLoadingVaults, setIsLoadingVaults] = useState(false);

  useEffect(() => {
    if (selectedNode.data?.executionMode === "remote" && isSignedIn) {
      fetchVaults();
    }
  }, [selectedNode.data?.executionMode, isSignedIn]);

  const fetchVaults = async () => {
    setIsLoadingVaults(true);
    try {
      const token = await getToken();
      const response = await apiRequest("/api/vault/vaults/", {}, token);
      if (response.success) {
        setVaults(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch vaults:", error);
      toast.error("Failed to load vaults");
    } finally {
      setIsLoadingVaults(false);
    }
  };

  const allServers = vaults.flatMap((v) => v.servers || []);
  const allCredentials = vaults.flatMap((v) => v.credentials || []);

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

  const getEditorUrl = () => {
    const scriptType = selectedNode.data?.scriptType || "Python Script";
    const type = scriptType.replace(" Script", "").toLowerCase();
    return `/code-editor?type=${type}&nodeId=${selectedNode.id}`;
  };

  const handleScriptSelect = (scriptId: string) => {
    onUpdateNode(selectedNode.id, { selectedScript: scriptId });
  };

  const handleCredentialSelect = (credentialId: string) => {
    const selectedCred = allCredentials.find(
      (cred: Credential) => cred.id === credentialId,
    );
    if (selectedCred) {
      onUpdateNode(selectedNode.id, {
        selectedCredential: {
          id: selectedCred.id,
          name: selectedCred.name,
          credential_type: selectedCred.credential_type,
          username: selectedCred.username,
          password: selectedCred.password,
          vault: selectedCred.vault,
        },
      });
    }
  };

  const handleServerSelect = (serverId: string) => {
    const selectedServer = allServers.find((s) => s.id === serverId);
    if (selectedServer) {
      const updates: any = {
        serverAddress: selectedServer.host,
      };

      // Auto-populate credential if associated
      if (selectedServer.credential) {
        const associatedCred = allCredentials.find(
          (c) => c.id === selectedServer.credential,
        );
        if (associatedCred) {
          updates.selectedCredential = {
            id: associatedCred.id,
            name: associatedCred.name,
            credential_type: associatedCred.credential_type,
            username: associatedCred.username,
            password: associatedCred.password,
            vault: associatedCred.vault,
          };
        }
      }
      onUpdateNode(selectedNode.id, updates);
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
      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-800 pb-2">
        Script Configuration
      </h4>

      <div>
        <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Execution Mode
        </Label>
        <Select
          value={selectedNode.data?.executionMode || "local"}
          onValueChange={(value) => handleInputChange("executionMode", value)}
        >
          <SelectTrigger className="w-full h-11 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
            <SelectValue placeholder="Select execution mode" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
            <SelectItem value="local">Local</SelectItem>
            <SelectItem value="remote">Remote</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Script Type
        </Label>
        <Select
          value={
            selectedNode.data?.scriptType ||
            (selectedNode.data?.executionMode === "local"
              ? "Python Script"
              : "Powershell Script")
          }
          onValueChange={(value) => handleInputChange("scriptType", value)}
        >
          <SelectTrigger className="w-full h-11 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
            <SelectValue placeholder="Select script type" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
            {/* Local Execution supports Python Script and Remote Execution supports Powershell Script and Shell Script depends on the OS of the remote server */}
            {selectedNode.data?.executionMode === "local" ? (
              <>
                <SelectItem value="Python Script">Python Script</SelectItem>
              </>
            ) : (
              <>
                <SelectItem value="Powershell Script">
                  Powershell Script
                </SelectItem>
                <SelectItem value="Shell Script">Shell Script</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
              className="w-full text-sm py-2.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-all duration-200"
            >
              <Code size={14} className="mr-2" />
              Write Script
            </Button>
          </Link>

          <Button
            onClick={handleUploadScript}
            size="sm"
            variant="outline"
            className="w-full text-sm py-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all duration-200"
          >
            <Upload size={14} className="mr-2" />
            Upload Script
          </Button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Script
          </label>
          <Select
            onValueChange={handleScriptSelect}
            value={selectedNode.data?.selectedScript || ""}
          >
            <SelectTrigger className="w-full h-11 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
              <SelectValue placeholder="Choose a script..." />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
              {getSavedScripts().map((script: ScriptFile) => (
                <SelectItem
                  key={script.id}
                  value={script.id}
                  className="text-sm"
                >
                  <div className="flex items-center space-x-2">
                    <FileText size={14} />
                    <span>{script.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {script.source === "upload" ? "↑" : "✏️"}
                    </span>
                  </div>
                </SelectItem>
              ))}
              {getSavedScripts().length === 0 && (
                <SelectItem
                  value="none"
                  disabled
                  className="text-sm text-gray-500 dark:text-gray-500"
                >
                  No scripts available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedNode.data?.executionMode === "remote" && (
        <>
          <div className="space-y-2 mt-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Server Configuration
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Add Server and Credential from the Vault
            </p>
          </div>
          <div>
            <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Server
            </Label>
            <Select
              onValueChange={handleServerSelect}
              value={
                allServers.find(
                  (s) => s.host === selectedNode.data?.serverAddress,
                )?.id || ""
              }
            >
              <SelectTrigger className="w-full h-11 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                <SelectValue placeholder="Select server from vault..." />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
                {isLoadingVaults ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    <span className="text-sm">Loading servers...</span>
                  </div>
                ) : (
                  <>
                    {allServers.map((server: Server) => (
                      <SelectItem
                        key={server.id}
                        value={server.id}
                        className="text-sm"
                      >
                        <div className="flex items-center space-x-2">
                          <ServerIcon size={14} />
                          <span>{server.name}</span>
                          <span className="text-xs text-gray-500">
                            ({server.host})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                    {allServers.length === 0 && (
                      <SelectItem value="none" disabled className="text-sm">
                        No servers found in vault
                      </SelectItem>
                    )}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Credentials
            </Label>
            <Select
              onValueChange={handleCredentialSelect}
              value={getSelectedCredentialId()}
            >
              <SelectTrigger className="w-full h-11 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                <SelectValue placeholder="Select credentials..." />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
                {isLoadingVaults ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    <span className="text-sm">Loading credentials...</span>
                  </div>
                ) : (
                  <>
                    {allCredentials.map((credential: Credential) => (
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
                    {allCredentials.length === 0 && (
                      <SelectItem
                        value="none"
                        disabled
                        className="text-sm text-gray-500 dark:text-gray-500"
                      >
                        No credentials available
                      </SelectItem>
                    )}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  );
};
