import { apiRequest } from "../api-client";
import {
  LibraryItem,
  LibraryItemDetail,
  LibraryForkResult,
} from "@/components/Library/types";

const BASE_URL = "/api/library";

export const libraryService = {
  // List published library items (optionally filtered server-side).
  list: async (
    token: string,
    params?: { type?: string; category?: string; search?: string },
  ): Promise<LibraryItem[]> => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.category) qs.set("category", params.category);
    if (params?.search) qs.set("search", params.search);
    const query = qs.toString();
    const response = await apiRequest(
      `${BASE_URL}/${query ? `?${query}` : ""}`,
      {},
      token,
    );
    return response.data;
  },

  // Retrieve a single item including its `content` (for preview/fork).
  get: async (id: string, token: string): Promise<LibraryItemDetail> => {
    const response = await apiRequest(`${BASE_URL}/${id}/`, {}, token);
    return response.data;
  },

  // Fork an item into the user's account. Returns a type-specific payload:
  //  - workflow/script -> { redirect_url }
  //  - node            -> { node_data }
  fork: async (id: string, token: string): Promise<LibraryForkResult> => {
    const response = await apiRequest(
      `${BASE_URL}/${id}/fork/`,
      { method: "POST" },
      token,
    );
    return response.data;
  },
};
