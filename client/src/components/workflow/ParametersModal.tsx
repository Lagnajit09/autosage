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

interface Parameter {
  id: string;
  name: string;
  type: "string" | "number" | "boolean" | "file";
  description?: string;
}

interface ParametersModalProps {
  nodeId?: string;
  isOpen: boolean;
  onClose: () => void;
  parameters: Parameter[];
  onUpdateParameters: (parameters: Parameter[]) => void;
}

export const ParametersModal: React.FC<ParametersModalProps> = ({
  nodeId,
  isOpen,
  onClose,
  parameters,
  onUpdateParameters,
}) => {
  const [localParameters, setLocalParameters] = useState<Parameter[]>([]);

  // Reset local parameters whenever the modal opens with new parameters
  useEffect(() => {
    if (isOpen) {
      setLocalParameters([...parameters]);
    }
  }, [isOpen, parameters, nodeId]);

  const addParameter = () => {
    const newParameter: Parameter = {
      id: `param-${Date.now()}-${Math.random()}`,
      name: "",
      type: "string",
      description: "",
    };
    setLocalParameters([...localParameters, newParameter]);
  };

  const updateParameter = (
    id: string,
    field: keyof Parameter,
    value: string
  ) => {
    setLocalParameters(
      localParameters.map((param) =>
        param.id === id ? { ...param, [field]: value } : param
      )
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
      <DialogContent className="max-w-2xl max-h-[80vh] bg-workflow-midnight/40 dark:bg-workflow-midnight/40 backdrop-blur-sm border border-slate-700 dark:border-slate-700 text-white dark:text-white">
        <DialogHeader>
          <DialogTitle className="text-white dark:text-white flex items-center">
            <Settings
              size={18}
              className="mr-2 text-purple-400 dark:text-purple-400"
            />
            Configure Parameters
            {nodeId && (
              <span className="text-slate-400 dark:text-slate-400 text-sm ml-2">
                ({nodeId})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col h-[60vh]">
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-4">
              {localParameters.length === 0 ? (
                <div className="text-center py-8 text-slate-400 dark:text-slate-400">
                  <p className="text-sm">No parameters configured</p>
                  <p className="text-xs mt-1 text-slate-500 dark:text-slate-500">
                    Add parameters to make your scripts dynamic
                  </p>
                </div>
              ) : (
                localParameters.map((param) => (
                  <div
                    key={param.id}
                    className="bg-slate-700/30 dark:bg-slate-700/30 rounded-lg p-3 border border-slate-600/30 dark:border-slate-600/30"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-1">
                        <Label
                          htmlFor={`name-${param.id}`}
                          className="text-xs text-slate-300 dark:text-slate-300 mb-1 block"
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
                          className="h-8 text-xs bg-bg-primary/20 dark:bg-bg-primary/20 border border-slate-600/50 dark:border-slate-600/50 text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 dark:focus:ring-purple-500/50 focus:border-transparent"
                        />
                      </div>

                      <div className="flex-1">
                        <Label
                          htmlFor={`type-${param.id}`}
                          className="text-xs text-slate-300 dark:text-slate-300 mb-1 block"
                        >
                          Type
                        </Label>
                        <Select
                          value={param.type}
                          onValueChange={(value) =>
                            updateParameter(param.id, "type", value)
                          }
                        >
                          <SelectTrigger className="h-8 text-xs bg-bg-primary/20 dark:bg-bg-primary/20 border border-slate-600/50 dark:border-slate-600/50 text-white dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 dark:focus:ring-purple-500/50 focus:border-transparent">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-bg-primary/40 dark:bg-bg-primary/40 text-text-primary dark:text-text-primary border border-borders-active dark:border-borders-active">
                            <SelectItem
                              value="string"
                              className="text-xs hover:bg-slate-600/50 dark:hover:bg-slate-600/50 text-white dark:text-white"
                            >
                              String
                            </SelectItem>
                            <SelectItem
                              value="number"
                              className="text-xs hover:bg-slate-600/50 dark:hover:bg-slate-600/50 text-white dark:text-white"
                            >
                              Number
                            </SelectItem>
                            <SelectItem
                              value="boolean"
                              className="text-xs hover:bg-slate-600/50 dark:hover:bg-slate-600/50 text-white dark:text-white"
                            >
                              Boolean
                            </SelectItem>
                            <SelectItem
                              value="file"
                              className="text-xs hover:bg-slate-600/50 dark:hover:bg-slate-600/50 text-white dark:text-white"
                            >
                              File
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={() => removeParameter(param.id)}
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 hover:bg-red-500/20 dark:hover:bg-red-500/20 self-end"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-slate-600/30 dark:border-slate-600/30 pt-4">
            <div className="flex justify-between items-center">
              <Button
                onClick={addParameter}
                size="sm"
                className="text-xs bg-blue-600/20 dark:bg-blue-600/20 hover:bg-blue-600/30 dark:hover:bg-blue-600/30 border border-blue-500/30 dark:border-blue-500/30 text-blue-400 dark:text-blue-400 hover:text-blue-300 dark:hover:text-blue-300"
              >
                <Plus size={12} className="mr-1" />
                Add Parameter
              </Button>

              <div className="flex space-x-2">
                <Button
                  onClick={handleCancel}
                  size="sm"
                  variant="outline"
                  className="text-xs border-slate-600 bg-slate-200 dark:bg-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-800 hover:bg-slate-50 dark:hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  size="sm"
                  className="text-xs bg-blue-600 dark:bg-blue-600 hover:bg-blue-500 dark:hover:bg-blue-500 text-white dark:text-white"
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
