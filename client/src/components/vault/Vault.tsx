import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Server as ServerIcon, Key } from "lucide-react";
import { CredentialsManager } from "./CredentialsManager";
import { ServersManager } from "./ServersManager";
import { Vault as VaultType, Credential, Server } from "@/utils/types";

// --- Mock Data ---

const INITIAL_VAULTS: VaultType[] = [
  {
    id: 1,
    name: "Production Vault",
    description: "Credentials for prod servers",
  },
  { id: 2, name: "Dev Vault", description: "Development environment keys" },
];

const INITIAL_CREDENTIALS: Credential[] = [
  {
    id: 1,
    vaultId: 1,
    name: "Prod DB Admin",
    credential_type: "username_password",
    username: "admin",
    password: "password123",
  },
  {
    id: 2,
    vaultId: 2,
    name: "Dev SSH Key",
    credential_type: "ssh_key",
    ssh_key: "-----BEGIN OPENSSH PRIVATE KEY-----...",
  },
];

const INITIAL_SERVERS: Server[] = [
  {
    id: 1,
    vaultId: 1,
    name: "Prod Web 01",
    host: "192.168.1.10",
    connection_method: "ssh",
    credentialId: 1,
  },
  {
    id: 2,
    vaultId: 2,
    name: "Dev WinRM",
    host: "10.0.0.50",
    connection_method: "winrm",
    port: 5985,
  },
];

export function Vault({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}) {
  const [vaults, setVaults] = useState<VaultType[]>(INITIAL_VAULTS);
  const [credentials, setCredentials] =
    useState<Credential[]>(INITIAL_CREDENTIALS);
  const [servers, setServers] = useState<Server[]>(INITIAL_SERVERS);

  const [selectedVaultId, setSelectedVaultId] = useState<string>("");
  const [isCreatingVault, setIsCreatingVault] = useState(false);
  const [newVaultName, setNewVaultName] = useState("");
  const [newVaultDesc, setNewVaultDesc] = useState("");

  const selectedVault = vaults.find((v) => v.id.toString() === selectedVaultId);
  const currentCredentials = credentials.filter(
    (c) => c.vaultId.toString() === selectedVaultId,
  );
  const currentServers = servers.filter(
    (s) => s.vaultId.toString() === selectedVaultId,
  );

  const handleCreateVault = () => {
    if (!newVaultName.trim()) return;
    const newVault: VaultType = {
      id: Date.now(),
      name: newVaultName,
      description: newVaultDesc,
    };
    setVaults([...vaults, newVault]);
    setSelectedVaultId(newVault.id.toString());
    setIsCreatingVault(false);
    setNewVaultName("");
    setNewVaultDesc("");
  };

  const handleDeleteVault = () => {
    if (!selectedVault) return;
    setVaults(vaults.filter((v) => v.id !== selectedVault.id));
    setCredentials(credentials.filter((c) => c.vaultId !== selectedVault.id));
    setServers(servers.filter((s) => s.vaultId !== selectedVault.id));
    setSelectedVaultId("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">
            Secure Vault
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Manage your credentials and servers securely.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-4">
          {/* Vault Selection / Creation Header */}
          <div className="flex items-end gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
            <div className="w-1/2 space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">
                Select Vault
              </Label>
              <Select
                value={selectedVaultId}
                onValueChange={setSelectedVaultId}
              >
                <SelectTrigger className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                  <SelectValue placeholder="Choose a vault..." />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100">
                  {vaults.map((vault) => (
                    <SelectItem
                      key={vault.id}
                      value={vault.id.toString()}
                      className="hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 cursor-pointer dark:hover:text-gray-100 dark:text-gray-300"
                    >
                      {vault.name}
                    </SelectItem>
                  ))}
                  <div className="p-2 border-t border-gray-200 dark:border-gray-800 mt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={(e) => {
                        e.preventDefault();
                        setIsCreatingVault(true);
                      }}
                    >
                      + Create New Vault
                    </Button>
                  </div>
                </SelectContent>
              </Select>
            </div>
            {selectedVault && (
              <div className="flex-1 flex justify-end">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteVault}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete Vault
                </Button>
              </div>
            )}
          </div>

          {isCreatingVault && (
            <Card className="bg-muted/50 dark:bg-gray-800/50 border-dashed border-gray-300 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-sm text-gray-900 dark:text-gray-100">
                  Create New Vault
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">
                    Name
                  </Label>
                  <Input
                    value={newVaultName}
                    onChange={(e) => setNewVaultName(e.target.value)}
                    placeholder="e.g. Production Keys"
                    className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">
                    Description
                  </Label>
                  <Input
                    value={newVaultDesc}
                    onChange={(e) => setNewVaultDesc(e.target.value)}
                    placeholder="Optional description"
                    className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCreatingVault(false)}
                    className="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateVault}
                    className="bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    Create Vault
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedVault ? (
            <Tabs defaultValue="credentials" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-800">
                <TabsTrigger
                  value="credentials"
                  className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-gray-900 dark:data-[state=active]:text-gray-100"
                >
                  <Key className="w-4 h-4" /> Credentials
                </TabsTrigger>
                <TabsTrigger
                  value="servers"
                  className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-gray-900 dark:data-[state=active]:text-gray-100"
                >
                  <ServerIcon className="w-4 h-4" /> Servers
                </TabsTrigger>
              </TabsList>

              <TabsContent value="credentials" className="mt-4">
                <CredentialsManager
                  vaultId={selectedVault.id}
                  credentials={currentCredentials}
                  onUpdate={(newCreds) => {
                    // Merge update into main state
                    const otherCreds = credentials.filter(
                      (c) => c.vaultId !== selectedVault.id,
                    );
                    setCredentials([...otherCreds, ...newCreds]);
                  }}
                />
              </TabsContent>

              <TabsContent value="servers" className="mt-4">
                <ServersManager
                  vaultId={selectedVault.id}
                  servers={currentServers}
                  availableCredentials={currentCredentials}
                  onUpdate={(newServers) => {
                    const otherServers = servers.filter(
                      (s) => s.vaultId !== selectedVault.id,
                    );
                    setServers([...otherServers, ...newServers]);
                  }}
                />
              </TabsContent>
            </Tabs>
          ) : (
            !isCreatingVault && (
              <div className="text-center py-12 text-muted-foreground w-full border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                <p className="text-gray-500 dark:text-gray-400">
                  Please select or create a vault to begin.
                </p>
              </div>
            )
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 dark:bg-gray-900"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
