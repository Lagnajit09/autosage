export interface Workflow {
  id: string;
  title: string;
  description: string;
  lastRun: string;
  runs: number;
  total_nodes: number;
  total_edges: number;
}
