import { useState, useEffect } from "react";
import { useUser, useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { User, FileText } from "lucide-react";
import { updateUserProfile } from "@/lib/api/user";

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialName: string;
  initialBio: string;
  onSaved: () => void;
}

export const EditProfileModal = ({
  isOpen,
  onClose,
  initialName,
  initialBio,
  onSaved,
}: EditProfileModalProps) => {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setBio(initialBio);
      setError(null);
    }
  }, [isOpen, initialName, initialBio]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsLoading(true);
    setError(null);

    try {
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0] ?? "";
      const lastName = nameParts.slice(1).join(" ");

      const token = await getToken();

      await Promise.all([
        user.update({ firstName, lastName }),
        token
          ? updateUserProfile({ bio: bio.trim() }, token)
          : Promise.resolve(),
      ]);

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[460px] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-white">
            Edit Profile
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Update your display name and bio.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-5 py-4">
            {/* Display Name */}
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">
                Display Name
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:ring-purple-500"
                  placeholder="Your full name"
                />
              </div>
            </div>

            {/* Bio */}
            <div className="grid gap-2">
              <Label htmlFor="bio" className="text-gray-700 dark:text-gray-300">
                Bio{" "}
                <span className="text-xs text-gray-400">
                  ({bio.length}/500)
                </span>
              </Label>
              <div className="relative">
                <FileText className="absolute left-3 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 500))}
                  className="pl-9 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:ring-purple-500 resize-none min-h-[80px]"
                  placeholder="A short bio about yourself"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isLoading ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
