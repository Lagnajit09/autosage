import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useRef } from "react";
import { Clock } from "lucide-react";

interface ExecutionTerminalProps {
  logs?: string[];
  elapsedSeconds?: number | null;
}

const formatElapsed = (seconds: number) => {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const ExecutionTerminal = ({
  logs = [],
  elapsedSeconds = null,
}: ExecutionTerminalProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever logs change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-gray-300 font-mono text-sm overflow-hidden">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-1">
          {logs.length === 0 ? (
            <div className="text-gray-500">Waiting for execution...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="whitespace-pre-wrap leading-5">
                {log}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      {elapsedSeconds !== null && (
        <div className="shrink-0 border-t border-gray-700 px-4 py-1.5 flex items-center gap-2 text-xs text-gray-400 bg-[#161616]">
          <Clock className="w-3 h-3 text-purple-400" />
          <span>
            Elapsed:{" "}
            <span className="text-purple-300 font-semibold">
              {formatElapsed(elapsedSeconds)}
            </span>
          </span>
        </div>
      )}
    </div>
  );
};

export default ExecutionTerminal;
