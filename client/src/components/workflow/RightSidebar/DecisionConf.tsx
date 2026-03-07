import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DecisionConfigProps,
  ConditionItem,
  Node,
  ComparisonOperator,
} from "@/utils/types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

export const DecisionConf: React.FC<DecisionConfigProps> = ({
  selectedNode,
  onUpdateNode,
  nodes,
  edges,
  onCreateEdge,
}) => {
  const conditions = selectedNode.data?.conditions || [];

  const updateConditions = (newConditions: ConditionItem[]) => {
    onUpdateNode(selectedNode.id, { conditions: newConditions });
  };

  const addCondition = () => {
    const newCondition: ConditionItem = {
      id: `cond-${Date.now()}-${Math.random()}`,
      field: "",
      fieldSource: "manual",
      operator: "==",
      value: "",
      valueSource: "manual",
      logicalOperator: conditions.length > 0 ? "&&" : undefined,
    };
    updateConditions([...conditions, newCondition]);
  };

  const removeCondition = (id: string) => {
    const newConditions = conditions.filter((c) => c.id !== id);
    // Ensure the first condition doesn't have a logical operator
    if (newConditions.length > 0) {
      newConditions[0].logicalOperator = undefined;
    }
    updateConditions(newConditions);
  };

  const updateCondition = (id: string, updates: Partial<ConditionItem>) => {
    updateConditions(
      conditions.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
  };

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

  const upstreamNodes = getUpstreamNodes(selectedNode.id);

  const getAvailableNodes = () => {
    return nodes.filter((node) => node.id !== selectedNode?.id);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Conditions
          </Label>
          <Button
            variant="outline"
            size="sm"
            onClick={addCondition}
            className="h-7 px-2 text-[10px] bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/20"
          >
            <Plus size={10} className="mr-1" /> Add Rule
          </Button>
        </div>

        <div className="space-y-3">
          {conditions.map((cond, index) => (
            <div
              key={cond.id}
              className="relative p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 space-y-3"
            >
              {index > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <Select
                    value={cond.logicalOperator}
                    onValueChange={(val: "&&" | "||") =>
                      updateCondition(cond.id, { logicalOperator: val })
                    }
                  >
                    <SelectTrigger className="h-6 w-20 text-[10px] bg-white dark:bg-gray-950 dark:text-gray-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-950 dark:text-gray-100">
                      <SelectItem value="&&">AND</SelectItem>
                      <SelectItem value="||">OR</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                </div>
              )}

              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-3">
                  {/* Field Section */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-gray-400 uppercase">
                        Field
                      </span>
                      <Select
                        value={cond.fieldSource}
                        onValueChange={(val: "manual" | "output") =>
                          updateCondition(cond.id, {
                            fieldSource: val,
                            field: "",
                          })
                        }
                      >
                        <SelectTrigger className="h-5 w-18 text-[9px] border-none bg-transparent shadow-none hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-gray-950 dark:text-gray-100">
                          <SelectItem value="manual">Manual</SelectItem>
                          <SelectItem value="output">Output</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {cond.fieldSource === "manual" ? (
                      <Input
                        value={cond.field}
                        onChange={(e) =>
                          updateCondition(cond.id, { field: e.target.value })
                        }
                        placeholder="Variable name"
                        className="h-8 text-[12px] bg-white dark:bg-gray-950 dark:text-gray-200"
                      />
                    ) : (
                      <div className="grid grid-cols-2 gap-1">
                        <Select
                          value={
                            cond.field?.split(".")[0]?.replace("{{", "") || ""
                          }
                          onValueChange={(val) =>
                            updateCondition(cond.id, {
                              field: `{{${val}.output.input_as_text}}`,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-[10px] bg-white dark:bg-gray-950 dark:text-gray-200">
                            <SelectValue placeholder="Node" />
                          </SelectTrigger>
                          <SelectContent className="dark:bg-gray-950 dark:text-gray-100">
                            {upstreamNodes.map((n) => (
                              <SelectItem key={n.id} value={n.id}>
                                {n.data?.label || n.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={
                            cond.field?.split(".")[2]?.replace("}}", "") ||
                            "input_as_text"
                          }
                          onValueChange={(field) => {
                            const nodeId = cond.field
                              ?.split(".")[0]
                              ?.replace("{{", "");
                            if (nodeId)
                              updateCondition(cond.id, {
                                field: `{{${nodeId}.output.${field}}}`,
                              });
                          }}
                        >
                          <SelectTrigger className="h-8 text-[10px] bg-white dark:bg-gray-950 dark:text-gray-200">
                            <SelectValue placeholder="Field" />
                          </SelectTrigger>
                          <SelectContent className="dark:bg-gray-950 dark:text-gray-100">
                            <SelectItem value="input_as_text">Raw</SelectItem>
                            {(() => {
                              const nodeId = cond.field
                                ?.split(".")[0]
                                ?.replace("{{", "");
                              const sourceNode = upstreamNodes.find(
                                (n) => n.id === nodeId,
                              );
                              return sourceNode?.data?.jsonSchema?.map((f) => (
                                <SelectItem key={f.name} value={f.name}>
                                  {f.name}
                                </SelectItem>
                              ));
                            })()}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Operator Section */}
                  <Select
                    value={cond.operator}
                    onValueChange={(val: ComparisonOperator) =>
                      updateCondition(cond.id, { operator: val })
                    }
                  >
                    <SelectTrigger className="h-8 text-[11px] bg-white dark:bg-gray-950 w-full dark:text-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-950 dark:text-gray-100">
                      <SelectItem value="==">Equals</SelectItem>
                      <SelectItem value="!=">Not Equals</SelectItem>
                      <SelectItem value=">">Greater Than</SelectItem>
                      <SelectItem value="<">Less Than</SelectItem>
                      <SelectItem value=">=">Greater or Equal</SelectItem>
                      <SelectItem value="<=">Less or Equal</SelectItem>
                      <SelectItem value="contains">Contains</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Value Section */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-gray-400 uppercase">
                        Value
                      </span>
                      <Select
                        value={cond.valueSource}
                        onValueChange={(val: "manual" | "output") =>
                          updateCondition(cond.id, {
                            valueSource: val,
                            value: "",
                          })
                        }
                      >
                        <SelectTrigger className="h-5 w-18 text-[9px] border-none bg-transparent shadow-none hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-gray-950 dark:text-gray-100">
                          <SelectItem value="manual">Manual</SelectItem>
                          <SelectItem value="output">Output</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {cond.valueSource === "manual" ? (
                      <Input
                        value={cond.value}
                        onChange={(e) =>
                          updateCondition(cond.id, { value: e.target.value })
                        }
                        placeholder="Value to compare"
                        className="h-8 text-[12px] bg-white dark:bg-gray-950 dark:text-gray-200"
                      />
                    ) : (
                      <div className="grid grid-cols-2 gap-1">
                        <Select
                          value={
                            cond.value?.split(".")[0]?.replace("{{", "") || ""
                          }
                          onValueChange={(val) =>
                            updateCondition(cond.id, {
                              value: `{{${val}.output.input_as_text}}`,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-[10px] bg-white dark:bg-gray-950 dark:text-gray-200">
                            <SelectValue placeholder="Node" />
                          </SelectTrigger>
                          <SelectContent className="dark:bg-gray-950 dark:text-gray-100">
                            {upstreamNodes.map((n) => (
                              <SelectItem key={n.id} value={n.id}>
                                {n.data?.label || n.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={
                            cond.value?.split(".")[2]?.replace("}}", "") ||
                            "input_as_text"
                          }
                          onValueChange={(field) => {
                            const nodeId = cond.value
                              ?.split(".")[0]
                              ?.replace("{{", "");
                            if (nodeId)
                              updateCondition(cond.id, {
                                value: `{{${nodeId}.output.${field}}}`,
                              });
                          }}
                        >
                          <SelectTrigger className="h-8 text-[10px] bg-white dark:bg-gray-950 dark:text-gray-200">
                            <SelectValue placeholder="Field" />
                          </SelectTrigger>
                          <SelectContent className="dark:bg-gray-950 dark:text-gray-100">
                            <SelectItem value="input_as_text">Raw</SelectItem>
                            {(() => {
                              const nodeId = cond.value
                                ?.split(".")[0]
                                ?.replace("{{", "");
                              const sourceNode = upstreamNodes.find(
                                (n) => n.id === nodeId,
                              );
                              return sourceNode?.data?.jsonSchema?.map((f) => (
                                <SelectItem key={f.name} value={f.name}>
                                  {f.name}
                                </SelectItem>
                              ));
                            })()}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCondition(cond.id)}
                  className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
          {conditions.length === 0 && (
            <div className="text-center py-6 border border-dashed border-gray-200 dark:border-gray-800 rounded-lg text-gray-400 text-[10px]">
              No conditions defined. This node will always result in 'True'.
            </div>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
        <div>
          <Label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            True Branch
          </Label>
          <Select
            onValueChange={(value) => {
              if (onCreateEdge) {
                onUpdateNode(selectedNode.id, { trueLabel: [value] });
                onCreateEdge(selectedNode.id, value, "true");
              }
            }}
            value=""
          >
            <SelectTrigger className="w-full h-10 text-[11px] bg-white dark:bg-gray-950 border-emerald-100 dark:border-emerald-900/30">
              <SelectValue placeholder="Select target node..." />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-950 dark:text-gray-100">
              {getAvailableNodes().map((node) => (
                <SelectItem key={node.id} value={node.id} className="text-xs">
                  {node.data?.label || node.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedNode.data?.trueLabel &&
            selectedNode.data.trueLabel.length > 0 && (
              <div className="mt-1 text-[10px] text-emerald-600 font-medium">
                Connected to:{" "}
                {nodes.find((n) => n.id === selectedNode.data?.trueLabel?.[0])
                  ?.data?.label || selectedNode.data.trueLabel[0]}
              </div>
            )}
        </div>

        <div>
          <Label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            False Branch
          </Label>
          <Select
            onValueChange={(value) => {
              if (onCreateEdge) {
                onUpdateNode(selectedNode.id, { falseLabel: [value] });
                onCreateEdge(selectedNode.id, value, "false");
              }
            }}
            value=""
          >
            <SelectTrigger className="w-full h-10 text-[11px] bg-white dark:bg-gray-950 border-red-100 dark:border-red-900/30">
              <SelectValue placeholder="Select target node..." />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-950 dark:text-gray-100">
              {getAvailableNodes().map((node) => (
                <SelectItem key={node.id} value={node.id} className="text-xs">
                  {node.data?.label || node.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedNode.data?.falseLabel &&
            selectedNode.data.falseLabel.length > 0 && (
              <div className="mt-1 text-[10px] text-red-600 font-medium">
                Connected to:{" "}
                {nodes.find((n) => n.id === selectedNode.data?.falseLabel?.[0])
                  ?.data?.label || selectedNode.data.falseLabel[0]}
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
