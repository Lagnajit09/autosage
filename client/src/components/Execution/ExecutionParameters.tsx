import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { WorkflowData } from "@/utils/types";

interface ExecutionParametersProps {
  workflow: WorkflowData | null;
  inputs: Record<string, string>;
  onInputChange: (id: string, value: string) => void;
}

const ExecutionParameters = ({ workflow, inputs, onInputChange }: ExecutionParametersProps) => {
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
              {param.name}
            </Label>
            <span className="text-[10px] text-gray-400 font-mono italic">
              via {param.nodeLabel}
            </span>
          </div>

          {param.type === "boolean" ? (
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {param.description || `Enable ${param.name}`}
              </span>
              <Switch
                id={param.id}
                checked={inputs[param.id] === "true"}
                onCheckedChange={(checked) => onInputChange(param.id, checked ? "true" : "false")}
                className="dark:bg-gray-700"
              />
            </div>
          ) : (
            <Input
              id={param.id}
              value={inputs[param.id] || ""}
              onChange={(e) => onInputChange(param.id, e.target.value)}
              placeholder={param.description || "Enter value"}
              className="dark:text-gray-200"
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default ExecutionParameters;
