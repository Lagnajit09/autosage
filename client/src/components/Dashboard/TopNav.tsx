import { useState } from "react";
import { AvatarCircles } from "@/components/ui/avatar-circles";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { CreditCard, LogOut, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "@/provider/theme-provider";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { SignOutButton } from "@clerk/clerk-react";

const TopNav = () => {
  const { isDark, toggleTheme } = useTheme();
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  if (showMobileSearch) {
    return (
      <div className="w-full flex items-center justify-between h-16 md:h-[6%] bg-transparent p-4 md:py-8 gap-2">
        <div className="flex-1 flex items-center gap-2">
          <Search className="w-5 h-5 text-gray-500" />
          <Input
            autoFocus
            type="text"
            placeholder="Search workflows..."
            className="flex-1 bg-gray-100 dark:bg-gray-800 border-border dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-700 dark:placeholder:text-gray-300"
            onBlur={() => setShowMobileSearch(false)}
          />
        </div>
        <Button variant="ghost" onClick={() => setShowMobileSearch(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full flex items-center justify-between h-16 md:h-[6%] bg-transparent p-4 md:py-8 gap-2">
      <div className="flex items-center gap-2 md:gap-4">
        <SidebarTrigger className="md:hidden" />
        <div className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
          Dashboard
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* Mobile Search Icon */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-gray-700 dark:text-gray-300"
          onClick={() => setShowMobileSearch(true)}
        >
          <Search className="w-5 h-5" />
        </Button>

        {/* Desktop Search Input */}
        <div className="relative hidden md:block w-64 lg:w-80">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-700 dark:text-gray-300 w-5 h-5" />
          <Input
            type="text"
            placeholder="Search workflows..."
            className="pl-10 bg-gray-100 dark:bg-gray-800 border-border dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-700 dark:placeholder:text-gray-300"
          />
        </div>

        <ToolTipIcon
          icon={
            isDark ? (
              <Sun className="w-5 h-5 md:w-6 md:h-6 text-light-primary" />
            ) : (
              <Moon className="w-5 h-5 md:w-6 md:h-6 text-text-light-primary/70" />
            )
          }
          tooltip={isDark ? "Light Mode" : "Dark Mode"}
          onClick={toggleTheme}
        />
        <UserMenu />
      </div>
    </div>
  );
};

export default TopNav;

const ToolTipIcon = ({
  icon,
  tooltip,
  onClick,
}: {
  icon: React.ReactElement;
  tooltip: string;
  onClick?: () => void;
}) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          className="bg-transparent hover:bg-[#a768d0]/20 dark:hover:bg-bg-tertiary/70 rounded-lg p-2 h-9 w-9 md:h-10 md:w-10 border-none outline-none shadow-none"
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
};

const UserMenu = () => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <AvatarCircles avatarUrls={[]} username="Lagnajit" onClick={() => {}} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="dark:bg-gray-800 dark:border-gray-900">
        <DropdownMenuLabel>
          <p className="dark:text-gray-200">Lagnajit Moharana</p>
          <span className="font-normal text-gray-600 dark:text-gray-400 text-xs">
            moharanalagnajit@gmail.com
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer dark:text-gray-300 dark:hover:bg-gray-700">
          <CreditCard />
          Subscription
        </DropdownMenuItem>
        <SignOutButton>
          <DropdownMenuItem className="cursor-pointer dark:text-gray-300 dark:hover:bg-gray-700">
            <LogOut />
            LogOut
          </DropdownMenuItem>
        </SignOutButton>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
