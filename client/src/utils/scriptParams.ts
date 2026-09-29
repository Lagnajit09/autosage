import type { ScriptParameter } from "@/utils/types";

/**
 * Helpers for parameterized standalone script execution.
 *
 * The *set* of variables a script needs is derived from the `{{VAR}}`
 * placeholders in its body (the source of truth). Persisted `ScriptParameter`
 * metadata (type / default / secret) only enriches those detected names.
 */

// Matches {{VAR}} where VAR is a POSIX/PowerShell-safe identifier. The identifier
// class mirrors the exec-worker env-var rules (both executors skip invalid names).
const SCRIPT_VAR_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

// Client mirror of the Django secret-name heuristic (helpers/params.py).
const SECRET_NAME_RE =
  /(password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|passphrase|credential)/i;

export function isSecretParamName(name: string): boolean {
  return !!name && SECRET_NAME_RE.test(name);
}

/**
 * Extract the distinct `{{VAR}}` variable names from a script body.
 * Deduped case-insensitively (first casing wins); tokens containing a dot are
 * ignored as a defensive measure against `{{node.output.field}}`-style refs.
 */
export function extractScriptVariables(content: string): string[] {
  if (!content) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of content.matchAll(SCRIPT_VAR_RE)) {
    const name = match[1];
    if (!name || name.includes(".")) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export interface ResolvedScriptParam {
  name: string;
  type: "string" | "number" | "boolean" | "password";
  default: string;
  secret: boolean;
}

/**
 * Merge the variables detected in the body with persisted metadata, producing
 * the list the run drawer renders. Detected vars with no metadata default to
 * `type: "string"` and are flagged secret by the name heuristic.
 */
export function mergeScriptParams(
  detected: string[],
  meta: ScriptParameter[] | undefined,
): ResolvedScriptParam[] {
  const metaByName = new Map<string, ScriptParameter>();
  for (const m of meta || []) {
    if (m?.name) metaByName.set(m.name.toLowerCase(), m);
  }

  return detected.map((name) => {
    const m = metaByName.get(name.toLowerCase());
    const type = m?.type || "string";
    const secret = !!m?.secret || type === "password" || isSecretParamName(name);
    return {
      name,
      type,
      // Secret params never carry a stored default.
      default: secret ? "" : m?.default || "",
      secret,
    };
  });
}
