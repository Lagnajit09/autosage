import { SignUpData, AuthResponse, SignInData } from "@/utils/types";
import { apiRequest } from "../api-client";

export const signup = async (data: SignUpData): Promise<AuthResponse> => {
  try {
    const responseData = await apiRequest("/users/api/v1/users/", {
      method: "POST",
      body: JSON.stringify(data),
    });

    // If signup is successful, proceed to sign in
    return await signin({ username: data.username, password: data.password });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    return {
      success: false,
      message: message || "Sign up failed.",
    };
  }
};

export const signin = async (data: SignInData): Promise<AuthResponse> => {
  try {
    const tokenData = await apiRequest("/users/api/v1/token/login/", {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (tokenData.auth_token) {
      localStorage.setItem("authToken", tokenData.auth_token);
      return { success: true, message: "Signed in successfully!" };
    } else {
      return { success: false, message: "Failed to retrieve access token." };
    }
  } catch (error: unknown) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.",
    };
  }
};
