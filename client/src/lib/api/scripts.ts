import { apiRequest } from "../api-client";
import {
  ScriptFile,
  ScriptLanguage,
  ScriptResponse,
  ScriptContentResponse,
} from "@/utils/types";

const BASE_URL = "/api/scripts";

// Convert API response to ScriptFile (content might be missing initially)
export const mapScriptToScriptFile = (
  script: ScriptResponse,
  content: string = "",
): ScriptFile => {
  // Determine language from content_type or extension
  let language: ScriptLanguage = "javascript"; // fallback
  const ext = script.name.split(".").pop()?.toLowerCase();

  if (ext === "py") language = "python";
  else if (ext === "ps1") language = "powershell";
  else if (ext === "sh") language = "shell";
  else if (ext === "js") language = "javascript";

  return {
    id: script.id.toString(),
    name: script.name,
    content: content,
    language: language,
    lastModified: new Date(script.updated_at),
    source: "upload", // or editor, backend doesn't distinguish but it's persisted now
  };
};

export const scriptService = {
  // List all scripts (metadata only)
  getAll: async (token: string): Promise<ScriptResponse[]> => {
    const response = await apiRequest(`${BASE_URL}/`, {}, token);
    return response.data;
  },

  // Get specific script content
  getContent: async (
    id: string,
    token: string,
  ): Promise<ScriptContentResponse> => {
    const response = await apiRequest(`${BASE_URL}/${id}/content/`, {}, token);
    return response.data;
  },

  // Create new script
  create: async (
    name: string,
    language: string,
    content: string,
    token: string,
  ): Promise<ScriptResponse> => {
    const response = await apiRequest(
      `${BASE_URL}/`,
      {
        method: "POST",
        body: JSON.stringify({ name, language, content }),
      },
      token,
    );
    return response.data;
  },

  // Update script content
  update: async (
    id: string,
    content: string,
    token: string,
  ): Promise<ScriptResponse> => {
    const response = await apiRequest(
      `${BASE_URL}/${id}/update/`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      },
      token,
    );
    return response.data;
  },

  // Rename script
  rename: async (
    id: string,
    newName: string,
    token: string,
  ): Promise<ScriptResponse> => {
    const response = await apiRequest(
      `${BASE_URL}/${id}/rename/`,
      {
        method: "POST",
        body: JSON.stringify({ new_name: newName }),
      },
      token,
    );
    return response.data;
  },

  // Delete script
  delete: async (id: string, token: string): Promise<void> => {
    await apiRequest(
      `${BASE_URL}/${id}/`,
      {
        method: "DELETE",
      },
      token,
    );
  },
};
