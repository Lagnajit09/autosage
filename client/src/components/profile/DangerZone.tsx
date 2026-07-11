import { useState } from "react";
import { useUser, useAuth, useClerk } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, UserX, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/api-client";

export const DangerZone = () => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeactivate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (token) {
        await apiRequest("/api/users/deactivate/", { method: "POST" }, token);
      }
      await signOut();
      navigate("/sign-in");
    } catch {
      setError("Failed to deactivate account. Please try again.");
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!user || deleteConfirm !== "DELETE") return;
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (token) {
        await apiRequest("/api/users/delete/", { method: "POST" }, token);
      }
      await user.delete();
      navigate("/sign-in");
    } catch {
      setError("Failed to delete account. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <>
      <section className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Danger Zone
          </h2>
        </div>
        <Card className="bg-white dark:bg-gray-900/50 border-red-200 dark:border-red-900/60 shadow-sm">
          <CardContent className="p-6 space-y-4">
            {/* Deactivate */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Deactivate Account
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Disables your account. You'll be signed out and all API access will stop. An admin can reactivate it.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeactivateOpen(true)}
                className="shrink-0 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              >
                <UserX className="w-4 h-4 mr-1.5" />
                Deactivate
              </Button>
            </div>

            {/* Delete */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Delete Account
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Permanently deletes your account and all associated data — workflows, scripts, executions, and settings. This cannot be undone.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                className="shrink-0 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Deactivate confirmation */}
      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent className="sm:max-w-[420px] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white flex items-center gap-2">
              <UserX className="w-5 h-5 text-orange-500" />
              Deactivate Account
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              You will be signed out immediately. All API access will be blocked until an admin reactivates your account.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="text-sm text-red-500 dark:text-red-400 px-1">{error}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDeactivateOpen(false); setError(null); }}
              className="dark:border-gray-700 dark:text-gray-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeactivate}
              disabled={isLoading}
              className="bg-orange-600 hover:bg-orange-700 text-white border-none"
            >
              {isLoading ? "Deactivating..." : "Yes, deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) { setDeleteConfirm(""); setError(null); } }}>
        <DialogContent className="sm:max-w-[440px] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              Delete Account
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              This will permanently delete your account and all associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="delete-confirm" className="text-sm text-gray-700 dark:text-gray-300">
              Type <span className="font-mono font-semibold text-red-600 dark:text-red-400">DELETE</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="mt-2 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono"
            />
            {error && (
              <p className="text-sm text-red-500 dark:text-red-400 mt-2">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDeleteOpen(false); setDeleteConfirm(""); setError(null); }}
              className="dark:border-gray-700 dark:text-gray-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isLoading || deleteConfirm !== "DELETE"}
              className="bg-red-600 hover:bg-red-700 text-white border-none disabled:opacity-50"
            >
              {isLoading ? "Deleting..." : "Delete forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
