import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Key, Loader2, Eye, ShieldCheck } from "lucide-react";
import { Credential } from "@/utils/types";
import { apiRequest } from "@/lib/api-client";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";

interface CredentialRevealModalProps {
  isOpen: boolean;
  onClose: () => void;
  credentialId: string | null;
}

export function CredentialRevealModal({
  isOpen,
  onClose,
  credentialId,
}: CredentialRevealModalProps) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && credentialId) {
      revealCredential();
    } else {
      setData(null);
    }
  }, [isOpen, credentialId]);

  const revealCredential = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const response = await apiRequest(
        `/api/vault/credentials/${credentialId}/reveal/`,
        {},
        token,
      );
      if (response.status) {
        setData(response.data);
      }
    } catch (error) {
      console.error("Failed to reveal credential:", error);
      toast.error("Failed to reveal sensitive information");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(`${field} copied to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100">
        <DialogHeader>
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
            <ShieldCheck className="w-5 h-5" />
            <DialogTitle>Sensitive Information</DialogTitle>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm text-gray-500">Decrypting secrets...</p>
          </div>
        ) : data ? (
          <div className="space-y-6 pt-2">
            {data.username && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Username
                </Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={data.username}
                    className="bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800 font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(data.username, "Username")}
                    className="flex-shrink-0 border-gray-200 dark:border-gray-800"
                  >
                    {copiedField === "Username" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-900" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {data.password && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Password
                </Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    type="password"
                    value={data.password}
                    className="bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800 font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(data.password, "Password")}
                    className="flex-shrink-0 border-gray-200 dark:border-gray-800"
                  >
                    {copiedField === "Password" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-900" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {data.ssh_key && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Private Key
                </Label>
                <div className="relative group">
                  <Textarea
                    readOnly
                    value={data.ssh_key}
                    rows={8}
                    className="bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800 font-mono text-xs resize-none pr-10"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(data.ssh_key, "SSH Key")}
                    className="absolute top-2 right-2 border-gray-200 dark:border-gray-800 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {copiedField === "SSH Key" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-900" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-900/50">
              <p className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
                Remember to close this view as soon as you are done. Sensitive
                information should never be shared or left visible.
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={onClose} className="w-full sm:w-auto">
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
