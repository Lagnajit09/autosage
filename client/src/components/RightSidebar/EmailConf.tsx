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
      <h4 className="text-sm font-medium text-slate-300 border-b border-slate-600/30 pb-2">
        Email Configuration
      </h4>

      {/* From */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          From
        </label>
        <input
          type="email"
          value={String(selectedNode.data?.from || "")}
          onChange={(e) => handleInputChange("from", e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
          placeholder="sender@domain.com"
        />
      </div>

      {/* To Recipients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-slate-300">To</label>
          <Button
            onClick={() => addEmailRecipient("to")}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-slate-400 hover:text-white"
          >
            <Plus size={12} />
          </Button>
        </div>
        {(selectedNode.data?.to || []).map((email, index) => (
          <div key={index} className="flex items-center space-x-2 mb-2">
            <input
              type="email"
              value={email}
              onChange={(e) =>
                updateEmailRecipient("to", index, e.target.value)
              }
              className="flex-1 px-3 py-2 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="recipient@domain.com"
            />
            <Button
              onClick={() => removeEmailRecipient("to", index)}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
            >
              <Minus size={12} />
            </Button>
          </div>
        ))}
      </div>

      {/* CC Recipients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-slate-300">CC</label>
          <Button
            onClick={() => addEmailRecipient("cc")}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-slate-400 hover:text-white"
          >
            <Plus size={12} />
          </Button>
        </div>
        {(selectedNode.data?.cc || []).map((email, index) => (
          <div key={index} className="flex items-center space-x-2 mb-2">
            <input
              type="email"
              value={email}
              onChange={(e) =>
                updateEmailRecipient("cc", index, e.target.value)
              }
              className="flex-1 px-3 py-2 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="cc@domain.com"
            />
            <Button
              onClick={() => removeEmailRecipient("cc", index)}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
            >
              <Minus size={12} />
            </Button>
          </div>
        ))}
      </div>

      {/* BCC Recipients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-slate-300">BCC</label>
          <Button
            onClick={() => addEmailRecipient("bcc")}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-slate-400 hover:text-white"
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
              className="flex-1 px-3 py-2 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="bcc@domain.com"
            />
            <Button
              onClick={() => removeEmailRecipient("bcc", index)}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
            >
              <Minus size={12} />
            </Button>
          </div>
        ))}
      </div>

      {/* Subject */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Subject
        </label>
        <input
          type="text"
          value={String(selectedNode.data?.subject || "")}
          onChange={(e) => handleInputChange("subject", e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
          placeholder="Email subject"
        />
      </div>

      {/* Body */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Body
        </label>
        <textarea
          value={String(selectedNode.data?.body || "")}
          onChange={(e) => handleInputChange("body", e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 resize-none"
          rows={4}
          placeholder="Email body content"
        />
      </div>

      {/* HTML Toggle */}
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="isHTML"
          checked={selectedNode.data?.isHTML || false}
          onChange={(e) => handleInputChange("isHTML", e.target.checked)}
          className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
        />
        <label htmlFor="isHTML" className="text-sm text-slate-300">
          HTML Format
        </label>
      </div>

      {/* SMTP Configuration */}
      <div className="space-y-4">
        <h5 className="text-sm font-medium text-slate-300 border-b border-slate-600/30 pb-2">
          SMTP Configuration
        </h5>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Host
            </label>
            <input
              type="text"
              value={String(selectedNode.data?.smtpConfig?.host || "")}
              onChange={(e) => handleSMTPConfigChange("host", e.target.value)}
              className="w-full px-2 py-2 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="smtp.domain.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Port
            </label>
            <input
              type="number"
              value={selectedNode.data?.smtpConfig?.port || 587}
              onChange={(e) =>
                handleSMTPConfigChange("port", parseInt(e.target.value))
              }
              className="w-full px-2 py-2 text-sm bg-slate-700/50 border border-slate-600/50 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="587"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="secure"
            checked={selectedNode.data?.smtpConfig?.secure || false}
            onChange={(e) => handleSMTPConfigChange("secure", e.target.checked)}
            className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
          />
          <label htmlFor="secure" className="text-sm text-slate-300">
            Secure Connection (TLS/SSL)
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Credentials
          </label>
          <Select
            onValueChange={handleCredentialSelect}
            value={getSelectedCredentialId()}
          >
            <SelectTrigger className="w-full h-11 text-sm bg-slate-700/50 border border-slate-600/50 text-white">
              <SelectValue placeholder="Select credentials..." />
            </SelectTrigger>
            <SelectContent className="bg-slate-700 border border-slate-600 text-white">
              {getSavedCredentials().map((credential: Credential) => (
                <SelectItem
                  key={credential.id}
                  value={credential.id}
                  className="text-sm hover:bg-slate-600 focus:bg-slate-600"
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
                  className="text-sm text-slate-500"
                >
                  No credentials available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500 mt-2">
            Add credentials via the hamburger menu
          </p>
        </div>
      </div>
    </div>
  );
};
