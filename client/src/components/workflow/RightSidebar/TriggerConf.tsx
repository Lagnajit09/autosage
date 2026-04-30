import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { Braces, Check, Copy, Loader2, RefreshCw } from "lucide-react";

import { BaseConfigProps, Node } from "@/utils/types";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  createHttpTrigger,
  getHttpTrigger,
  regenerateHttpTriggerSecret,
} from "@/lib/actions/triggers";
import { getWorkflowByID } from "@/lib/actions/workflow";

import { HttpTriggerSecretModal } from "./HttpTriggerSecretModal";

interface HttpTriggerInfo {
  triggerUrl: string;
  secretLast4: string;
  createdAt: string;
  rotatedAt?: string | null;
  lastTriggeredAt?: string | null;
}

const HttpTriggerConf: React.FC<BaseConfigProps> = ({
  selectedNode,
  onUpdateNode,
  workflowId,
  nodes,
}) => {
  const { getToken, isSignedIn } = useAuth();
  const [info, setInfo] = useState<HttpTriggerInfo | null>(
    selectedNode.data?.httpTrigger ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);
  const [revealed, setRevealed] = useState<{
    secret: string;
    triggerUrl: string;
    rotated: boolean;
  } | null>(null);
  const [fetchedNodes, setFetchedNodes] = useState<Node[] | null>(null);

  // Pull the persisted workflow JSON for the input-template builder. The
  // in-memory `nodes` prop has been observed to be missing `parameters` in
  // some load paths, so the saved workflow is the source of truth here.
  // Live edits in the canvas will still flow through the in-memory fallback
  // below until the next save+refetch.
  useEffect(() => {
    if (!workflowId || !isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const response = await getWorkflowByID(workflowId, token);
        const fetched = response?.data?.nodes;
        if (!cancelled && Array.isArray(fetched)) {
          setFetchedNodes(fetched as Node[]);
        }
      } catch (err) {
        console.warn("Failed to fetch workflow nodes:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowId, isSignedIn, getToken]);

  // Walk every non-trigger node and collect parameters so the caller knows
  // what keys the workflow expects in `inputs`. Parameter IDs are opaque
  // (e.g. "param-1700000000000"), so without this surface they'd be invisible.
  // Each value reflects the configured default — static value for manual
  // params, the `{{node.output.field}}` reference for upstream-bound params,
  // a placeholder for missing values, and `*****` for password types.
  const { inputBodyTemplate, inputParamCount, nodeCount, sourceLabel } = useMemo(() => {
    let list: Node[] = [];
    let label = "in-memory canvas";
    if (fetchedNodes && fetchedNodes.length > 0) {
      list = fetchedNodes;
      label = "saved workflow";
    } else if (nodes && nodes.length > 0) {
      list = nodes;
    }

    const inputs: Record<string, string> = {};
    let count = 0;
    for (const node of list) {
      if (node.type === "trigger") continue;
      for (const p of node.data?.parameters ?? []) {
        if (!p.id) continue;
        const name = p.name || "(unnamed)";
        const type = p.type || "string";
        let example: string;
        if (type === "password") {
          example = "*****";
        } else if (p.value && String(p.value).trim().length > 0) {
          example = String(p.value);
        } else {
          example = `<${name} (${type})>`;
        }
        inputs[p.id] = example;
        count += 1;
      }
    }
    return {
      inputBodyTemplate: JSON.stringify({ inputs }, null, 2),
      inputParamCount: count,
      nodeCount: list.length,
      sourceLabel: label,
    };
  }, [fetchedNodes, nodes]);

  // Reconcile local node data with server (handles cross-tab regeneration
  // and workflows saved before the httpTrigger field existed).
  const refresh = useCallback(async () => {
    if (!workflowId || !isSignedIn) return;
    setLoading(true);
    try {
      const token = await getToken();
      const response = await getHttpTrigger(workflowId, selectedNode.id, token);
      if (response?.success && response.data) {
        const d = response.data;
        const next: HttpTriggerInfo = {
          triggerUrl: d.trigger_url,
          secretLast4: d.secret_last4,
          createdAt: d.created_at,
          rotatedAt: d.rotated_at,
          lastTriggeredAt: d.last_triggered_at,
        };
        setInfo(next);
        onUpdateNode(selectedNode.id, { httpTrigger: next });
      } else {
        // 404 or unsuccessful — no trigger exists on the server
        setInfo(null);
        if (selectedNode.data?.httpTrigger) {
          onUpdateNode(selectedNode.id, { httpTrigger: undefined });
        }
      }
    } catch {
      // Treat any fetch error as "not found" to avoid blocking the UI.
      setInfo(null);
    } finally {
      setLoading(false);
    }
    // selectedNode.data?.httpTrigger is intentionally omitted — refresh runs
    // on node-id change, not on every node-data update (which would loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, isSignedIn, getToken, selectedNode.id, onUpdateNode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persistInfoFromCreate = (data: {
    trigger_url: string;
    secret_last4: string;
    created_at: string;
    rotated_at: string | null;
  }) => {
    const next: HttpTriggerInfo = {
      triggerUrl: data.trigger_url,
      secretLast4: data.secret_last4,
      createdAt: data.created_at,
      rotatedAt: data.rotated_at,
      lastTriggeredAt: null,
    };
    setInfo(next);
    onUpdateNode(selectedNode.id, { httpTrigger: next });
  };

  const handleGenerate = async () => {
    if (!workflowId) {
      toast.error("Save the workflow first, then generate a trigger URL.");
      return;
    }
    setWorking(true);
    try {
      const token = await getToken();
      const response = await createHttpTrigger(
        workflowId,
        selectedNode.id,
        token,
      );
      if (!response?.success) {
        throw new Error(response?.message || "Failed to create HTTP trigger");
      }
      persistInfoFromCreate(response.data);
      setRevealed({
        secret: response.data.secret,
        triggerUrl: response.data.trigger_url,
        rotated: false,
      });
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to create HTTP trigger",
      );
    } finally {
      setWorking(false);
    }
  };

  const handleRegenerate = async () => {
    if (!workflowId) return;
    if (
      !window.confirm(
        "Regenerating will invalidate the current secret. Any caller still using it will start receiving 401 Unauthorized. Continue?",
      )
    ) {
      return;
    }
    setWorking(true);
    try {
      const token = await getToken();
      const response = await regenerateHttpTriggerSecret(
        workflowId,
        selectedNode.id,
        token,
      );
      if (!response?.success) {
        throw new Error(response?.message || "Failed to regenerate secret");
      }
      persistInfoFromCreate({
        trigger_url: response.data.trigger_url,
        secret_last4: response.data.secret_last4,
        created_at: info?.createdAt ?? new Date().toISOString(),
        rotated_at: response.data.rotated_at,
      });
      setRevealed({
        secret: response.data.secret,
        triggerUrl: response.data.trigger_url,
        rotated: true,
      });
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to regenerate secret",
      );
    } finally {
      setWorking(false);
    }
  };

  const copyUrl = () => {
    if (!info) return;
    navigator.clipboard.writeText(info.triggerUrl);
    setCopied(true);
    toast.success("Trigger URL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const copyInputBody = () => {
    navigator.clipboard.writeText(inputBodyTemplate);
    setCopiedBody(true);
    toast.success("Input object copied to clipboard");
    setTimeout(() => setCopiedBody(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        External callers POST to this URL to start the workflow. They must
        include an{" "}
        <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[11px]">
          X-Trigger-Secret
        </code>{" "}
        header with your secret and an{" "}
        <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[11px]">
          Idempotency-Key
        </code>{" "}
        header (any unique string per logical event). Body is{" "}
        <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[11px]">
          {`{"inputs": {...}}`}
        </code>
        .
      </div>

      {!workflowId && (
        <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md border border-amber-200 dark:border-amber-900/50">
          <p className="text-xs text-amber-800 dark:text-amber-400">
            Save the workflow first to enable HTTP trigger generation.
          </p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Request Body Template
          </Label>
          <Button
            onClick={copyInputBody}
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs border-gray-200 dark:border-gray-800"
          >
            {copiedBody ? (
              <Check className="w-3 h-3 mr-1 text-green-500" />
            ) : (
              <Braces className="w-3 h-3 mr-1" />
            )}
            Copy Input Object
          </Button>
        </div>
        <Textarea
          readOnly
          value={inputBodyTemplate}
          rows={Math.min(8, 3 + inputParamCount)}
          className="bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800 font-mono text-xs resize-none"
        />
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
          {inputParamCount === 0
            ? nodeCount === 0
              ? "No nodes loaded yet — save the workflow first to populate this template."
              : `No parameters configured on action/decision nodes (${nodeCount} node${
                  nodeCount === 1 ? "" : "s"
                } scanned from the ${sourceLabel}).`
            : `Keys are parameter IDs collected from ${inputParamCount} parameter${
                inputParamCount === 1 ? "" : "s"
              } across action nodes (source: ${sourceLabel}). Each value shows the configured default — replace with real values when calling the trigger.`}
        </p>
      </div>


      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading trigger…
        </div>
      ) : info ? (
        <>
          <div>
            <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Trigger URL
            </Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={info.triggerUrl}
                className="bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800 font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copyUrl}
                className="flex-shrink-0 border-gray-200 dark:border-gray-800"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-900 dark:text-gray-100" />
                )}
              </Button>
            </div>
          </div>

          <div>
            <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Secret
            </Label>
            <Input
              readOnly
              value={`whsk_••••••••••••${info.secretLast4}`}
              className="bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800 font-mono text-xs"
            />
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              Only the last 4 characters are shown. Regenerate to obtain a new
              one.
            </p>
          </div>

          {info.lastTriggeredAt && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Last triggered: {new Date(info.lastTriggeredAt).toLocaleString()}
            </div>
          )}

          <Button
            onClick={handleRegenerate}
            disabled={working || !workflowId}
            variant="outline"
            className="w-full"
          >
            {working ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Regenerate Secret
          </Button>
        </>
      ) : (
        <Button
          onClick={handleGenerate}
          disabled={working || !workflowId}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white"
        >
          {working ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : null}
          Generate Trigger URL
        </Button>
      )}

      {revealed && (
        <HttpTriggerSecretModal
          isOpen
          onClose={() => setRevealed(null)}
          secret={revealed.secret}
          triggerUrl={revealed.triggerUrl}
          rotated={revealed.rotated}
        />
      )}
    </div>
  );
};

export const TriggerConf: React.FC<BaseConfigProps> = ({
  selectedNode,
  onUpdateNode,
  workflowId,
}) => {
  const handleInputChange = (field: string, value: string) => {
    onUpdateNode(selectedNode.id, { [field]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Trigger Type
        </Label>
        <Select
          value={selectedNode.data?.type || "manual"}
          onValueChange={(value) => handleInputChange("type", value)}
        >
          <SelectTrigger className="w-full h-11 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
            {" "}
            <SelectValue placeholder="Select trigger type" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="http">HTTP</SelectItem>
            <SelectItem value="schedule">Schedule</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="file">File Watcher</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedNode.data?.type === "http" && (
        <HttpTriggerConf
          selectedNode={selectedNode}
          onUpdateNode={onUpdateNode}
          workflowId={workflowId}
        />
      )}

      {selectedNode.data?.type === "schedule" && (
        <div>
          <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Schedule (Cron Expression)
          </Label>
          <Input
            type="text"
            value={String(selectedNode.data?.schedule || "")}
            onChange={(e) => handleInputChange("schedule", e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
            placeholder="0 9 * * 1-5"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Example: "0 9 * * 1-5" runs at 9 AM on weekdays
          </p>
        </div>
      )}

      {selectedNode.data?.type === "webhook" && (
        <div>
          <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Webhook URL
          </Label>
          <Input
            type="url"
            value={String(selectedNode.data?.webhookUrl || "")}
            onChange={(e) => handleInputChange("webhookUrl", e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
            placeholder="https://api.example.com/webhook"
          />
        </div>
      )}

      {selectedNode.data?.type === "file" && (
        <div>
          <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Watch Path
          </Label>
          <input
            type="text"
            value={String(selectedNode.data?.watchPath || "")}
            onChange={(e) => handleInputChange("watchPath", e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
            placeholder="/path/to/watch"
          />
        </div>
      )}
    </div>
  );
};
