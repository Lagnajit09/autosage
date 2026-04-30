import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { toast } from "sonner";

interface HttpTriggerSecretModalProps {
  isOpen: boolean;
  onClose: () => void;
  secret: string;
  triggerUrl: string;
  rotated?: boolean;
}

export function HttpTriggerSecretModal({
  isOpen,
  onClose,
  secret,
  triggerUrl,
  rotated = false,
}: HttpTriggerSecretModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleClose = () => {
    setAcknowledged(false);
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && acknowledged) handleClose();
      }}
    >
      <DialogContent
        className="sm:max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100"
        onInteractOutside={(e) => {
          if (!acknowledged) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!acknowledged) e.preventDefault();
        }}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
            <AlertTriangle className="w-5 h-5" />
            <DialogTitle>
              {rotated ? "New Trigger Secret" : "Trigger URL & Secret"}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-900/50">
            <p className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed font-medium">
              This secret is shown <strong>only once</strong>. Copy and store it
              securely — if lost, you'll need to regenerate, and the previous
              secret will stop working.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Trigger URL
            </Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={triggerUrl}
                className="bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800 font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy(triggerUrl, "Trigger URL")}
                className="flex-shrink-0 border-gray-200 dark:border-gray-800"
              >
                {copiedField === "Trigger URL" ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-900 dark:text-gray-100" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Secret (X-Trigger-Secret header)
            </Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={secret}
                className="bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800 font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy(secret, "Secret")}
                className="flex-shrink-0 border-gray-200 dark:border-gray-800"
              >
                {copiedField === "Secret" ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-900 dark:text-gray-100" />
                )}
              </Button>
            </div>
          </div>

          <Label
            htmlFor="ack"
            className="hover:bg-gray-100 dark:hover:bg-gray-800 flex items-start gap-3 rounded-lg border border-gray-300 dark:border-gray-700 p-3 cursor-pointer"
          >
            <Checkbox
              id="ack"
              checked={acknowledged}
              onCheckedChange={(c) => setAcknowledged(Boolean(c))}
              className="data-[state=checked]:border-amber-600 data-[state=checked]:bg-amber-600 data-[state=checked]:text-white"
            />
            <div className="grid gap-1.5 font-normal">
              <p className="text-sm leading-none font-medium text-gray-900 dark:text-gray-100">
                I have copied and saved my secret securely.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                You can't view this secret again after closing.
              </p>
            </div>
          </Label>

          <div className="flex justify-end">
            <Button
              onClick={handleClose}
              disabled={!acknowledged}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
