import React, { useEffect, useState } from "react";
import { Plus, Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

import { Parameter, Node, Edge } from "@/utils/types";

interface ParametersModalProps {
  nodeId?: string;
  isOpen: boolean;
  onClose: () => void;
  parameters: Parameter[];
  onUpdateParameters: (parameters: Parameter[]) => void;
  nodes: Node[];
  edges: Edge[];
}

export const ParametersModal: React.FC<ParametersModalProps> = ({
  nodeId,
  isOpen,
  onClose,
  parameters,
  onUpdateParameters,
  nodes,
  edges,
}) => {
  const [localParameters, setLocalParameters] = useState<Parameter[]>([]);
  const [lastOpenNodeId, setLastOpenNodeId] = useState<string | null>(null);

  // Reset local parameters whenever the modal opens with new parameters
  useEffect(() => {
    if (isOpen && (nodeId !== lastOpenNodeId || !lastOpenNodeId)) {
      setLocalParameters(
        parameters.map((p) => ({
          ...p,
          sourceType: p.sourceType || "manual",
        })),
      );
      setLastOpenNodeId(nodeId || "unknown");
    }
    
    if (!isOpen) {
      setLastOpenNodeId(null);
    }
  }, [isOpen, nodeId, parameters, lastOpenNodeId]);

  const getUpstreamNodes = (startNodeId: string) => {
    const upstream: Node[] = [];
    const visited = new Set<string>();
    const stack = [startNodeId];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      const incomingEdges = edges.filter((e) => e.target === currentId);

      for (const edge of incomingEdges) {
        if (!visited.has(edge.source)) {
          visited.add(edge.source);
          const sourceNode = nodes.find((n) => n.id === edge.source);
          if (sourceNode) {
            upstream.push(sourceNode);
            stack.push(edge.source);
          }
        }
      }
    }
    return upstream;
  };

  const upstreamNodes = nodeId ? getUpstreamNodes(nodeId) : [];

  const addParameter = () => {
    const newParameter: Parameter = {
      id: `param-${Date.now()}-${Math.random()}`,
      name: "",
      type: "string",
      description: "",
      sourceType: "manual",
      value: "",
    };
    setLocalParameters([...localParameters, newParameter]);
  };

  const updateParameter = (
    id: string,
    field: keyof Parameter,
    value: string,
  ) => {
    setLocalParameters(
      localParameters.map((param) =>
        param.id === id ? { ...param, [field]: value } : param,
      ),
    );
  };

  const removeParameter = (id: string) => {
    setLocalParameters(localParameters.filter((param) => param.id !== id));
  };

  const handleSave = () => {
    onUpdateParameters([...localParameters]);
    onClose();
  };

  const handleCancel = () => {
    setLocalParameters([...parameters]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] bg-white dark:bg-gray-900 backdrop-blur-sm border border-slate-200 dark:border-gray-800 text-slate-900 dark:text-gray-100">
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-gray-100 flex items-center">
            <Settings
              size={18}
              className="mr-2 text-purple-600 dark:text-purple-400"
            />
            Configure Parameters
            {nodeId && (
              <span className="text-slate-500 dark:text-gray-400 text-sm ml-2">
                ({nodeId})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col h-[60vh]">
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-4">
              {localParameters.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-gray-400">
                  <p className="text-sm">No parameters configured</p>
                  <p className="text-xs mt-1 text-slate-400 dark:text-gray-500">
                    Add parameters to make your scripts dynamic
                  </p>
                </div>
              ) : (
                localParameters.map((param) => (
                  <div
                    key={param.id}
                    className="bg-slate-50 dark:bg-gray-800 rounded-lg p-3 border border-slate-200 dark:border-gray-700"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <Label
                            htmlFor={`name-${param.id}`}
                            className="text-[10px] text-slate-500 dark:text-gray-400 mb-1 block uppercase tracking-wider font-semibold"
                          >
                            Parameter Name
                          </Label>
                          <Input
                            id={`name-${param.id}`}
                            value={param.name}
                            onChange={(e) =>
                              updateParameter(param.id, "name", e.target.value)
                            }
                            placeholder="e.g., server_url"
                            className="h-8 text-xs bg-white dark:bg-gray-950 border border-slate-200 dark:border-gray-800 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500/20"
                          />
                        </div>

                        <div className="w-28">
                          <Label
                            htmlFor={`type-${param.id}`}
                            className="text-[10px] text-slate-500 dark:text-gray-400 mb-1 block uppercase tracking-wider font-semibold"
                          >
                            Type
                          </Label>
                          <Select
                            value={param.type}
                            onValueChange={(value) =>
                              updateParameter(param.id, "type", value)
                            }
                          >
                            <SelectTrigger className="h-8 text-xs bg-white dark:bg-gray-950 border border-slate-200 dark:border-gray-800">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white dark:bg-gray-950 dark:text-gray-100 border border-slate-200 dark:border-gray-800">
                              <SelectItem value="string">String</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="boolean">Boolean</SelectItem>
                              <SelectItem value="password">Password</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="w-28">
                          <Label className="text-[10px] text-slate-500 dark:text-gray-400 mb-1 block uppercase tracking-wider font-semibold">
                            Source
                          </Label>
                          <Select
                            value={param.sourceType || "manual"}
                            onValueChange={(value: "manual" | "output") =>
                              updateParameter(param.id, "sourceType", value)
                            }
                          >
                            <SelectTrigger className="h-8 text-xs bg-white dark:bg-gray-950 border border-slate-200 dark:border-gray-800">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white dark:bg-gray-950 dark:text-gray-100 border border-slate-200 dark:border-gray-800">
                              <SelectItem value="manual">Manual</SelectItem>
                              <SelectItem value="output">Output</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <Button
                          onClick={() => removeParameter(param.id)}
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 self-end"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>

                      <div>
                        {param.sourceType === "output" ? (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-[10px] text-slate-500 dark:text-gray-400 mb-1 block uppercase tracking-wider font-semibold">
                                Previous Node
                              </Label>
                              <Select
                                value={
                                  param.value
                                    ?.split(".")[0]
                                    ?.replace("{{", "") || ""
                                }
                                onValueChange={(val) => {
                                  const node = upstreamNodes.find(
                                    (n) => n.id === val,
                                  );
                                  const defaultValue = `{{${val}.output.input_as_text}}`;
                                  updateParameter(
                                    param.id,
                                    "value",
                                    defaultValue,
                                  );
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs bg-white dark:bg-gray-950 border border-slate-200 dark:border-gray-800">
                                  <SelectValue placeholder="Select node..." />
                                </SelectTrigger>
                                <SelectContent className="bg-white dark:bg-gray-950 dark:text-gray-100 border border-slate-200 dark:border-gray-800">
                                  {upstreamNodes.map((node) => (
                                    <SelectItem key={node.id} value={node.id}>
                                      {node.data?.label || node.id}
                                    </SelectItem>
                                  ))}
                                  {upstreamNodes.length === 0 && (
                                    <SelectItem value="none" disabled>
                                      No previous nodes
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-[10px] text-slate-500 dark:text-gray-400 mb-1 block uppercase tracking-wider font-semibold">
                                Output Field
                              </Label>
                              <Select
                                value={
                                  param.value
                                    ?.split(".")[2]
                                    ?.replace("}}", "") || "input_as_text"
                                }
                                onValueChange={(field) => {
                                  const nodeId = param.value
                                    ?.split(".")[0]
                                    ?.replace("{{", "");
                                  if (nodeId) {
                                    updateParameter(
                                      param.id,
                                      "value",
                                      `{{${nodeId}.output.${field}}}`,
                                    );
                                  }
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs bg-white dark:bg-gray-950 border border-slate-200 dark:border-gray-800">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white dark:bg-gray-950 dark:text-gray-100 border border-slate-200 dark:border-gray-800">
                                  <SelectItem value="input_as_text">
                                    input_as_text (Raw)
                                  </SelectItem>
                                  {(() => {
                                    const nodeId = param.value
                                      ?.split(".")[0]
                                      ?.replace("{{", "");
                                    const sourceNode = upstreamNodes.find(
                                      (n) => n.id === nodeId,
                                    );
                                    if (
                                      sourceNode?.data?.outputFormat ===
                                        "json" &&
                                      sourceNode.data.jsonSchema
                                    ) {
                                      return sourceNode.data.jsonSchema.map(
                                        (field) => (
                                          <SelectItem
                                            key={field.name}
                                            value={field.name}
                                          >
                                            {field.name} ({field.type})
                                          </SelectItem>
                                        ),
                                      );
                                    }
                                    return null;
                                  })()}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <Label
                              htmlFor={`value-${param.id}`}
                              className="text-[10px] text-slate-500 dark:text-gray-400 mb-1 block uppercase tracking-wider font-semibold"
                            >
                              Static Value
                            </Label>
                            {param.type === "boolean" ? (
                              <Select
                                value={param.value || "false"}
                                onValueChange={(val) =>
                                  updateParameter(param.id, "value", val)
                                }
                              >
                                <SelectTrigger className="h-8 text-xs bg-white dark:bg-gray-950 border border-slate-200 dark:border-gray-800 text-slate-900 dark:text-gray-100">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white dark:bg-gray-950 dark:text-gray-100 border border-slate-200 dark:border-gray-800">
                                  <SelectItem value="true">True</SelectItem>
                                  <SelectItem value="false">False</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                id={`value-${param.id}`}
                                value={param.value || ""}
                                onChange={(e) => {
                                  let val = e.target.value;
                                  if (param.type === "number") {
                                    // Regex: allow digits, one dot, and one leading minus
                                    val = val.replace(/[^0-9.-]/g, "");
                                    const parts = val.split(".");
                                    if (parts.length > 2)
                                      val =
                                        parts[0] +
                                        "." +
                                        parts.slice(1).join("");
                                    if (val.lastIndexOf("-") > 0)
                                      val =
                                        val[0] + val.slice(1).replace(/-/g, "");
                                  } else {
                                    // Basic sanitization for string/password
                                    val = val.replace(/[<>]/g, ""); // Remove basic HTML-like tags
                                  }
                                  updateParameter(param.id, "value", val);
                                }}
                                type={
                                  param.type === "password"
                                    ? "password"
                                    : "text"
                                }
                                placeholder={
                                  param.type === "number"
                                    ? "Enter number"
                                    : "Enter value"
                                }
                                maxLength={
                                  param.type === "password" ||
                                  param.type === "string"
                                    ? 25
                                    : 255
                                }
                                className="h-8 text-xs bg-white dark:bg-gray-950 border border-slate-200 dark:border-gray-800 text-slate-900 dark:text-gray-100"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-slate-200 dark:border-gray-800 pt-4">
            <div className="flex justify-between items-center">
              <Button
                onClick={addParameter}
                size="sm"
                className="text-xs bg-blue-50 dark:bg-gray-800 hover:bg-blue-100 dark:hover:bg-gray-700 border border-blue-200 dark:border-gray-700 text-blue-600 dark:text-gray-300 hover:text-blue-700 dark:hover:text-gray-100"
              >
                <Plus size={12} className="mr-1" />
                Add Parameter
              </Button>

              <div className="flex space-x-2">
                <Button
                  onClick={handleCancel}
                  size="sm"
                  variant="outline"
                  className="text-xs border-slate-200 bg-white dark:bg-gray-900 dark:border-gray-700 text-slate-700 dark:text-gray-100 hover:bg-slate-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  size="sm"
                  className="text-xs bg-blue-600 dark:bg-purple-600 hover:bg-blue-700 dark:hover:bg-purple-700 text-white dark:text-white"
                >
                  Save Parameters
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
