import { useState, useEffect } from "react";
import { Server, Credential } from "@/utils/types";
import { apiRequest } from "@/lib/api-client";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";

export function useScriptExecution() {
  const { getToken } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoadingData(true);
    try {
      const token = await getToken();

      const [serversRes, credentialsRes] = await Promise.all([
        apiRequest("/api/vault/servers/", {}, token),
        apiRequest("/api/vault/credentials/", {}, token),
      ]);

      if (serversRes.success) {
        setServers(serversRes.data);
      }

      if (credentialsRes.success) {
        setCredentials(credentialsRes.data);
      }
    } catch (error) {
      console.error("Failed to fetch execution data:", error);
      toast.error("Failed to load servers/credentials");
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (selectedServerId && servers.length > 0) {
      const server = servers.find((s) => s.id === selectedServerId);
      if (server?.credential) {
        setSelectedCredentialId(String(server.credential));
      }
    }
  }, [selectedServerId, servers]);

  const executeScript = async (scriptId: string) => {
    if (!selectedServerId) {
      toast.error("Please select a server");
      return;
    }

    setIsExecuting(true);
    setLogs(["Initializing execution...", "Connecting to server...", ""]);

    // Mock execution for now
    setTimeout(() => {
      setLogs((prev) => [
        ...prev,
        "Connected to server.",
        "Executing script...",
        "",
      ]);
    }, 1000);

    setTimeout(() => {
      setLogs((prev) => [
        ...prev,
        "Script executed successfully.",
        "Output:",
        "Hello World!",
        "Script executed successfully.",
        "Output: { 'status': 'success', 'message': 'Script executed successfully.' }",
        "Response Status: 201",
      ]);
      setIsExecuting(false);
    }, 3000);
  };

  return {
    servers,
    credentials,
    isLoadingData,
    selectedServerId,
    setSelectedServerId,
    selectedCredentialId,
    setSelectedCredentialId,
    executeScript,
    isExecuting,
    logs,
    setLogs,
  };
}
