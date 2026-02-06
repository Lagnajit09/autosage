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
  OutputField,
} from "@/utils/types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@clerk/clerk-react";
import { apiRequest } from "@/lib/api-client";
import { toast } from "sonner";
import { JSONSchemaModal } from "./JSONSchemaModal";
import { scriptService, mapScriptToScriptFile } from "@/lib/api/scripts";

export const ScriptConf: React.FC<BaseConfigProps> = ({
  selectedNode,
  onUpdateNode,
}) => {
  const { getToken, isSignedIn } = useAuth();
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [isLoadingVaults, setIsLoadingVaults] = useState(false);
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);
  const [savedScripts, setSavedScripts] = useState<ScriptFile[]>([]);
  const [isLoadingScripts, setIsLoadingScripts] = useState(false);

  useEffect(() => {
    if (isSignedIn) {
      if (selectedNode.data?.executionMode === "remote") {
        fetchVaults();
      }
      fetchScripts();
    }
  }, [selectedNode.data?.executionMode, isSignedIn]);

  const fetchScripts = async () => {
    setIsLoadingScripts(true);
    try {
      const token = await getToken();
      if (token) {
        const scripts = await scriptService.getAll(token);
        const scriptFiles = scripts.map((s) => mapScriptToScriptFile(s));
        setSavedScripts(scriptFiles);
      }
    } catch (error) {
      console.error("Failed to fetch scripts:", error);
      toast.error("Failed to load scripts");
    } finally {
      setIsLoadingScripts(false);
    }
  };

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

  const handleInputChange = (field: string, value: any) => {
    onUpdateNode(selectedNode.id, { [field]: value });
  };

  // Helper to get current script type, defaulting to Python if nothing selected
  const currentScriptType =
    selectedNode.data?.selectedScript?.type || "Python Script";

  const handleUploadScript = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".py,.ps1,.sh,.js";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const content = e.target?.result as string;
          const token = await getToken();

          if (!token) {
            toast.error("Please sign in to upload scripts");
            return;
          }

          try {
            // Determine language
            let language = "javascript";
            if (file.name.endsWith(".py")) language = "python";
            else if (file.name.endsWith(".ps1")) language = "powershell";
            else if (file.name.endsWith(".sh")) language = "shell";

            const basename = file.name.replace(/\.[^/.]+$/, "");

            const createdScript = await scriptService.create(
              basename,
              language,
              content,
              token,
            );
            const newFile = mapScriptToScriptFile(createdScript, content);

            setSavedScripts((prev) => [...prev, newFile]);
            toast.success("Script uploaded successfully");

            // Auto-select the uploaded script
            onUpdateNode(selectedNode.id, {
              selectedScript: {
                type:
                  language === "python"
                    ? "Python Script"
                    : language === "powershell"
                      ? "Powershell Script"
                      : "Shell Script",
                script_id: createdScript.id.toString(),
              },
            });
          } catch (error: any) {
            console.error("Upload failed", error);
            toast.error(error.message || "Failed to upload script");
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const getSavedScripts = () => {
    try {
      return savedScripts.filter((file: ScriptFile) => {
        const expectedLanguage = currentScriptType
          .replace(" Script", "")
          .toLowerCase();
        return file.language === expectedLanguage;
      });
    } catch (error) {
      console.error("Error loading scripts:", error);
    }
    return [];
  };

  const handleScriptSelect = (scriptId: string) => {
    onUpdateNode(selectedNode.id, {
      selectedScript: {
        type: currentScriptType,
        script_id: scriptId,
      },
    });
  };

  const handleScriptTypeChange = (type: string) => {
    onUpdateNode(selectedNode.id, {
      selectedScript: {
        type: type as any,
        script_id: "", // Reset selection on type change
      },
    });
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
        selectedServer: selectedServer,
      };

      // Auto-populate credential if associated
      if (selectedServer.credential) {
        const associatedCred = allCredentials.find(
          (c) => c.id === selectedServer.credential,
        );
        if (associatedCred) {
          updates.selectedCredential = associatedCred;
        }
      }
      onUpdateNode(selectedNode.id, updates);
    }
  };

  const handleSchemaSave = (schema: OutputField[]) => {
    onUpdateNode(selectedNode.id, { jsonSchema: schema });
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
          value={selectedNode.data?.executionMode}
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
          value={currentScriptType}
          onValueChange={(value) => handleScriptTypeChange(value)}
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
            to={"/script-editor"}
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
            value={selectedNode.data?.selectedScript?.script_id || ""}
          >
            <SelectTrigger className="w-full h-11 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
              <SelectValue placeholder="Choose a script..." />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
              {isLoadingScripts ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-sm">Loading scripts...</span>
                </div>
              ) : (
                getSavedScripts().map((script: ScriptFile) => (
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
                ))
              )}
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
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-800 pb-2">
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
              value={selectedNode.data?.selectedServer?.id || ""}
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

      <div className="space-y-4 mt-4">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-800 pb-2">
          Output Formatting
        </p>

        <div className="space-y-4">
          <div>
            <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Output Format
            </Label>
            <Select
              value={selectedNode.data?.outputFormat || "text"}
              onValueChange={(value: "text" | "json") =>
                handleInputChange("outputFormat", value)
              }
            >
              <SelectTrigger className="w-full h-11 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                <SelectValue placeholder="Select output format" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
                <SelectItem value="text">Plain Text</SelectItem>
                <SelectItem value="json">Structured JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedNode.data?.outputFormat === "json" && (
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSchemaModalOpen(true)}
                className="w-full text-sm py-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all duration-200"
              >
                <Code size={14} className="mr-2" />
                {selectedNode.data?.jsonSchema &&
                selectedNode.data.jsonSchema.length > 0
                  ? "Edit JSON Schema"
                  : "Design JSON Schema"}
              </Button>
              {selectedNode.data?.jsonSchema &&
                selectedNode.data.jsonSchema.length > 0 && (
                  <div className="mt-2 border-2 border-blue-300 dark:border-blue-500 bg-blue-600/10 rounded-lg p-4 flex flex-col gap-2">
                    {selectedNode.data.jsonSchema.map((field) => (
                      <div
                        key={field.name}
                        className="flex items-center justify-between"
                      >
                        <p className="text-xs text-gray-700 dark:text-gray-300">
                          {field.name}
                        </p>
                        <p className="text-xs text-gray-700 dark:text-gray-300">
                          {field.type}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      <JSONSchemaModal
        isOpen={isSchemaModalOpen}
        onClose={() => setIsSchemaModalOpen(false)}
        schema={selectedNode.data?.jsonSchema || []}
        onSave={handleSchemaSave}
      />
    </div>
  );
};
