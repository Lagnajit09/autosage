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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Edit, Key, Loader2 } from "lucide-react";
import { Server, Credential } from "@/utils/types";
import { apiRequest } from "@/lib/api-client";
import { toast } from "sonner";
import { useAuth } from "@clerk/clerk-react";
import { DeleteConfirmationModal } from "../DeleteConfirmationModal";

export function ServersManager({
  vaultId,
  servers,
  availableCredentials,
  onUpdate,
}: {
  vaultId: string;
  servers: Server[];
  availableCredentials: Credential[];
  onUpdate: (s: Server[]) => void;
}) {
  const { getToken } = useAuth();
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState<string>("");
  const [method, setMethod] = useState<Server["connection_method"]>("ssh");
  const [credId, setCredId] = useState<string>("none");
  const [editId, setEditId] = useState<string | null>(null);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setHost("");
    setPort("");
    setMethod("ssh");
    setCredId("none");
    setEditId(null);
    setIsAdding(false);
  };

  const handleSave = async () => {
    if (!name || !host) return;

    setIsSaving(true);
    try {
      const payload: any = {
        vault: vaultId,
        name,
        host,
        port: port ? parseInt(port) : undefined,
        connection_method: method,
        credential: credId && credId !== "none" ? credId : null,
      };

      const endpoint = editId
        ? `/api/vault/servers/${editId}/`
        : `/api/vault/servers/`;

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
          onUpdate(servers.map((s) => (s.id === editId ? response.data : s)));
          toast.success("Server updated successfully");
        } else {
          onUpdate([...servers, response.data]);
          toast.success("Server created successfully");
        }
        resetForm();
      }
    } catch (error) {
      console.error("Failed to save server:", error);
      toast.error("Failed to save server");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (server: Server) => {
    setIsAdding(true);
    setEditId(server.id);
    setName(server.name);
    setHost(server.host);
    setPort(server.port?.toString() || "");
    setMethod(server.connection_method);
    setCredId(server.credential || "none");
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;

    setIsDeleting(true);
    try {
      const token = await getToken();
      const response = await apiRequest(
        `/api/vault/servers/${deleteTargetId}/`,
        {
          method: "DELETE",
        },
        token,
      );
      if (response.success) {
        onUpdate(servers.filter((s) => s.id !== deleteTargetId));
        toast.success("Server deleted successfully");
        setDeleteTargetId(null);
      }
    } catch (error) {
      console.error("Failed to delete server:", error);
      toast.error("Failed to delete server");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Managed Servers
        </h3>
        {!isAdding && (
          <Button
            size="sm"
            onClick={() => setIsAdding(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Plus className="w-4 h-4 mr-2" /> Add Server
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="border p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">
                  Display Name
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Web Server Prod"
                  className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">
                  Host / IP
                </Label>
                <Input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="192.168.x.x"
                  className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">
                  Connection
                </Label>
                <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                  <SelectTrigger className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100">
                    <SelectItem
                      value="ssh"
                      className="hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 dark:hover:text-gray-100 dark:text-gray-200 cursor-pointer"
                    >
                      SSH (Linux)
                    </SelectItem>
                    <SelectItem
                      value="winrm"
                      className="hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 dark:hover:text-gray-100 dark:text-gray-200 cursor-pointer"
                    >
                      WinRM (Windows)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Port</Label>
                <Input
                  type="text"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder={method === "ssh" ? "22" : "5985"}
                  className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">
                  Default Credential
                </Label>
                <Select value={credId} onValueChange={setCredId}>
                  <SelectTrigger className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100">
                    <SelectItem
                      value="none"
                      className="hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 dark:hover:text-gray-100 dark:text-gray-200 cursor-pointer"
                    >
                      -- None --
                    </SelectItem>
                    {availableCredentials.map((c) => (
                      <SelectItem
                        key={c.id}
                        value={c.id.toString()}
                        className="hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 dark:hover:text-gray-100 dark:text-gray-200 cursor-pointer"
                      >
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

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
                Host
              </TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">
                Method
              </TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">
                Credential
              </TableHead>
              <TableHead className="text-right text-gray-500 dark:text-gray-400">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.length === 0 ? (
              <TableRow className="border-gray-200 dark:border-gray-800 dark:hover:bg-gray-900">
                <TableCell
                  colSpan={5}
                  className="text-center h-24 text-muted-foreground text-gray-500 dark:text-gray-400"
                >
                  No servers added to this vault.
                </TableCell>
              </TableRow>
            ) : (
              servers.map((server) => {
                const linkedCred = availableCredentials.find(
                  (c) => c.id === server.credential,
                );
                return (
                  <TableRow
                    key={server.id}
                    className="border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                      {server.name}
                    </TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      {server.host}
                    </TableCell>
                    <TableCell className="uppercase text-xs font-bold text-muted-foreground text-gray-500 dark:text-gray-400">
                      {server.connection_method}
                    </TableCell>
                    <TableCell>
                      {linkedCred ? (
                        <div className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                          <Key className="w-3 h-3 text-muted-foreground" />{" "}
                          {linkedCred.name}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs italic text-gray-500 dark:text-gray-500">
                          None
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(server)}
                          className="hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <Edit className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTargetId(server.id)}
                          className="hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <Trash2 className="w-4 h-4 text-red-500 dark:text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <DeleteConfirmationModal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        title="Delete Server"
        description="Are you sure you want to delete this server from the vault?"
      />
    </div>
  );
}
