import { useEffect, useState } from "react";
import {
  X,
  Play,
  Server as ServerIcon,
  Key,
  Airplay,
  RefreshCw,
  Square,
  Lock,
  Settings2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Server, Credential, ScriptParameter } from "@/utils/types";
import { ResolvedScriptParam } from "@/utils/scriptParams";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface ScriptExecutionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  scriptName: string | undefined;
  servers: Server[];
  credentials: Credential[];
  selectedServerId: string;
  setSelectedServerId: (id: string) => void;
  selectedCredentialId: string;
  setSelectedCredentialId: (id: string) => void;
  onExecute: () => void;
  onStop: () => void;
  onRefresh: () => void;
  onClearLogs: () => void;
  isExecuting: boolean;
  isStopping: boolean;
  isLoadingData: boolean;
  logs: string[];
  // Parameterized execution
  params: ResolvedScriptParam[];
  paramValues: Record<string, string>;
  onParamValueChange: (name: string, value: string) => void;
  onSaveParamMeta: (meta: ScriptParameter[]) => Promise<void> | void;
  isSavingParamMeta: boolean;
}

const PARAM_TYPES: ScriptParameter["type"][] = [
  "string",
  "number",
  "boolean",
  "password",
];

export function ScriptExecutionDrawer({
  isOpen,
  onClose,
  scriptName,
  servers,
  credentials,
  selectedServerId,
  setSelectedServerId,
  selectedCredentialId,
  setSelectedCredentialId,
  onExecute,
  onStop,
  onRefresh,
  isExecuting,
  isStopping,
  isLoadingData,
  logs,
  params,
  paramValues,
  onParamValueChange,
  onSaveParamMeta,
  isSavingParamMeta,
}: ScriptExecutionDrawerProps) {
  const hasParams = params.length > 0;
  const [paramsExpanded, setParamsExpanded] = useState(true);
  const [configMode, setConfigMode] = useState(false);
  // Draft metadata for Configure mode, keyed by param name.
  const [draftMeta, setDraftMeta] = useState<Record<string, ScriptParameter>>(
    {},
  );

  // Seed the config draft from the current merged params whenever we enter
  // configure mode or the detected param set changes.
  useEffect(() => {
    if (!configMode) return;
    setDraftMeta((prev) => {
      const next: Record<string, ScriptParameter> = {};
      for (const p of params) {
        next[p.name] =
          prev[p.name] ??
          ({
            name: p.name,
            type: p.type,
            default: p.secret ? "" : p.default,
            secret: p.secret,
          } as ScriptParameter);
      }
      return next;
    });
  }, [configMode, params]);

  const updateDraft = (
    name: string,
    patch: Partial<ScriptParameter>,
  ) => {
    setDraftMeta((prev) => {
      const current = prev[name] ?? { name, type: "string" };
      const merged: ScriptParameter = { ...current, ...patch };
      // Password type is always secret; secrets never keep a default.
      if (merged.type === "password") merged.secret = true;
      if (merged.secret) merged.default = "";
      return { ...prev, [name]: merged };
    });
  };

  const handleSaveConfig = async () => {
    const meta = params.map((p) => draftMeta[p.name]).filter(Boolean);
    await onSaveParamMeta(meta as ScriptParameter[]);
    setConfigMode(false);
  };

  return (
    <div
      className={cn(
        "absolute bottom-0 left-0 w-full h-[350px] bg-white dark:bg-[#1e1e1e] border-t border-gray-200 dark:border-gray-800 shadow-xl transition-transform duration-300 ease-in-out z-20 flex flex-col",
        isOpen ? "translate-y-0" : "translate-y-full",
      )}
    >
      {/* Header & Controls Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#252526]">
        <div className="flex items-center gap-4 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            <Airplay className="w-4 h-4" />
            <span className="hidden sm:inline">Terminal</span>
          </div>

          <div className="h-4 w-[1px] bg-gray-300 dark:bg-gray-700 mx-2" />

          {/* Controls */}
          <div className="flex items-center gap-3 flex-1 overflow-x-auto">
            <div className="flex items-center gap-2 min-w-[200px]">
              <ServerIcon className="w-4 h-4 text-gray-500" />
              <Select
                value={selectedServerId}
                onValueChange={setSelectedServerId}
              >
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-[#3c3c3c] dark:text-gray-200 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Select Server" />
                </SelectTrigger>
                <SelectContent className="dark:bg-[#3c3c3c] dark:text-gray-200 border-gray-300 dark:border-gray-600">
                  {servers.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground text-center">
                      No servers found.
                    </div>
                  ) : (
                    servers.map((server) => (
                      <SelectItem
                        key={server.id}
                        value={server.id}
                        className="text-xs"
                      >
                        {server.name} ({server.host})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 min-w-[200px]">
              <Key className="w-4 h-4 text-gray-500" />
              <Select
                value={selectedCredentialId}
                onValueChange={setSelectedCredentialId}
              >
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-[#3c3c3c] dark:text-gray-200 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Select Credential" />
                </SelectTrigger>
                <SelectContent className="dark:bg-[#3c3c3c] dark:text-gray-200 border-gray-300 dark:border-gray-600">
                  <SelectItem value="none" className="text-xs italic">
                    -- None --
                  </SelectItem>
                  {credentials.map((cred) => (
                    <SelectItem
                      key={cred.id}
                      value={cred.id}
                      className="text-xs"
                    >
                      {cred.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 dark:bg-gray-800 dark:hover:text-gray-200 ml-auto"
                  onClick={onRefresh}
                  disabled={isExecuting || isLoadingData}
                >
                  <RefreshCw
                    className={cn("w-4 h-4", isLoadingData && "animate-spin")}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh Terminal Session</p>
              </TooltipContent>
            </Tooltip>

            {isExecuting && (
              <Button
                size="sm"
                variant="destructive"
                className="h-8 bg-red-600 hover:bg-red-700 text-white animate-in fade-in slide-in-from-right-2 duration-300"
                onClick={onStop}
                disabled={isStopping}
              >
                {isStopping ? (
                  <>Stopping...</>
                ) : (
                  <>
                    <Square className="w-3 h-3 translate-y-[0px] fill-current" />{" "}
                    Stop
                  </>
                )}
              </Button>
            )}

            <Button
              size="sm"
              className="h-8 bg-green-600 hover:bg-green-700 text-white"
              onClick={onExecute}
              disabled={!selectedServerId || !selectedCredentialId || selectedCredentialId === "none" || isExecuting}
            >
              {isExecuting ? (
                <>Running...</>
              ) : (
                <>
                  <Play className="w-2 h-2 fill-current" /> Run
                </>
              )}
            </Button>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-6 w-6 ml-2 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 dark:hover:bg-gray-700"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Parameters section — only when the script has {{variables}} */}
      {hasParams && (
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#252526]">
          <div className="flex items-center justify-between px-4 py-1.5">
            <button
              type="button"
              onClick={() => setParamsExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300"
            >
              {paramsExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              Parameters
              <span className="rounded-full bg-gray-200 dark:bg-[#3c3c3c] px-1.5 text-[10px] font-medium text-gray-600 dark:text-gray-300">
                {params.length}
              </span>
            </button>
            <div className="flex items-center gap-2">
              {configMode && (
                <Button
                  size="sm"
                  className="h-6 bg-purple-600 hover:bg-purple-700 text-white text-xs px-2"
                  onClick={handleSaveConfig}
                  disabled={isSavingParamMeta}
                >
                  {isSavingParamMeta ? "Saving..." : "Save"}
                </Button>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={configMode ? "secondary" : "ghost"}
                    className="h-6 w-6 p-0 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                    onClick={() => {
                      setConfigMode((v) => !v);
                      setParamsExpanded(true);
                    }}
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{configMode ? "Done configuring" : "Configure types & secrets"}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {paramsExpanded && (
            <ScrollArea className="max-h-[110px]">
              <div
                className={cn(
                  "px-4 pb-2 grid gap-2",
                  // Auto-fit tracks: columns adapt to the count + available width,
                  // and a single param stretches to fill the row (no dead 50%).
                  configMode
                    ? "grid-cols-[repeat(auto-fit,minmax(320px,1fr))]"
                    : "grid-cols-[repeat(auto-fit,minmax(220px,1fr))]",
                )}
              >
                {params.map((p) =>
                  configMode ? (
                    <ParamConfigRow
                      key={p.name}
                      param={p}
                      draft={draftMeta[p.name]}
                      onChange={(patch) => updateDraft(p.name, patch)}
                    />
                  ) : (
                    <ParamValueRow
                      key={p.name}
                      param={p}
                      value={
                        paramValues[p.name] ?? (p.secret ? "" : p.default)
                      }
                      onChange={(val) => onParamValueChange(p.name, val)}
                    />
                  ),
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      )}

      {/* Terminal Output */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1e] dark:bg-[#121212] text-gray-300 font-mono text-xs overflow-hidden">
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-1">
            <div className="text-blue-600 mb-2">
              {scriptName
                ? `> Executing ${scriptName}...`
                : "> No script selected."}
            </div>
            {logs.map((log, i) => {
              let colorClass = "text-gray-300";
              if (log.startsWith("[ERROR]")) colorClass = "text-red-500";
              else if (log.startsWith("[STATUS]")) colorClass = "text-blue-400";
              else if (log.startsWith("[EXIT]")) colorClass = "text-yellow-500";
              else if (log.startsWith(">")) colorClass = "text-green-500";

              return (
                <div
                  key={i}
                  className={cn(
                    "break-all whitespace-pre-wrap font-mono",
                    colorClass,
                  )}
                >
                  {log}
                </div>
              );
            })}
            {isExecuting && (
              <div className="animate-pulse text-green-500 inline-block">_</div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// ── Value-entry row (default mode) ────────────────────────────────────────────

function ParamValueRow({
  param,
  value,
  onChange,
}: {
  param: ResolvedScriptParam;
  value: string;
  onChange: (val: string) => void;
}) {
  const inputClass =
    "flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs text-gray-800 placeholder:text-gray-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/30 dark:border-gray-600 dark:bg-[#3c3c3c] dark:text-gray-200";

  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 dark:border-gray-700 dark:bg-[#2d2d2d]">
      <span
        className="w-28 shrink-0 truncate font-mono text-xs font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1"
        title={param.name}
      >
        {param.secret && <Lock className="h-3 w-3 shrink-0 text-amber-500" />}
        {param.name}
      </span>
      {param.type === "boolean" ? (
        <label className="inline-flex flex-1 cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-400/40 dark:border-gray-600 dark:bg-[#3c3c3c]"
          />
          {value === "true" ? "true" : "false"}
        </label>
      ) : (
        <input
          type={param.secret ? "password" : "text"}
          inputMode={param.type === "number" ? "decimal" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={param.secret ? "••••••" : "value"}
          autoComplete="off"
          aria-label={param.name}
          className={inputClass}
        />
      )}
    </div>
  );
}

// ── Configure row (metadata mode) ─────────────────────────────────────────────

function ParamConfigRow({
  param,
  draft,
  onChange,
}: {
  param: ResolvedScriptParam;
  draft: ScriptParameter | undefined;
  onChange: (patch: Partial<ScriptParameter>) => void;
}) {
  const type = draft?.type ?? param.type;
  const secret = draft?.secret ?? param.secret;
  const def = draft?.default ?? "";

  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 dark:border-gray-700 dark:bg-[#2d2d2d]">
      <span
        className="w-24 shrink-0 truncate font-mono text-xs font-medium text-gray-700 dark:text-gray-200"
        title={param.name}
      >
        {param.name}
      </span>
      <Select
        value={type}
        onValueChange={(v) => onChange({ type: v as ScriptParameter["type"] })}
      >
        <SelectTrigger className="h-7 w-24 shrink-0 text-xs bg-white dark:bg-[#3c3c3c] dark:text-gray-200 border-gray-300 dark:border-gray-600">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="dark:bg-[#3c3c3c] dark:text-gray-200 border-gray-300 dark:border-gray-600">
          {PARAM_TYPES.map((t) => (
            <SelectItem key={t} value={t} className="text-xs">
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
        <input
          type="checkbox"
          checked={secret}
          disabled={type === "password"}
          onChange={(e) => onChange({ secret: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-400/40 dark:border-gray-600 dark:bg-[#3c3c3c]"
        />
        secret
      </label>
      {secret ? (
        <span className="flex-1 min-w-0 truncate px-2 py-1 text-[11px] italic text-gray-400 dark:text-gray-500">
          entered at run time
        </span>
      ) : (
        <input
          type="text"
          value={def}
          onChange={(e) => onChange({ default: e.target.value })}
          placeholder="default"
          className="flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs text-gray-800 placeholder:text-gray-400 focus:border-purple-400 focus:outline-none dark:border-gray-600 dark:bg-[#3c3c3c] dark:text-gray-200"
        />
      )}
    </div>
  );
}
