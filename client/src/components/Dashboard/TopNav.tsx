import { AvatarCircles } from "@/components/ui/avatar-circles";
import { Input } from "../ui/input";

const TopNav = () => {
  return (
    <div className="w-full flex items-center justify-between h-[6%] bg-gray-100/60 dark:bg-gray-900/60 border-b border-gray-300 dark:border-gray-950 p-4 py-6 shadow-sm">
      <div className="flex gap-10 items-center text-gray-950 dark:text-gray-100 text-lg font-semibold">
        Dashboard
        <div className=""></div>
      </div>
      <div className="flex items-center gap-2 p-2">
        <AvatarCircles avatarUrls={[]} username="Lagnajit" />
      </div>
    </div>
  );
};

export default TopNav;
