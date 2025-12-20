import { ScrollArea } from "@/components/ui/scroll-area";
import CodeEditor from "@uiw/react-textarea-code-editor";

const responseData = {
  status: 200,
  message: "Workflow completed successfully",
  data: {
    processed_items: 15,
    errors: [],
    timestamp: "2024-03-20T10:30:48Z",
    output_url: "https://s3.aws.com/bucket/report_123.pdf",
  },
};

const ExecutionResponse = () => {
  return (
    <div className="h-full bg-white dark:bg-gray-950 p-0 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Status:
          </span>
          <span className="text-sm font-bold text-green-600 dark:text-green-400">
            200 OK
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Time:
          </span>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
            450ms
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <CodeEditor
          value={JSON.stringify(responseData, null, 2)}
          language="json"
          placeholder="Please enter JSON code."
          padding={20}
          style={{
            fontSize: 14,
            backgroundColor: "transparent",
            fontFamily:
              "ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
            height: "100%",
            overflow: "auto",
          }}
          className="dark:text-gray-300"
          disabled
        />
      </div>
    </div>
  );
};

export default ExecutionResponse;
