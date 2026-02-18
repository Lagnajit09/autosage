import { X, Play, Server as ServerIcon, Key, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Server, Credential } from "@/utils/types";

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
  isExecuting: boolean;
  logs: string[];
}

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
  isExecuting,
  logs,
}: ScriptExecutionDrawerProps) {
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
            <Terminal className="w-4 h-4" />
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
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-[#3c3c3c] border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Select Server" />
                </SelectTrigger>
                <SelectContent>
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
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-[#3c3c3c] border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Select Credential" />
                </SelectTrigger>
                <SelectContent>
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

            <Button
              size="sm"
              className="h-8 bg-green-600 hover:bg-green-700 text-white ml-auto"
              onClick={onExecute}
              disabled={!selectedServerId || isExecuting}
            >
              {isExecuting ? (
                <>Running...</>
              ) : (
                <>
                  <Play className="w-3 h-3 mr-2 fill-current" /> Run
                </>
              )}
            </Button>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-6 w-6 ml-2 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Terminal Output */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1e] text-gray-300 font-mono text-xs overflow-hidden">
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-1">
            <div className="text-blue-600 mb-2">
              {scriptName
                ? `> Executing ${scriptName}...`
                : "> No script selected."}
            </div>
            {logs.map((log, i) => (
              <div key={i} className="break-all whitespace-pre-wrap font-mono">
                {log}
              </div>
            ))}
            {isExecuting && (
              <div className="animate-pulse text-green-500 inline-block">_</div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
