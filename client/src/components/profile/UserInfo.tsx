import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { User, Mail, Calendar, Edit } from "lucide-react";
import { EditProfileModal } from "./EditProfileModal";

interface UserInfoProps {
  user: {
    name: string;
    email: string;
    joinDate: string;
    avatar: string;
  };
}

export const UserInfo = ({ user: initialUser }: UserInfoProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [user, setUser] = useState(initialUser);

  const handleSave = (updatedData: { name: string; email: string }) => {
    setUser({ ...user, ...updatedData });
    // In a real app, you would also trigger an API call here
  };

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
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-3xl font-bold border-4 border-purple-200 dark:border-purple-800">
                {user.avatar}
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {user.name}
                </h3>
                <div className="flex items-center text-gray-500 dark:text-gray-400">
                  <Mail className="w-4 h-4 mr-2" />
                  <span className="break-all">{user.email}</span>
                </div>
                <div className="flex items-center text-gray-500 dark:text-gray-400">
                  <Calendar className="w-4 h-4 mr-2" />
                  <span>Joined {user.joinDate}</span>
                </div>
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
        </CardContent>
      </Card>

      <EditProfileModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        user={user}
        onSave={handleSave}
      />
    </section>
  );
};
