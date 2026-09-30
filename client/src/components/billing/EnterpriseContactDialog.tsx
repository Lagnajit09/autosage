import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitEnterpriseContact } from "@/lib/api/billing";

interface EnterpriseContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Enterprise "Contact Us" form. Shared by the Plans page and the public
 * landing page — the backing endpoint is public, and a signed-in user's token
 * is attached when available.
 */
const EnterpriseContactDialog = ({
  open,
  onOpenChange,
}: EnterpriseContactDialogProps) => {
  const { getToken } = useAuth();

  const [contactType, setContactType] = useState("Solo / Individual");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setContactType("Solo / Individual");
    setName("");
    setEmail("");
    setDescription("");
    setSuccess(false);
    setError(null);
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || !description.trim()) {
      setError("Name, email, and description are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      await submitEnterpriseContact(
        {
          type: contactType,
          name: name.trim(),
          email: email.trim(),
          description: description.trim(),
        },
        token,
      );
      setSuccess(true);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to send. Please try emailing us directly at autosagex@gmail.com.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!loading) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            Contact Us — Enterprise
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Tell us about your needs and our team will reach out to you shortly.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-green-600 dark:text-green-400 font-medium">
              We've received your request!
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Our team will reach out to you shortly.
            </p>
            <Button className="mt-4" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Type</Label>
              <Select value={contactType} onValueChange={setContactType}>
                <SelectTrigger className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100">
                  <SelectItem value="Solo / Individual" className="cursor-pointer">
                    Solo / Individual
                  </SelectItem>
                  <SelectItem value="Organization / Team" className="cursor-pointer">
                    Organization / Team
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Your name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">
                Your email address
              </Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email address"
                className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">
                What are you planning to automate?
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell us about your use case."
                rows={4}
                className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={loading}
                className="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-orange-600 hover:bg-orange-700 text-white min-w-[80px]"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Send"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EnterpriseContactDialog;
