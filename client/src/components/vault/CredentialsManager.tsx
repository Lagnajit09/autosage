import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Edit, Loader2, EyeOff } from "lucide-react";
import { Credential } from "@/utils/types";
import { apiRequest } from "@/lib/api-client";
import { toast } from "sonner";
import { useAuth } from "@clerk/clerk-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

import { DeleteConfirmationModal } from "../DeleteConfirmationModal";
import { CredentialRevealModal } from "./CredentialRevealModal";

export function CredentialsManager({
  vaultId,
  credentials,
  onUpdate,
}: {
  vaultId: string;
  credentials: Credential[];
  onUpdate: (c: Credential[]) => void;
}) {
  const { getToken } = useAuth();
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] =
    useState<Credential["credential_type"]>("username_password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sshKey, setSshKey] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [revealTargetId, setRevealTargetId] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setType("username_password");
    setUsername("");
    setPassword("");
    setSshKey("");
    setEditId(null);
    setIsAdding(false);
  };

  const handleSave = async () => {
    if (!name) return;

    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        vault: vaultId,
        name,
        credential_type: type,
      };

      if (type === "username_password") {
        payload.username = username;
        payload.password = password;
      } else if (type === "ssh_key") {
        payload.ssh_key = sshKey;
      }

      const endpoint = editId
        ? `/api/vault/credentials/${editId}/`
        : `/api/vault/credentials/`;

      const token = await getToken();
      const response = await apiRequest(
        endpoint,
        {
          method: editId ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
        token,
      );

      if (response.success) {
        if (editId) {
          onUpdate(
            credentials.map((c) => (c.id === editId ? response.data : c)),
          );
          toast.success("Credential updated successfully");
        } else {
          onUpdate([...credentials, response.data]);
          toast.success("Credential created successfully");
        }
        resetForm();
      }
    } catch (error) {
      console.error("Failed to save credential:", error);
      toast.error("Failed to save credential");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (cred: Credential) => {
    setIsAdding(true);
    setEditId(cred.id);
    setName(cred.name);
    setType(cred.credential_type);
    setUsername(cred.username || "");
    setPassword(""); // Don't show old password for security
    setSshKey(""); // Don't show old key for security
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;

    setIsDeleting(true);
    try {
      const token = await getToken();
      const response = await apiRequest(
        `/api/vault/credentials/${deleteTargetId}/`,
        {
          method: "DELETE",
        },
        token,
      );
      if (response.success) {
        onUpdate(credentials.filter((c) => c.id !== deleteTargetId));
        toast.success("Credential deleted successfully");
        setDeleteTargetId(null);
      }
    } catch (error) {
      console.error("Failed to delete credential:", error);
      toast.error("Failed to delete credential");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Stored Credentials
        </h3>
        {!isAdding && (
          <Button
            size="sm"
            onClick={() => setIsAdding(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Plus className="w-4 h-4 mr-2" /> Add Credential
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="border p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Root User"
                  maxLength={25}
                  className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Type</Label>
                <Select
                  value={type}
                  onValueChange={(v: Credential["credential_type"]) =>
                    setType(v)
                  }
                >
                  <SelectTrigger className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100">
                    <SelectItem
                      value="username_password"
                      className="hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 dark:hover:text-gray-100 dark:text-gray-300 cursor-pointer"
                    >
                      Username / Password
                    </SelectItem>
                    <SelectItem
                      value="ssh_key"
                      className="hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 dark:hover:text-gray-100 dark:text-gray-300 cursor-pointer"
                    >
                      SSH Key
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {type === "username_password" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">
                    Username
                  </Label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">
                    Password
                  </Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>
            )}

            {type === "ssh_key" && (
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">
                  Private Key
                </Label>
                <Textarea
                  className="font-mono text-xs bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 resize-none"
                  rows={5}
                  value={sshKey}
                  onChange={(e) => setSshKey(e.target.value)}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={resetForm}
                className="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-500 text-white min-w-[80px]"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : editId ? (
                  "Update"
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="border rounded-md border-gray-200 dark:border-gray-800">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900">
              <TableHead className="text-gray-500 dark:text-gray-400">
                Name
              </TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">
                Type
              </TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">
                Details
              </TableHead>
              <TableHead className="text-right text-gray-500 dark:text-gray-400">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {credentials.length === 0 ? (
              <TableRow className="border-gray-200 dark:border-gray-800 dark:hover:bg-gray-900">
                <TableCell
                  colSpan={4}
                  className="text-center h-24 text-muted-foreground text-gray-500 dark:text-gray-400"
                >
                  No credentials found in this vault.
                </TableCell>
              </TableRow>
            ) : (
              credentials.map((cred) => (
                <TableRow
                  key={cred.id}
                  className="border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
                >
                  <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                    {cred.name}
                  </TableCell>
                  <TableCell className="capitalize text-gray-700 dark:text-gray-300">
                    {cred.credential_type.replace("_", " ")}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm text-gray-500 dark:text-gray-400">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRevealTargetId(cred.id)}
                          className="hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                        >
                          <EyeOff className="w-5 h-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Show Credential</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(cred)}
                        className="hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <Edit className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTargetId(cred.id)}
                        className="hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <Trash2 className="w-4 h-4 text-red-500 dark:text-red-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DeleteConfirmationModal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        title="Delete Credential"
        description="Are you sure you want to delete this credential? This action cannot be undone and may affect servers using this credential."
      />

      <CredentialRevealModal
        isOpen={!!revealTargetId}
        onClose={() => setRevealTargetId(null)}
        credentialId={revealTargetId}
      />
    </div>
  );
}
