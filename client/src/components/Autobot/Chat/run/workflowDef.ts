/**
 * Shared workflow-definition cache + helpers, used by both the Graph tab
 * (`RunGraph`, for node/edge layout) and the Response tab (`RunPanel`, for the
 * effective parameters). One module-level cache → one fetch per workflow id,
 * no matter how many tabs/cards reference it.
 */

import { apiRequest } from "@/lib/api-client";
import type { WorkflowData } from "@/utils/types";

const cache = new Map<string, WorkflowData>();

export const getCachedWorkflowDef = (workflowId: string): WorkflowData | null =>
  cache.get(workflowId) ?? null;

/** Fetch `GET /api/workflows/<id>/` once and cache it. Returns null on failure. */
export const fetchWorkflowDef = async (
  workflowId: string,
  token: string | null,
): Promise<WorkflowData | null> => {
  const hit = cache.get(workflowId);
  if (hit) return hit;
  try {
    const res = await apiRequest(`/api/workflows/${workflowId}/`, {}, token);
    const data: WorkflowData | undefined = res?.data ?? res;
    if (data && Array.isArray(data.nodes)) {
      cache.set(workflowId, data);
      return data;
    }
  } catch {
    /* best-effort */
  }
  return null;
};

export interface EffectiveParams {
  values: Record<string, unknown>;
  /** Keys to render masked (password params). */
  secretKeys: Set<string>;
}

/**
 * The parameters a run ACTUALLY used: the workflow's baked-in node-parameter
 * values, overlaid with any run-time `inputs` override (keyed by param id).
 *
 * Autobot runs usually pass no `inputs` (relying on baked-in defaults), so the
 * persisted `WorkflowRun.inputs` is empty — showing only that leaves the
 * Response tab blank. This surfaces the real, effective parameters instead.
 * Password-typed params are flagged for masking (and Django already stores any
 * override password as "*****").
 */
export const effectiveWorkflowParams = (
  def: WorkflowData,
  runInputs: Record<string, unknown> | null | undefined,
): EffectiveParams => {
  const values: Record<string, unknown> = {};
  const secretKeys = new Set<string>();
  const inputs = runInputs || {};
  for (const node of def.nodes) {
    const params = node.data?.parameters;
    if (!Array.isArray(params)) continue;
    for (const p of params) {
      const key = p.name || p.id;
      if (!key) continue;
      const override = p.id ? inputs[p.id] : undefined;
      const value =
        override !== undefined && override !== "" ? override : (p.value ?? "");
      values[key] = value;
      if (p.type === "password") secretKeys.add(key);
    }
  }
  return { values, secretKeys };
};
