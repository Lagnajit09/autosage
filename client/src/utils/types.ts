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

export interface Attachment {
  id: string;
  name: string;
  url: string;
  size: number;
  createdAt: string;
}

export interface NodeData {
  label?: string;
  type?: string;
  description?: string;
  parameters?: Parameter[];

  // Script specific fields
  scriptType?: "Python Script" | "Powershell Script" | "Shell Script";
  executionMode?: "local" | "remote";
  serverAddress?: string;
  selectedCredential?: Credential;
  selectedScript?: string;

  // Decision specific fields
  condition?: string;
  trueLabel?: string[];
  falseLabel?: string[];

  // Trigger specific fields
  schedule?: string;
  watchPath?: string;
  webhookUrl?: string;
  webhookMethod?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  webhookHeaders?: Record<string, string>;
  webhookBody?: string;

  // Email specific fields
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  isHTML?: boolean;
  attachments?: Attachment[];
  smtpConfig?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      username: string;
      password: string;
    };
  };
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

export interface BaseConfigProps {
  selectedNode: Node;
  onUpdateNode: (nodeId: string, data: Partial<NodeData>) => void;
}

export interface EdgeConfigProps {
  selectedEdge: Edge;
  onUpdateEdge: (edgeId: string, updates: Partial<Edge>) => void;
  onDeleteEdge: (edgeId: string) => void;
}

export interface DecisionConfigProps extends BaseConfigProps {
  nodes: Node[];
  onCreateEdge?: (
    sourceId: string,
    targetId: string,
    sourceHandle?: string
  ) => void;
}
