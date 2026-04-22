import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkflowData } from "@/utils/types";

interface ExecutionParametersProps {
  workflow: WorkflowData | null;
  inputs: Record<string, string>;
  onInputChange: (id: string, value: string) => void;
}

const ExecutionParameters = ({
  workflow,
  inputs,
  onInputChange,
}: ExecutionParametersProps) => {
  if (!workflow) return null;

  // Extract all parameters from all nodes
  const allParameters = workflow.nodes.flatMap((node) =>
    (node.data?.parameters || []).map((param) => ({
      ...param,
      nodeLabel: node.data?.label || node.type || "Untitled Node",
    })),
  );

  if (allParameters.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        No input parameters configured for this workflow.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {allParameters.map((param) => (
        <div key={param.id} className="space-y-2">
          <div className="flex justify-between items-center">
            <Label
              htmlFor={param.id}
              className="text-xs font-semibold text-gray-500 uppercase tracking-wider"
            >
              {param.name} ({param.type})
            </Label>
            <span className="text-[10px] text-gray-400 font-mono italic">
              via {param.nodeLabel}
            </span>
          </div>

          {param.type === "boolean" ? (
            <Select
              value={inputs[param.id] || "false"}
              onValueChange={(val) => onInputChange(param.id, val)}
            >
              <SelectTrigger className="w-full h-9 bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-950 dark:text-gray-100">
                <SelectItem value="true">True</SelectItem>
                <SelectItem value="false">False</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={param.id}
              value={inputs[param.id] || ""}
              onChange={(e) => {
                let val = e.target.value;
                if (param.type === "number") {
                  val = val.replace(/[^0-9.-]/g, "");
                  const parts = val.split(".");
                  if (parts.length > 2)
                    val = parts[0] + "." + parts.slice(1).join("");
                  if (val.lastIndexOf("-") > 0)
                    val = val[0] + val.slice(1).replace(/-/g, "");
                } else {
                  val = val.replace(/[<>]/g, "");
                }
                onInputChange(param.id, val);
              }}
              type={param.type === "password" ? "password" : "text"}
              maxLength={
                param.type === "password" || param.type === "string" ? 25 : 255
              }
              placeholder={param.description || `Enter ${param.name}`}
              className="dark:text-gray-200 dark:bg-gray-950 dark:border-gray-800"
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default ExecutionParameters;
