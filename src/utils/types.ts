export type ScriptLanguage = "python" | "powershell" | "shell" | "javascript";

export interface ScriptFile {
  id: string;
  name: string;
  content: string;
  language: ScriptLanguage;
  lastModified: Date;
  source: "upload" | "editor";
}

export interface Credential {
  id: string;
  name: string;
  username: string;
  password: string;
  createdAt: string;
}

export interface Parameter {
  id: string;
  name: string;
  type: "string" | "number" | "boolean" | "file";
  description?: string;
}

export interface NodeData {
  label?: string;
  type?: string;
  description?: string;
  scriptType?: "Python Script" | "Powershell Script" | "Shell Script";
  executionMode?: "local" | "remote";
  serverAddress?: string;
  selectedCredential?: Credential;
  selectedScript?: string;
  parameters?: Parameter[];
  conditionType?: "output-eval" | "condition" | "custom";
}

interface Position {
  x: number;
  y: number;
}

export interface Node {
  id: string;
  type?: string;
  position?: Position;
  data?: NodeData;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  label?: string;
  style?: {
    stroke?: string;
    strokeWidth?: number;
  };
}

export interface WorkflowData {
  nodes: Node[];
  edges: Edge[];
}
