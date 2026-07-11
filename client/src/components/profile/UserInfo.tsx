import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { User, Mail, Calendar, Edit } from "lucide-react";
import { EditProfileModal } from "./EditProfileModal";

interface UserInfoProps {
  name: string;
  email: string;
  avatarUrl: string | null;
  joinDate: string;
  bio: string;
  isLoading?: boolean;
  onProfileUpdated?: () => void;
}

export const UserInfo = ({
  name,
  email,
  avatarUrl,
  joinDate,
  bio,
  isLoading = false,
  onProfileUpdated,
}: UserInfoProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <User className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          User Information
        </h2>
      </div>
      <Card className="bg-white dark:bg-gradient-to-br dark:from-gray-900/95 dark:to-gray-950 border-gray-200 dark:border-gray-800 shadow-sm">
        <CardContent className="p-6">
          {isLoading ? (
            <div className="flex items-center gap-4 animate-pulse">
              <div className="h-20 w-20 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
              <div className="space-y-3 flex-1">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={name}
                    className="h-20 w-20 rounded-full object-cover border-4 border-purple-200 dark:border-purple-800"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-3xl font-bold border-4 border-purple-200 dark:border-purple-800">
                    {initials || <User className="w-8 h-8" />}
                  </div>
                )}
                <div className="space-y-1.5">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {name || "—"}
                  </h3>
                  <div className="flex items-center text-gray-500 dark:text-gray-400">
                    <Mail className="w-4 h-4 mr-2 shrink-0" />
                    <span className="break-all">{email}</span>
                  </div>
                  {joinDate && (
                    <div className="flex items-center text-gray-500 dark:text-gray-400">
                      <Calendar className="w-4 h-4 mr-2 shrink-0" />
                      <span>Joined {joinDate}</span>
                    </div>
                  )}
                  {bio && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 max-w-md">
                      {bio}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setIsModalOpen(true)}
                className="shrink-0 dark:bg-gray-950 dark:border-gray-800 dark:hover:bg-gray-900 dark:text-gray-200"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Profile
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <EditProfileModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialName={name}
        initialBio={bio}
        onSaved={() => {
          setIsModalOpen(false);
          onProfileUpdated?.();
        }}
      />
    </section>
  );
};
