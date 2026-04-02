import { ScrollArea } from "@/components/ui/scroll-area";

const ExecutionTerminal = () => {
  return (
    <div className="h-full bg-[#1e1e1e] text-gray-300 font-mono text-sm p-4">
      <ScrollArea className="h-full">
        <div className="space-y-1">
          <div className="flex gap-2">
            <span>[INFO] {new Date().toLocaleString()}</span>
          </div>
          <div className="animate-pulse">Start Workflow Execution...</div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default ExecutionTerminal;
