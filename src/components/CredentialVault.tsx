import React, { useState, useEffect } from "react";
import { X, Plus, Eye, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Credential {
  id: string;
  name: string;
  username: string;
  password: string;
  createdAt: string;
}

interface CredentialVaultProps {
  onClose: () => void;
}

export const CredentialVault: React.FC<CredentialVaultProps> = ({
  onClose,
}) => {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [newCredential, setNewCredential] = useState({
    name: "",
    username: "",
    password: "",
  });
  const [showPasswords, setShowPasswords] = useState<{
    [key: string]: boolean;
  }>({});
  const [nameError, setNameError] = useState("");

  // Load credentials from sessionStorage on component mount
  useEffect(() => {
    const savedCredentials = sessionStorage.getItem("workflowCredentials");
    if (savedCredentials) {
      try {
        setCredentials(JSON.parse(savedCredentials));
      } catch (error) {
        console.error("Error loading credentials:", error);
      }
    }
  }, []);

  // Save credentials to sessionStorage whenever credentials change
  useEffect(() => {
    sessionStorage.setItem("workflowCredentials", JSON.stringify(credentials));
  }, [credentials]);

  const validateCredentialName = (name: string): boolean => {
    if (!name.trim()) {
      setNameError("Credential name is required");
      return false;
    }

    const nameExists = credentials.some(
      (cred) => cred.name.toLowerCase() === name.toLowerCase()
    );
    if (nameExists) {
      setNameError("Credential name already exists");
      return false;
    }

    setNameError("");
    return true;
  };

  const handleAddCredential = () => {
    if (!validateCredentialName(newCredential.name)) {
      return;
    }

    if (newCredential.username && newCredential.password) {
      const credential: Credential = {
        id: `cred-${Date.now()}`,
        name: newCredential.name,
        username: newCredential.username,
        password: newCredential.password,
        createdAt: new Date().toISOString(),
      };

      setCredentials((prev) => [...prev, credential]);
      setNewCredential({ name: "", username: "", password: "" });
      setNameError("");
    }
  };

  const handleDeleteCredential = (credentialId: string) => {
    setCredentials((prev) => prev.filter((cred) => cred.id !== credentialId));
  };

  const togglePasswordVisibility = (credentialId: string) => {
    setShowPasswords((prev) => ({
      ...prev,
      [credentialId]: !prev[credentialId],
    }));
  };

  const handleNameChange = (value: string) => {
    setNewCredential((prev) => ({ ...prev, name: value }));
    if (nameError) {
      setNameError("");
    }
  };

  return (
    <div className="absolute top-full right-0 mt-1 w-96 bg-slate-800/95 backdrop-blur-sm border border-slate-700/50 rounded-lg shadow-xl z-50 overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <svg
            className="w-4 h-4 text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <h3 className="text-sm font-semibold text-white">Credential Vault</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-700/50 rounded-md transition-colors duration-200 text-slate-400 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tabs Content */}
      <Tabs defaultValue="view" className="h-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-700/30 my-2 rounded-md">
          <TabsTrigger
            value="view"
            className="text-xs text-slate-300 data-[state=active]:bg-slate-600/50 data-[state=active]:text-white"
          >
            View Credentials
          </TabsTrigger>
          <TabsTrigger
            value="add"
            className="text-xs text-slate-300 data-[state=active]:bg-slate-600/50 data-[state=active]:text-white"
          >
            Add New
          </TabsTrigger>
        </TabsList>

        <TabsContent value="view" className="mt-0 h-80">
          {credentials.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-xs text-slate-400 mb-2">
                  No credentials saved
                </p>
                <p className="text-xs text-slate-500">
                  Use the "Add New" tab to create your first credential
                </p>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full px-3">
              <div className="space-y-2 py-2">
                {credentials.map((credential) => (
                  <div
                    key={credential.id}
                    className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/30"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-white truncate">
                        {credential.name}
                      </h4>
                      <button
                        onClick={() => handleDeleteCredential(credential.id)}
                        className="p-1 hover:bg-red-600/20 rounded text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">Username: </span>
                        <span className="font-mono">{credential.username}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-300 flex-1">
                          <span className="text-slate-500">Password: </span>
                          <span className="font-mono">
                            {showPasswords[credential.id]
                              ? credential.password
                              : "••••••••"}
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            togglePasswordVisibility(credential.id)
                          }
                          className="p-1 hover:bg-slate-600/50 rounded text-slate-400 hover:text-white transition-colors ml-2"
                        >
                          {showPasswords[credential.id] ? (
                            <EyeOff size={12} />
                          ) : (
                            <Eye size={12} />
                          )}
                        </button>
                      </div>
                      <div className="text-xs text-slate-500">
                        Created:{" "}
                        {new Date(credential.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="add" className="mt-0 h-80">
          <div className="p-3 h-full flex flex-col ">
            <h4 className="text-sm font-medium text-white mb-3">
              Add New Credential
            </h4>
            <div className="space-y-3 flex-1">
              <div>
                <input
                  type="text"
                  placeholder="Credential name (must be unique)"
                  value={newCredential.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className={`w-full px-3 py-2 text-sm bg-slate-700/50 border rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 transition-all ${
                    nameError
                      ? "border-red-500/50 focus:ring-red-500/50"
                      : "border-slate-600/50 focus:ring-blue-500/50"
                  }`}
                />
                {nameError && (
                  <p className="text-xs text-red-400 mt-1">{nameError}</p>
                )}
              </div>
              <input
                type="text"
                placeholder="Username"
                value={newCredential.username}
                onChange={(e) =>
                  setNewCredential((prev) => ({
                    ...prev,
                    username: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
              <input
                type="password"
                placeholder="Password"
                value={newCredential.password}
                onChange={(e) =>
                  setNewCredential((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
            </div>
            <div className="mt-4">
              <Button
                onClick={handleAddCredential}
                disabled={
                  !newCredential.name ||
                  !newCredential.username ||
                  !newCredential.password ||
                  !!nameError
                }
                className="w-full text-sm py-2 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-400 hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                <Plus size={14} className="mr-2" />
                Add Credential
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
