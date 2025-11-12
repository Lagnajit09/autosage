import { AvatarCircles } from "@/components/ui/avatar-circles";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  LogOut,
  Moon,
  Search,
  SubscriptIcon,
  Sun,
} from "lucide-react";
import { useTheme } from "@/provider/theme-provider";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TopNav = () => {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  return (
    <div className="w-full flex items-center justify-between h-[6%] bg-transparent p-4 py-8">
      <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Dashboard
      </div>
      <div className="flex items-center gap-2 p-2">
        <div className="relative w-80">
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
              <Sun className="w-10 h-10 text-light-primary" />
            ) : (
              <Moon className="w-10 h-10 text-text-light-primary/70" />
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
          className="bg-transparent hover:bg-[#a768d0]/20 dark:hover:bg-bg-tertiary/70 rounded-lg p-2 border-none outline-none shadow-none"
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
        <DropdownMenuItem className="cursor-pointer dark:text-gray-300 dark:hover:bg-gray-700">
          <LogOut />
          LogOut
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
