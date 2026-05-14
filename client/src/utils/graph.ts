import type { Edge, Node } from "@xyflow/react";

/**
 * Validation helpers for the workflow builder, mirroring the structural rules
 * the Django backend enforces in server/execution_engine/helpers/graph.py.
 * Pure functions, no React Flow runtime dependency.
 */

/** True when the source is a decision node AND an edge with the same
 *  sourceHandle ("true" | "false") already exists from that node. */
export function isDuplicateDecisionHandle(
  source: string,
  sourceHandle: string | null | undefined,
  edges: Edge[],
  nodes: Node[],
): boolean {
  const sourceNode = nodes.find((n) => n.id === source);
  if (sourceNode?.type !== "decision") return false;
  if (sourceHandle !== "true" && sourceHandle !== "false") return false;
  return edges.some(
    (e) => e.source === source && e.sourceHandle === sourceHandle,
  );
}

/** True when adding source→target would create a cycle (or a self-loop).
 *  Implemented as a BFS forward from `target`; if we ever reach `source`,
 *  closing the edge back to it would form a cycle. */
export function wouldCreateCycle(
  source: string,
  target: string,
  edges: Edge[],
): boolean {
  if (source === target) return true;
  const visited = new Set<string>([target]);
  const queue: string[] = [target];
  while (queue.length) {
    const current = queue.shift()!;
    for (const e of edges) {
      if (e.source !== current) continue;
      if (e.target === source) return true;
      if (!visited.has(e.target)) {
        visited.add(e.target);
        queue.push(e.target);
      }
    }
  }
  return false;
}

/** Return null when the proposed connection is valid, or a user-facing
 *  reason string suitable for `toast.error()`. */
export function validateConnection(
  source: string,
  target: string,
  sourceHandle: string | null | undefined,
  edges: Edge[],
  nodes: Node[],
): string | null {
  if (source === target) return "Cannot connect a node to itself.";
  if (wouldCreateCycle(source, target, edges))
    return "Cannot create this edge — it would create a cycle in the workflow.";
  if (isDuplicateDecisionHandle(source, sourceHandle, edges, nodes)) {
    const branch = sourceHandle === "true" ? "True" : "False";
    return `Decision node already has a ${branch} branch — delete it first to reroute.`;
  }
  return null;
}
