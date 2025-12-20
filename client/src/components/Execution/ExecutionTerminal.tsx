import { ScrollArea } from "@/components/ui/scroll-area";

const ExecutionTerminal = () => {
  return (
    <div className="h-full bg-[#1e1e1e] text-gray-300 font-mono text-sm p-4">
      <ScrollArea className="h-full">
        <div className="space-y-1">
          <div className="flex gap-2">
            <span className="text-green-500">➜</span>
            <span className="text-blue-400">~</span>
            <span>Workflow started at 2024-03-20 10:30:45</span>
          </div>
          <div className="text-gray-500">Initializing environment...</div>
          <div>Loaded configuration from /etc/workflow/config.json</div>
          <div className="text-yellow-500">
            Warning: API rate limit threshold approaching (85%)
          </div>
          <div className="flex gap-2">
            <span className="text-green-500">➜</span>
            <span>Executing Node 1: Trigger Webhook</span>
          </div>
          <div className="text-gray-400 pl-4">
            Payload received: {'{ "event": "user_signup", "id": 123 }'}
          </div>
          <div className="flex gap-2">
            <span className="text-green-500">➜</span>
            <span>Executing Node 2: Fetch Data</span>
          </div>
          <div className="text-gray-400 pl-4">
            GET https://api.example.com/users/123
          </div>
          <div className="text-green-400 pl-4">200 OK (450ms)</div>
          <div className="flex gap-2">
            <span className="text-green-500">➜</span>
            <span>Executing Node 3: Process JSON</span>
          </div>
          <div className="animate-pulse">Processing...</div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default ExecutionTerminal;
