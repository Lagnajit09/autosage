export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";
export const AI_API_BASE_URL =
  import.meta.env.VITE_AI_API_URL || "http://localhost:3001";

export const getAuthToken = () => localStorage.getItem("authToken");

export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {},
  token: string | null = null
) => {
  const headers = new Headers(options.headers);

  // If no token provided, try to get it from localStorage
  if (!token) {
    token = getAuthToken();
  }

  if (token) {
    const isJWT = token.split(".").length === 3;
    headers.set("Authorization", isJWT ? `Bearer ${token}` : token);
  }

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.message || "An error occurred"
    );
  }

  return response.json();
};
