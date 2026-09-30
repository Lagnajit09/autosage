import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { DatabaseZap, HelpCircle, Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/theme/theme-context";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Vault } from "../vault/Vault";
import { useNavigate } from "react-router";
import UserMenu from "@/components/UserMenu";

const TopNav = () => {
  const { isDark, toggleTheme } = useTheme();
  const [showVault, setShowVault] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="w-full flex items-center justify-between h-16 md:h-[6%] bg-transparent p-4 md:py-8 gap-2">
      <div className="flex items-center gap-2 md:gap-4">
        <SidebarTrigger className="md:hidden" />
        <div className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
          Dashboard
        </div>
      </div>
      <div className="flex items-center">
        <ToolTipIcon
          icon={<HelpCircle className="w-5 h-5 md:w-6 md:h-6 text-gray-900 dark:text-gray-100" />}
          tooltip="Help & Support"
          onClick={() => navigate("/faq")}
        />

        <ToolTipIcon
          icon={
            <DatabaseZap className="w-5 h-5 md:w-6 md:h-6 text-gray-900 dark:text-gray-100" />
          }
          tooltip={"Vault"}
          onClick={() => {
            setShowVault(true);
          }}
        />
        <ToolTipIcon
          icon={
            isDark ? (
              <Sun className="w-5 h-5 md:w-6 md:h-6 dark:text-gray-100" />
            ) : (
              <Moon className="w-5 h-5 md:w-6 md:h-6 text-gray-900" />
            )
          }
          tooltip={isDark ? "Light Mode" : "Dark Mode"}
          onClick={toggleTheme}
        />
        <UserMenu />
      </div>

      <Vault isOpen={showVault} setIsOpen={setShowVault} />
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
