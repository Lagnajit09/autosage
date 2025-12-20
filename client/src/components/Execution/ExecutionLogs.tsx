import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

const logs = [
  {
    timestamp: "10:30:45",
    level: "info",
    message: "Workflow execution started",
  },
  {
    timestamp: "10:30:46",
    level: "info",
    message: "Node 'Trigger Webhook' executed successfully",
  },
  {
    timestamp: "10:30:47",
    level: "debug",
    message: "Fetching data from external API...",
  },
  {
    timestamp: "10:30:48",
    level: "info",
    message: "Node 'Fetch Data' executed successfully",
  },
  {
    timestamp: "10:30:48",
    level: "warn",
    message: "Response time > 1s (1.2s)",
  },
  {
    timestamp: "10:30:49",
    level: "info",
    message: "Node 'Process JSON' started",
  },
];

const ExecutionLogs = () => {
  const getBadgeVariant = (level: string) => {
    switch (level) {
      case "error":
        return "destructive";
      case "warn":
        return "secondary"; // Using secondary for warning as a close approximation or custom style
      case "debug":
        return "outline";
      default:
        return "default";
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-500";
      case "warn":
        return "text-yellow-500";
      case "debug":
        return "text-blue-500";
      default:
        return "text-gray-500";
    }
  };

  return (
    <div className="h-full bg-white dark:bg-gray-950 p-4">
      <ScrollArea className="h-full">
        <div className="space-y-2 font-mono text-sm">
          {logs.map((log, index) => (
            <div
              key={index}
              className="flex items-start gap-3 py-1 border-b border-gray-100 dark:border-gray-800 last:border-0"
            >
              <span className="text-gray-400 shrink-0">{log.timestamp}</span>
              <span
                className={`uppercase text-xs font-bold w-12 shrink-0 ${getLevelColor(
                  log.level
                )}`}
              >
                {log.level}
              </span>
              <span className="text-gray-700 dark:text-gray-300 break-all">
                {log.message}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ExecutionLogs;
