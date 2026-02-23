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

  const executeScript = async (script: any) => {
    if (!selectedServerId) {
      toast.error("Please select a server");
      return;
    }

    const server = servers.find((s) => s.id === selectedServerId);
    if (!server) {
      toast.error("Selected server not found");
      return;
    }

    setIsExecuting(true);
    setLogs([`> Initializing execution for ${script.name}...`]);

    try {
      const token = await getToken();

      const payload = {
        script_details: {
          script_id: parseInt(script.id),
          script_name: script.name,
          pathname: script.pathname || "",
          url: script.blobUrl || "",
        },
        vault_details: {
          vault_id: server.vault,
          server_id: server.id,
          credential_id:
            selectedCredentialId === "none"
              ? server.credential
              : selectedCredentialId,
        },
        inputs: {},
      };

      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/execution-engine/run/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token
              ? token.split(".").length === 3
                ? `Bearer ${token}`
                : token
              : "",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          err.message || `Execution failed with status ${response.status}`,
        );
      }

      if (!response.body) {
        throw new Error("No response body received from server");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const eventMatch = line.match(/event:\s*(.+)/);
          const dataMatch = line.match(/data:\s*(.+)/);

          if (eventMatch && dataMatch) {
            const event = eventMatch[1].trim();
            try {
              const data = JSON.parse(dataMatch[1].trim());
              handleSSEEvent(event, data);
            } catch (e) {
              console.error("Failed to parse SSE data", e);
            }
          }
        }
      }
    } catch (error: any) {
      console.error("Execution error:", error);
      setLogs((prev) => [...prev, `[ERROR] ${error.message}`]);
      toast.error(error.message || "Failed to execute script");
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSSEEvent = (event: string, data: any) => {
    switch (event) {
      case "stdout":
      case "stderr":
      case "log":
        if (data.data !== undefined) {
          setLogs((prev) => [...prev, data.data]);
        }
        break;
      case "status":
        setLogs((prev) => [...prev, `[STATUS] ${data.status.toUpperCase()}`]);
        break;
      case "exit_code":
        setLogs((prev) => [
          ...prev,
          `[EXIT] Process exited with code ${data.exit_code}`,
        ]);
        break;
      case "error":
        setLogs((prev) => [...prev, `[ERROR] ${data.message}`]);
        break;
      case "done":
        setLogs((prev) => [...prev, "> Execution finished."]);
        break;
      default:
        console.warn("Unknown event type:", event, data);
    }
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
