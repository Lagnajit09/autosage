import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useRef, useState } from "react";
import { Clock, Copy, Download, Check } from "lucide-react";

interface ExecutionTerminalProps {
  logs?: string[];
  elapsedSeconds?: number | null;
  runId?: string | null;
}

const formatElapsed = (seconds: number) => {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const renderLogLine = (log: string) => {
  if (typeof log !== "string") {
    // Fallback if not string
    return <span>{JSON.stringify(log)}</span>;
  }
  const match = log.match(/^\[([A-Z]+)\]\s(.*)/s);
  if (!match) return <span>{log}</span>;

  const tag = match[1];
  const content = match[2];
  let tagClass = "text-gray-400";
  let contentClass = "text-gray-300";

  switch (tag) {
    case "START":
      tagClass = "text-blue-400";
      break;
    case "SUCCESS":
      tagClass = "text-green-400";
      break;
    case "ERROR":
    case "FAILURE":
      tagClass = "text-red-400";
      contentClass = "text-red-200";
      break;
    case "SKIP":
    case "PRUNE":
      tagClass = "text-gray-500";
      contentClass = "text-gray-400";
      break;
    case "EVAL":
      tagClass = "text-purple-400";
      break;
    case "PARAM":
      tagClass = "text-cyan-400";
      break;
    case "STDOUT":
      tagClass = "text-amber-500";
      contentClass = "text-gray-200";
      break;
    case "INFO":
      tagClass = "text-blue-300";
      break;
    case "STATUS":
      tagClass = "text-pink-400 font-semibold";
      break;
    case "DONE":
      tagClass = "text-green-500 font-semibold";
      break;
  }

  return (
    <>
      <span className={`font-semibold tracking-wide ${tagClass}`}>[{tag}]</span> <span className={contentClass}>{content}</span>
    </>
  );
};

const ExecutionTerminal = ({
  logs = [],
  elapsedSeconds = null,
  runId = null,
}: ExecutionTerminalProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Auto-scroll to bottom whenever logs change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleCopy = () => {
    const textToCopy = logs.join("\n");
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    const textToExport = logs.join("\n");
    const blob = new Blob([textToExport], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${runId || "execution-log"}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-gray-300 font-mono text-sm overflow-hidden relative group">
      {logs.length > 0 && (
        <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            title="Copy Logs"
            className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={handleExport}
            title={`Export as ${runId || "execution-log"}.log`}
            className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      )}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-1.5">
          {logs.length === 0 ? (
            <div className="text-gray-500">Waiting for execution...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="whitespace-pre-wrap leading-5">
                {renderLogLine(log)}
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
