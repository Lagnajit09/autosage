export interface Workflow {
  id: string;
  title: string;
  description: string;
  status: "active" | "draft" | "paused";
  lastRun: string;
  avgDuration: string;
  runs: number;
  tags: string[];
}
