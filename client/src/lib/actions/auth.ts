import { SignUpData, AuthResponse, SignInData } from "@/utils/types";

export const signup = async (data: SignUpData): Promise<AuthResponse> => {
    const apiUrl = import.meta.env.VITE_API_URL;
    try {
        const res = await fetch(`${apiUrl}/users/api/v1/users/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        })

        if (!res.ok) {
            const errorData = await res.json();
            const firstKey = Object.keys(errorData)[0];
            const message = Array.isArray(errorData[firstKey]) ? errorData[firstKey][0] : errorData[firstKey];
            return { success: false, message: message || "Sign up failed." };
        }
        
        // If signup is successful, proceed to sign in
        return await signin({ username: data.username, password: data.password });
    } catch (error: any) {
        return {success: false, message: error.message || "An unexpected error occurred."}
    }
}

export const signin = async (data: SignInData): Promise<AuthResponse> => {
    const apiUrl = import.meta.env.VITE_API_URL;
    try {
        const res = await fetch(`${apiUrl}/users/api/v1/token/login/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });

        if (!res.ok) {
            const errorData = await res.json();
            return { success: false, message: errorData.detail || "Sign in failed." };
        }

        const tokenData = await res.json();
        if (tokenData.auth_token) {
            localStorage.setItem("authToken", tokenData.auth_token);
            return { success: true, message: "Signed in successfully!" };
        } else {
            return { success: false, message: "Failed to retrieve access token." };
        }
    } catch (error: any) {
        return { success: false, message: error.message || "An unexpected error occurred." };
    }
};