export type ScriptLanguage = "python" | "powershell" | "shell" | "javascript";

export interface ScriptFile {
  id: string;
  name: string;
  content: string;
  language: ScriptLanguage;
  lastModified: Date;
  source: "upload" | "editor";
}

export interface Parameter {
  id: string;
  name: string;
  type: "string" | "number" | "boolean" | "file";
  description?: string;
  value?: string;
  sourceType?: "manual" | "output";
}

export interface OutputField {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
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
  outputFormat?: "text" | "json";
  jsonSchema?: OutputField[];

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
    selectedCredential?: Credential;
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
  name: string;
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
    sourceHandle?: string,
  ) => void;
}

export interface Trigger {
  id: string;
  type: string;
  name: string;
}

export interface SignUpData {
  username: string;
  email: string;
  password: string;
}

export interface SignInData {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: any;
}

export interface Vault {
  id: string;
  name: string;
  description: string;
  credentials?: Credential[];
  servers?: Server[];
}

export interface Credential {
  id: string;
  vault: string;
  name: string;
  credential_type: "username_password" | "ssh_key" | "certificate";
  username?: string;
  password?: string;
  ssh_key?: string;
  key_passphrase?: string;
  cert_pem?: string;
}

export interface Server {
  id: string;
  vault: string;
  name: string;
  host: string;
  port?: number;
  connection_method: "winrm" | "ssh";
  credential?: string;
}
