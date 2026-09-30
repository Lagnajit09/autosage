/**
 * Bespoke header for the Autobot Dashboard / Archived pages — branded
 * title, no search bar, plus Chat / Customize / Vault actions.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/contexts/theme/theme-context";
import { DatabaseZap, MessageSquare, Moon, Settings2, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Vault } from "../vault/Vault";
import CustomizeModal from "./Chat/CustomizeModal";
import UserMenu from "@/components/UserMenu";

interface AutobotDashboardHeaderProps {
  /** Fires when an LLM config is added/edited/deleted via Customize. */
  onConfigsChanged?: () => void;
}

export const AutobotDashboardHeader = ({
  onConfigsChanged,
}: AutobotDashboardHeaderProps) => {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const [showVault, setShowVault] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);

  return (
    <div className="w-full flex items-center justify-between h-16 md:h-[6%] bg-transparent p-4 md:py-8 gap-2">
      <div className="flex items-center gap-2 md:gap-4 min-w-0">
        <SidebarTrigger className="md:hidden" />
        <div className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
          Autobot Dashboard
        </div>
      </div>

      <div className="flex items-center gap-1">
        <ToolTipIcon
          icon={
            <MessageSquare className="w-5 h-5 md:w-6 md:h-6 text-gray-900 dark:text-gray-100" />
          }
          tooltip="Open Autobot Chat"
          onClick={() => navigate("/ai/autobot")}
        />
        <ToolTipIcon
          icon={
            <Settings2 className="w-5 h-5 md:w-6 md:h-6 text-gray-900 dark:text-gray-100" />
          }
          tooltip="Customize"
          onClick={() => setShowCustomize(true)}
        />
        <ToolTipIcon
          icon={
            <DatabaseZap className="w-5 h-5 md:w-6 md:h-6 text-gray-900 dark:text-gray-100" />
          }
          tooltip="Vault"
          onClick={() => setShowVault(true)}
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
      <CustomizeModal
        open={showCustomize}
        onOpenChange={setShowCustomize}
        onConfigsChanged={onConfigsChanged}
      />
    </div>
  );
};

const ToolTipIcon = ({
  icon,
  tooltip,
  onClick,
}: {
  icon: React.ReactElement;
  tooltip: string;
  onClick?: () => void;
}) => (
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

export default AutobotDashboardHeader;
