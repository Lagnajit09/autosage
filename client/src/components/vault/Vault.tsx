import { useState, useEffect, useCallback } from "react";
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
import { Trash2, Server as ServerIcon, Key, Loader2 } from "lucide-react";
import { CredentialsManager } from "./CredentialsManager";
import { ServersManager } from "./ServersManager";
import { DeleteConfirmationModal } from "../DeleteConfirmationModal";
import { Vault as VaultType, Credential, Server } from "@/utils/types";
import { apiRequest } from "@/lib/api-client";
import { toast } from "sonner";
import { useAuth } from "@clerk/clerk-react";

export function Vault({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}) {
  const { getToken, isSignedIn } = useAuth();
  const [vaults, setVaults] = useState<VaultType[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [selectedVaultId, setSelectedVaultId] = useState<string>("");
  const [isCreatingVault, setIsCreatingVault] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newVaultName, setNewVaultName] = useState("");
  const [newVaultDesc, setNewVaultDesc] = useState("");

  const selectedVault = vaults.find((v) => v.id === selectedVaultId);

  const fetchVaults = useCallback(async () => {
    setIsLoading(true);
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
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (isOpen && isSignedIn) {
      fetchVaults();
    }
  }, [isOpen, isSignedIn, fetchVaults]);

  const handleCreateVault = async () => {
    if (!newVaultName.trim()) return;
    try {
      const token = await getToken();
      const response = await apiRequest(
        "/api/vault/vaults/",
        {
          method: "POST",
          body: JSON.stringify({
            name: newVaultName,
            description: newVaultDesc,
          }),
        },
        token,
      );
      if (response.success) {
        setVaults([...vaults, response.data]);
        setSelectedVaultId(response.data.id);
        setIsCreatingVault(false);
        setNewVaultName("");
        setNewVaultDesc("");
        toast.success("Vault created successfully");
      }
    } catch (error) {
      console.error("Failed to create vault:", error);
      toast.error("Failed to create vault");
    }
  };

  const confirmDeleteVault = async () => {
    if (!selectedVault) return;

    setIsDeleting(true);
    try {
      const token = await getToken();
      const response = await apiRequest(
        `/api/vault/vaults/${selectedVault.id}/`,
        {
          method: "DELETE",
        },
        token,
      );
      if (response.success) {
        setVaults(vaults.filter((v) => v.id !== selectedVault.id));
        setSelectedVaultId("");
        setShowDeleteConfirm(false);
        toast.success("Vault deleted successfully");
      }
    } catch (error) {
      console.error("Failed to delete vault:", error);
      toast.error("Failed to delete vault");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (selectedVault) {
      setCredentials(selectedVault.credentials || []);
      setServers(selectedVault.servers || []);
    } else {
      setCredentials([]);
      setServers([]);
    }
  }, [selectedVault]);

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
                  {isLoading ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      <span className="text-sm">Loading vaults...</span>
                    </div>
                  ) : vaults.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500">
                      No vaults found.
                    </div>
                  ) : (
                    vaults.map((vault) => (
                      <SelectItem
                        key={vault.id}
                        value={vault.id}
                        className="hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 cursor-pointer dark:hover:text-gray-100 dark:text-gray-300"
                      >
                        {vault.name}
                      </SelectItem>
                    ))
                  )}
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
                  onClick={() => setShowDeleteConfirm(true)}
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
                    maxLength={25}
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
                    maxLength={500}
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
                  credentials={credentials}
                  onUpdate={(newCreds) => {
                    setCredentials(newCreds);
                    // Also update the vault in the vaults list if needed,
                    // or just rely on local state for the current view.
                    setVaults(
                      vaults.map((v) =>
                        v.id === selectedVault.id
                          ? { ...v, credentials: newCreds }
                          : v,
                      ),
                    );
                  }}
                />
              </TabsContent>

              <TabsContent value="servers" className="mt-4">
                <ServersManager
                  vaultId={selectedVault.id}
                  servers={servers}
                  availableCredentials={credentials}
                  onUpdate={(newServers) => {
                    setServers(newServers);
                    setVaults(
                      vaults.map((v) =>
                        v.id === selectedVault.id
                          ? { ...v, servers: newServers }
                          : v,
                      ),
                    );
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

        <DeleteConfirmationModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={confirmDeleteVault}
          isLoading={isDeleting}
          title="Delete Vault"
          description={`Are you sure you want to delete vault "${selectedVault?.name}"? All credentials and servers stored in this vault will be permanently removed.`}
        />
      </DialogContent>
    </Dialog>
  );
}
