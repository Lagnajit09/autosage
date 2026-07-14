export type LibraryItemType = "workflow" | "node" | "script" | "module";

export interface LibraryItem {
  id: string;
  type: LibraryItemType;
  name: string;
  description: string;
  category: string;
  tags: string[];
  author: string;
  version: string;
  downloads: number;
  is_verified: boolean;
  created_at: string;
  modified_at: string;
}

export interface LibraryItemDetail extends LibraryItem {
  content: Record<string, unknown>;
}

// Shape returned by POST /api/library/<id>/fork/. Only some fields are present
// depending on the item type.
export interface LibraryForkResult {
  type: "workflow" | "script" | "node";
  id?: string | number;
  name?: string;
  redirect_url?: string;
  node_data?: {
    nodeType: "trigger" | "action" | "decision";
    data: Record<string, unknown>;
  };
}

// Clipboard sentinel used to copy a library node so the workflow builder's
// paste handler can recognise and inject it.
export const LIBRARY_NODE_CLIPBOARD_KEY = "__autosageLibraryNode";
