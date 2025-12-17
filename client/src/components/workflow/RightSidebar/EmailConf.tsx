import React from "react";
import { Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BaseConfigProps, Credential } from "@/utils/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export const EmailConf: React.FC<BaseConfigProps> = ({
  selectedNode,
  onUpdateNode,
}) => {
  const handleInputChange = (field: string, value: string | boolean) => {
    onUpdateNode(selectedNode.id, { [field]: value });
  };

  const handleEmailArrayChange = (
    field: "to" | "cc" | "bcc",
    value: string[]
  ) => {
    onUpdateNode(selectedNode.id, { [field]: value });
  };

  const addEmailRecipient = (field: "to" | "cc" | "bcc") => {
    const currentArray = selectedNode.data?.[field] || [];
    handleEmailArrayChange(field, [...currentArray, ""]);
  };

  const removeEmailRecipient = (field: "to" | "cc" | "bcc", index: number) => {
    const currentArray = selectedNode.data?.[field] || [];
    const newArray = currentArray.filter((_, i) => i !== index);
    handleEmailArrayChange(field, newArray);
  };

  const updateEmailRecipient = (
    field: "to" | "cc" | "bcc",
    index: number,
    value: string
  ) => {
    const currentArray = selectedNode.data?.[field] || [];
    const newArray = [...currentArray];
    newArray[index] = value;
    handleEmailArrayChange(field, newArray);
  };

  const handleSMTPConfigChange = (
    field: string,
    value: string | number | boolean
  ) => {
    const currentConfig = selectedNode.data?.smtpConfig || {
      host: "",
      port: 587,
      secure: false,
      selectedCredential: undefined,
    };

    if (field.startsWith("selectedCredential.")) {
      const authField = field.replace("selectedCredential.", "");
      onUpdateNode(selectedNode.id, {
        smtpConfig: {
          ...currentConfig,
          selectedCredential: {
            ...currentConfig.selectedCredential,
            [authField]: value,
          },
        },
      });
    } else {
      onUpdateNode(selectedNode.id, {
        smtpConfig: {
          ...currentConfig,
          [field]: value,
        },
      });
    }
  };

  const getSavedCredentials = () => {
    try {
      const savedCredentials = sessionStorage.getItem("workflowCredentials");
      if (savedCredentials) {
        return JSON.parse(savedCredentials);
      }
    } catch (error) {
      console.error("Error loading credentials:", error);
    }
    return [];
  };

  const handleCredentialSelect = (credentialId: string) => {
    const selectedCred = getSavedCredentials().find(
      (cred: Credential) => cred.id === credentialId
    );
    if (selectedCred) {
      onUpdateNode(selectedNode.id, {
        smtpConfig: {
          ...selectedNode.data?.smtpConfig,
          selectedCredential: {
            id: selectedCred.id,
            name: selectedCred.name,
            username: selectedCred.username,
            password: selectedCred.password,
            createdAt: selectedCred.createdAt,
          },
        },
      });
    }
  };

  const getSelectedCredentialId = () => {
    const selectedCred = selectedNode.data?.smtpConfig?.selectedCredential;
    if (typeof selectedCred === "string") {
      return selectedCred;
    } else if (selectedCred && typeof selectedCred === "object") {
      return selectedCred.id;
    }
    return "";
  };

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-slate-300 dark:text-slate-300 border-b border-slate-600/30 dark:border-slate-600/30 pb-2">
        Email Configuration
      </h4>

      {/* From */}
      <div>
        <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
          From
        </Label>
        <Input
          type="email"
          value={String(selectedNode.data?.from || "")}
          onChange={(e) => handleInputChange("from", e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none"
          placeholder="sender@domain.com"
        />
      </div>

      {/* To Recipients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
            To
          </Label>
          <Button
            onClick={() => addEmailRecipient("to")}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-slate-400 dark:text-slate-400 hover:text-black dark:hover:text-black"
          >
            <Plus size={12} />
          </Button>
        </div>
        {(selectedNode.data?.to || []).map((email, index) => (
          <div key={index} className="flex items-center space-x-2 mb-2">
            <Input
              type="email"
              value={email}
              onChange={(e) =>
                updateEmailRecipient("to", index, e.target.value)
              }
              className="w-full px-3 py-2.5 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none"
              placeholder="recipient@domain.com"
            />
            <Button
              onClick={() => removeEmailRecipient("to", index)}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-red-400 dark:text-red-400 hover:text-red-500 dark:hover:text-red-500"
            >
              <Minus size={12} />
            </Button>
          </div>
        ))}
      </div>

      {/* CC Recipients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
            CC
          </Label>
          <Button
            onClick={() => addEmailRecipient("cc")}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-slate-400 dark:text-slate-400 hover:text-black dark:hover:text-black"
          >
            <Plus size={12} />
          </Button>
        </div>
        {(selectedNode.data?.cc || []).map((email, index) => (
          <div key={index} className="flex items-center space-x-2 mb-2">
            <Input
              type="email"
              value={email}
              onChange={(e) =>
                updateEmailRecipient("cc", index, e.target.value)
              }
              className="w-full px-3 py-2.5 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none"
              placeholder="cc@domain.com"
            />
            <Button
              onClick={() => removeEmailRecipient("cc", index)}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-red-400 dark:text-red-400 hover:text-red-500 dark:hover:text-red-500"
            >
              <Minus size={12} />
            </Button>
          </div>
        ))}
      </div>

      {/* BCC Recipients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
            BCC
          </Label>
          <Button
            onClick={() => addEmailRecipient("bcc")}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-slate-400 dark:text-slate-400 hover:text-black dark:hover:text-black"
          >
            <Plus size={12} />
          </Button>
        </div>
        {(selectedNode.data?.bcc || []).map((email, index) => (
          <div key={index} className="flex items-center space-x-2 mb-2">
            <input
              type="email"
              value={email}
              onChange={(e) =>
                updateEmailRecipient("bcc", index, e.target.value)
              }
              className="w-full px-3 py-2.5 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none"
              placeholder="bcc@domain.com"
            />
            <Button
              onClick={() => removeEmailRecipient("bcc", index)}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-red-400 dark:text-red-400 hover:text-red-500 dark:hover:text-red-500"
            >
              <Minus size={12} />
            </Button>
          </div>
        ))}
      </div>

      {/* Subject */}
      <div>
        <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
          Subject
        </Label>
        <Input
          type="text"
          value={String(selectedNode.data?.subject || "")}
          onChange={(e) => handleInputChange("subject", e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none"
          placeholder="Email subject"
        />
      </div>

      {/* Body */}
      <div>
        <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
          Body
        </Label>
        <textarea
          value={String(selectedNode.data?.body || "")}
          onChange={(e) => handleInputChange("body", e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none resize-none"
          rows={4}
          placeholder="Email body content"
        />
      </div>

      {/* HTML Toggle */}
      <Label
        htmlFor="isHTML"
        className="hover:bg-gray-100 dark:hover:bg-gray-800 flex items-start gap-3 rounded-lg border border-gray-300 dark:border-gray-700 p-3"
      >
        <Checkbox
          id="isHTML"
          checked={selectedNode.data?.isHTML || false}
          onCheckedChange={(checked) => handleInputChange("isHTML", checked)}
          className="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700 data-[state=unchecked]:border-gray-300 dark:data-[state=unchecked]:border-gray-700"
        />
        <div className="grid gap-1.5 font-normal">
          <p className="text-sm leading-none font-medium text-gray-900 dark:text-gray-100">
            HTML Format
          </p>
        </div>
      </Label>

      {/* SMTP Configuration */}
      <div className="space-y-4">
        <h5 className="text-sm font-medium text-slate-300 dark:text-slate-300 border-b border-slate-600/30 dark:border-slate-600/30 pb-2">
          SMTP Configuration
        </h5>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
              Host
            </Label>
            <Input
              type="text"
              value={String(selectedNode.data?.smtpConfig?.host || "")}
              onChange={(e) => handleSMTPConfigChange("host", e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none"
              placeholder="smtp.domain.com"
            />
          </div>

          <div>
            <Label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
              Port
            </Label>
            <Input
              type="text"
              value={selectedNode.data?.smtpConfig?.port || 587}
              onChange={(e) =>
                handleSMTPConfigChange("port", parseInt(e.target.value))
              }
              className="w-full px-3 py-2.5 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 rounded-md text-white dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none"
              placeholder="587"
            />
          </div>
        </div>

        <Label
          htmlFor="secure"
          className="hover:bg-bg-secondary/50 dark:hover:bg-bg-secondary/50 flex items-start gap-3 rounded-lg border border-slate-600/50 dark:border-slate-600/50 p-3"
        >
          <Checkbox
            id="secure"
            checked={selectedNode.data?.smtpConfig?.secure || false}
            onCheckedChange={(checked) =>
              handleSMTPConfigChange("secure", checked)
            }
            className="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700 data-[state=unchecked]:border-borders-primary dark:data-[state=unchecked]:border-borders-primary"
          />
          <div className="grid gap-1.5 font-normal">
            <p className="text-sm leading-none font-medium text-text-primary dark:text-text-primary">
              Secure Connection (TLS/SSL)
            </p>
          </div>
        </Label>

        <div>
          <label className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
            Credentials
          </label>
          <Select
            onValueChange={handleCredentialSelect}
            value={getSelectedCredentialId()}
          >
            <SelectTrigger className="w-full h-11 text-sm bg-slate-700/25 dark:bg-slate-700/25 border border-slate-600/50 dark:border-slate-600/50 text-white dark:text-white">
              <SelectValue placeholder="Select credentials..." />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
              {getSavedCredentials().map((credential: Credential) => (
                <SelectItem
                  key={credential.id}
                  value={credential.id}
                  className="text-sm"
                >
                  <div className="flex items-center space-x-2">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                      />
                    </svg>
                    <span>{credential.name}</span>
                  </div>
                </SelectItem>
              ))}
              {getSavedCredentials().length === 0 && (
                <SelectItem
                  value="none"
                  disabled
                  className="text-sm text-slate-500 dark:text-slate-500"
                >
                  No credentials available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
            Add credentials via the hamburger menu
          </p>
        </div>
      </div>
    </div>
  );
};
