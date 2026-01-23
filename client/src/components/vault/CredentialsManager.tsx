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
import { Plus, Trash2, Edit } from "lucide-react";
import { Credential } from "@/utils/types";

export function CredentialsManager({
  vaultId,
  credentials,
  onUpdate,
}: {
  vaultId: number;
  credentials: Credential[];
  onUpdate: (c: Credential[]) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] =
    useState<Credential["credential_type"]>("username_password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sshKey, setSshKey] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  const resetForm = () => {
    setName("");
    setType("username_password");
    setUsername("");
    setPassword("");
    setSshKey("");
    setEditId(null);
    setIsAdding(false);
  };

  const handleSave = () => {
    if (!name) return;

    const newCred: Credential = {
      id: editId || Date.now(),
      vaultId,
      name,
      credential_type: type,
      username: type === "username_password" ? username : undefined,
      password: type === "username_password" ? password : undefined,
      ssh_key: type === "ssh_key" ? sshKey : undefined,
    };

    if (editId) {
      onUpdate(credentials.map((c) => (c.id === editId ? newCred : c)));
    } else {
      onUpdate([...credentials, newCred]);
    }
    resetForm();
  };

  const handleEdit = (cred: Credential) => {
    setIsAdding(true);
    setEditId(cred.id);
    setName(cred.name);
    setType(cred.credential_type);
    setUsername(cred.username || "");
    setPassword(cred.password || "");
    setSshKey(cred.ssh_key || "");
  };

  const handleDelete = (id: number) => {
    onUpdate(credentials.filter((c) => c.id !== id));
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
                  className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Type</Label>
                <Select value={type} onValueChange={(v: any) => setType(v)}>
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
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                {editId ? "Update" : "Save"}
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
                    {cred.credential_type === "username_password"
                      ? cred.username
                      : "SSH Key"}
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
                        onClick={() => handleDelete(cred.id)}
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
    </div>
  );
}
