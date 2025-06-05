import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
  isOpen: boolean;
  onClose: () => void;
  parameters: Parameter[];
  onUpdateParameters: (parameters: Parameter[]) => void;
}

export const ParametersModal: React.FC<ParametersModalProps> = ({
  isOpen,
  onClose,
  parameters,
  onUpdateParameters,
}) => {
  const [localParameters, setLocalParameters] =
    useState<Parameter[]>(parameters);

  const addParameter = () => {
    const newParameter: Parameter = {
      id: `param-${Date.now()}`,
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
    onUpdateParameters(localParameters);
    onClose();
  };

  const handleCancel = () => {
    setLocalParameters(parameters);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] bg-slate-800 border border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center">
            <div className="w-1 h-1 bg-blue-500 rounded-full mr-2"></div>
            Configure Parameters
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col h-[60vh]">
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-4">
              {localParameters.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p className="text-sm">No parameters configured</p>
                  <p className="text-xs mt-1">
                    Add parameters to make your scripts dynamic
                  </p>
                </div>
              ) : (
                localParameters.map((param) => (
                  <div
                    key={param.id}
                    className="bg-slate-700/30 rounded-lg p-2 border border-slate-600/30"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-1">
                        <Label
                          htmlFor={`name-${param.id}`}
                          className="text-xs text-slate-300 mb-1 block"
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
                          className="h-8 text-xs bg-slate-700/50 border-slate-600/50 text-white"
                        />
                      </div>

                      <div className="flex-1">
                        <Label
                          htmlFor={`type-${param.id}`}
                          className="text-xs text-slate-300 mb-1 block"
                        >
                          Type
                        </Label>
                        <Select
                          value={param.type}
                          onValueChange={(value) =>
                            updateParameter(param.id, "type", value)
                          }
                        >
                          <SelectTrigger className="h-8 text-xs bg-slate-700/50 border-slate-600/50 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-700 border border-slate-600 text-white">
                            <SelectItem
                              value="string"
                              className="text-xs hover:bg-slate-600"
                            >
                              String
                            </SelectItem>
                            <SelectItem
                              value="number"
                              className="text-xs hover:bg-slate-600"
                            >
                              Number
                            </SelectItem>
                            <SelectItem
                              value="boolean"
                              className="text-xs hover:bg-slate-600"
                            >
                              Boolean
                            </SelectItem>
                            <SelectItem
                              value="file"
                              className="text-xs hover:bg-slate-600"
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
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>

                    {/* <div>
                      <Label
                        htmlFor={`desc-${param.id}`}
                        className="text-xs text-slate-300 mb-1 block"
                      >
                        Description (Optional)
                      </Label>
                      <Input
                        id={`desc-${param.id}`}
                        value={param.description || ""}
                        onChange={(e) =>
                          updateParameter(
                            param.id,
                            "description",
                            e.target.value
                          )
                        }
                        placeholder="Brief description of this parameter"
                        className="h-8 text-xs bg-slate-700/50 border-slate-600/50 text-white"
                      />
                    </div> */}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-slate-600/30 pt-4 mt-4">
            <div className="flex justify-between items-center">
              <Button
                onClick={addParameter}
                size="sm"
                className="text-xs bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 hover:text-blue-300"
              >
                <Plus size={12} className="mr-1" />
                Add Parameter
              </Button>

              <div className="flex space-x-2">
                <Button
                  onClick={handleCancel}
                  size="sm"
                  variant="outline"
                  className="text-xs bg-slate-700/30 hover:bg-slate-600/30 border-slate-600/50 text-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  size="sm"
                  className="text-xs bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-400 hover:text-green-300"
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
