import { sanitizeInput } from "@/sanitizers";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";
export const AI_API_BASE_URL =
  import.meta.env.VITE_AI_API_URL || "http://localhost:3001";

export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {},
  token: string | null = null,
) => {
  const headers = new Headers(options.headers);

  // If no token provided, return error
  if (!token) {
    return {
      success: false,
      message: "No authentication token provided.",
    };
  }

  if (token) {
    const isJWT = token.split(".").length === 3;
    headers.set("Authorization", isJWT ? `Bearer ${token}` : token);
  }

  // Sanitize body if it's a JSON string
  if (options.body && typeof options.body === "string") {
    try {
      const parsedBody = JSON.parse(options.body);
      const sanitizedBody = sanitizeInput(parsedBody);
      options.body = JSON.stringify(sanitizedBody);
    } catch (e) {
      // If not JSON, just sanitize as string if it's small/relevant
      options.body = sanitizeInput(options.body) as string;
    }
  }

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      if (response.status >= 500) {
        window.dispatchEvent(new CustomEvent("server-error"));
      }

      if (response.status === 429) {
        window.dispatchEvent(new CustomEvent("limit-exceeded"));
      }

      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail || errorData.message || "An error occurred",
      );
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error && error.message === "Failed to fetch") {
      window.dispatchEvent(new CustomEvent("server-error"));
    }

    throw error;
  }
};
