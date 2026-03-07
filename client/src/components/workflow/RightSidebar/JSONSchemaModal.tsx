import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { OutputField } from "@/utils/types";

interface JSONSchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
  schema: OutputField[];
  onSave: (schema: OutputField[]) => void;
}

export const JSONSchemaModal: React.FC<JSONSchemaModalProps> = ({
  isOpen,
  onClose,
  schema,
  onSave,
}) => {
  const [fields, setFields] = useState<OutputField[]>(
    schema.length > 0 ? schema : [{ name: "", type: "string" }],
  );

  React.useEffect(() => {
    if (isOpen) {
      setFields(schema.length > 0 ? schema : [{ name: "", type: "string" }]);
    }
  }, [isOpen, schema]);

  const addField = () => {
    setFields([...fields, { name: "", type: "string" }]);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, updates: Partial<OutputField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFields(newFields);
  };

  const handleSave = () => {
    // Filter out empty field names
    const filteredFields = fields.filter((f) => f.name.trim() !== "");
    onSave(filteredFields);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100">
        <DialogHeader>
          <DialogTitle>Design JSON Output Schema</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="max-h-[400px] overflow-y-auto space-y-3 pr-2">
            {fields.map((field, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="flex-1">
                  <Input
                    type="text"
                    placeholder="Field name"
                    value={field.name}
                    onChange={(e) =>
                      updateField(index, { name: e.target.value })
                    }
                    className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 outline-none focus:border-gray-800"
                  />
                </div>
                <div className="w-32">
                  <Select
                    value={field.type}
                    onValueChange={(
                      value:
                        | "string"
                        | "number"
                        | "boolean"
                        | "array"
                        | "object",
                    ) => updateField(index, { type: value })}
                  >
                    <SelectTrigger className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-800">
                      <SelectItem value="string">String</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="boolean">Boolean</SelectItem>
                      <SelectItem value="array">Array</SelectItem>
                      <SelectItem value="object">Object</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeField(index)}
                  className="text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addField}
            className="w-full border-dashed dark:text-gray-950"
          >
            <Plus size={14} className="mr-2" /> Add Field
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            Save Schema
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
