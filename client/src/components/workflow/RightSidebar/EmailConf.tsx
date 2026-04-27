import React, { useState, useEffect, useCallback } from "react";
import { Plus, Minus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BaseConfigProps, Credential, Vault } from "@/utils/types";
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
import { useAuth } from "@clerk/clerk-react";
import { apiRequest } from "@/lib/api-client";
import { toast } from "sonner";

export const EmailConf: React.FC<BaseConfigProps> = ({
  selectedNode,
  onUpdateNode,
}) => {
  const { getToken, isSignedIn } = useAuth();
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [isLoadingVaults, setIsLoadingVaults] = useState(false);

  const fetchVaults = useCallback(async () => {
    setIsLoadingVaults(true);
    try {
      const token = await getToken();
      const response = await apiRequest("/api/vault/vaults/", {}, token);
      if (response.success) {
        setVaults(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch vaults:", error);
      toast.error("Failed to load vaults");
    } finally {
      setIsLoadingVaults(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (isSignedIn) {
      fetchVaults();
    }
  }, [isSignedIn, fetchVaults]);

  const allCredentials = vaults
    .flatMap((v) => v.credentials || [])
    .filter((c) => c.credential_type === "username_password");

  const handleInputChange = (field: string, value: string | boolean) => {
    onUpdateNode(selectedNode.id, { [field]: value });
  };

  const handleEmailArrayChange = (
    field: "to" | "cc" | "bcc",
    value: string[],
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
    value: string,
  ) => {
    const currentArray = selectedNode.data?.[field] || [];
    const newArray = [...currentArray];
    newArray[index] = value;
    handleEmailArrayChange(field, newArray);
  };

  const handleSMTPConfigChange = (
    field: "host" | "port" | "secure",
    value: string | number | boolean,
  ) => {
    const currentConfig = selectedNode.data?.smtpConfig || {
      host: "",
      port: 587,
      secure: false,
    };

    onUpdateNode(selectedNode.id, {
      smtpConfig: {
        ...currentConfig,
        [field]: value,
      },
    });
  };

  const handleCredentialSelect = (credentialId: string) => {
    const selectedCred = allCredentials.find((c) => c.id === credentialId);
    const currentConfig = selectedNode.data?.smtpConfig || {
      host: "",
      port: 587,
      secure: false,
    };
    onUpdateNode(selectedNode.id, {
      smtpConfig: {
        ...currentConfig,
        vaultId: selectedCred?.vault,
        credentialId: credentialId,
      },
    });
  };

  const getSelectedCredentialId = () => {
    return selectedNode.data?.smtpConfig?.credentialId || "";
  };

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-800 pb-2">
        Email Configuration
      </h4>

      {/* From */}
      <div>
        <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          From
        </Label>
        <Input
          type="email"
          value={String(selectedNode.data?.from || "")}
          onChange={(e) => handleInputChange("from", e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
          placeholder="Defaults to credential email"
        />
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
          Leave empty to use the SMTP credential's username.
        </p>
      </div>

      {/* To Recipients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            To
          </Label>
          <Button
            onClick={() => addEmailRecipient("to")}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-black"
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
              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
              placeholder="recipient@domain.com"
            />
            <Button
              onClick={() => removeEmailRecipient("to", index)}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500"
            >
              <Minus size={12} />
            </Button>
          </div>
        ))}
      </div>

      {/* CC Recipients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            CC
          </Label>
          <Button
            onClick={() => addEmailRecipient("cc")}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-black"
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
              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
              placeholder="cc@domain.com"
            />
            <Button
              onClick={() => removeEmailRecipient("cc", index)}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500"
            >
              <Minus size={12} />
            </Button>
          </div>
        ))}
      </div>

      {/* BCC Recipients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            BCC
          </Label>
          <Button
            onClick={() => addEmailRecipient("bcc")}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-black"
          >
            <Plus size={12} />
          </Button>
        </div>
        {(selectedNode.data?.bcc || []).map((email, index) => (
          <div key={index} className="flex items-center space-x-2 mb-2">
            <Input
              type="email"
              value={email}
              onChange={(e) =>
                updateEmailRecipient("bcc", index, e.target.value)
              }
              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
              placeholder="bcc@domain.com"
            />
            <Button
              onClick={() => removeEmailRecipient("bcc", index)}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500"
            >
              <Minus size={12} />
            </Button>
          </div>
        ))}
      </div>

      {/* Subject */}
      <div>
        <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Subject
        </Label>
        <Input
          type="text"
          value={String(selectedNode.data?.subject || "")}
          onChange={(e) => handleInputChange("subject", e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
          placeholder="Email subject"
        />
      </div>

      {/* Body */}
      <div>
        <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Body
        </Label>
        <textarea
          value={String(selectedNode.data?.body || "")}
          onChange={(e) => handleInputChange("body", e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none resize-none"
          rows={4}
          placeholder="Email body content"
        />
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
          Rendered inside the Autosage email template. Leave blank for a
          generic message.
        </p>
      </div>

      {/* SMTP Configuration */}
      <div className="space-y-4">
        <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-800 pb-2">
          SMTP Configuration
        </h5>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Host
            </Label>
            <Input
              type="text"
              value={String(selectedNode.data?.smtpConfig?.host || "")}
              onChange={(e) => handleSMTPConfigChange("host", e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
              placeholder="smtp.gmail.com"
            />
          </div>

          <div>
            <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Port
            </Label>
            <Input
              type="number"
              value={selectedNode.data?.smtpConfig?.port ?? 587}
              onChange={(e) =>
                handleSMTPConfigChange(
                  "port",
                  parseInt(e.target.value, 10) || 587,
                )
              }
              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
              placeholder="587"
            />
          </div>
        </div>

        <Label
          htmlFor="secure"
          className="hover:bg-gray-100 dark:hover:bg-gray-800 flex items-start gap-3 rounded-lg border border-gray-300 dark:border-gray-700 p-3"
        >
          <Checkbox
            id="secure"
            checked={selectedNode.data?.smtpConfig?.secure || false}
            onCheckedChange={(checked) =>
              handleSMTPConfigChange("secure", Boolean(checked))
            }
            className="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700 data-[state=unchecked]:border-gray-300 dark:data-[state=unchecked]:border-gray-700"
          />
          <div className="grid gap-1.5 font-normal">
            <p className="text-sm leading-none font-medium text-gray-900 dark:text-gray-100">
              Secure Connection (SMTPS)
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Enable for SMTPS (port 465). Leave unchecked for STARTTLS on 587.
            </p>
          </div>
        </Label>

        <div>
          <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Credentials
          </Label>
          <Select
            onValueChange={handleCredentialSelect}
            value={getSelectedCredentialId()}
          >
            <SelectTrigger className="w-full h-11 text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
              <SelectValue placeholder="Select credentials..." />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800">
              {isLoadingVaults ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-sm">Loading credentials...</span>
                </div>
              ) : (
                <>
                  {allCredentials.map((credential: Credential) => (
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
                  {allCredentials.length === 0 && (
                    <SelectItem
                      value="none"
                      disabled
                      className="text-sm text-gray-500 dark:text-gray-500"
                    >
                      No username/password credentials available
                    </SelectItem>
                  )}
                </>
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
            Add SMTP credentials in the Vault. Only the credential ID is stored
            on the workflow; the password stays encrypted at rest.
          </p>
        </div>
      </div>
    </div>
  );
};
