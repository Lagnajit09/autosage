import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Home,
  ListPlus,
  Moon,
  Settings,
  Sun,
  User,
  Workflow,
} from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/provider/theme-provider";
import { useNavigate } from "react-router-dom";
import { AutobotIcon } from "./AutobotIcon";
import { cn } from "@/lib/utils";

export const NavItems = ({ mobile = false }: { mobile?: boolean }) => {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const items = [
    {
      icon: <Home className={cn("w-10 h-10", mobile ? "w-5 h-5 mr-2" : "")} />,
      label: "Dashboard",
      onClick: () => navigate("/dashboard"),
    },
    {
      icon: (
        <Workflow className={cn("w-10 h-10", mobile ? "w-5 h-5 mr-2" : "")} />
      ),
      label: "All Workflows",
      onClick: () => navigate("/workflows"),
    },
    {
      icon: (
        <ListPlus className={cn("w-10 h-10", mobile ? "w-5 h-5 mr-2" : "")} />
      ),
      label: "Templates",
      onClick: () => navigate("/templates"),
    },
    {
      icon: (
        <AutobotIcon
          size={mobile ? 18 : 18}
          className={cn("w-10 h-10", mobile ? "w-5 h-5 mr-2" : "")}
        />
      ),
      label: "AutoBot",
      onClick: () => navigate("/ai/autobot"),
    },
  ];

  const bottomItems = [
    {
      icon: isDark ? (
        <Sun
          className={cn(
            "w-10 h-10 text-light-primary",
            mobile ? "w-5 h-5 mr-2" : ""
          )}
        />
      ) : (
        <Moon className={cn("w-10 h-10", mobile ? "w-5 h-5 mr-2" : "")} />
      ),
      label: isDark ? "Light Mode" : "Dark Mode",
      onClick: toggleTheme,
    },
    {
      icon: (
        <Settings className={cn("w-10 h-10", mobile ? "w-5 h-5 mr-2" : "")} />
      ),
      label: "Settings",
      onClick: () => navigate("/settings"),
    },
    {
      icon: <User className={cn("w-10 h-10", mobile ? "w-5 h-5 mr-2" : "")} />,
      label: "Account",
      onClick: () => navigate("/account"),
    },
  ];

  if (mobile) {
    return (
      <div className="flex flex-col space-y-4 mt-4">
        <div className="flex flex-col space-y-2">
          {items.map((item, index) => (
            <Button
              key={index}
              variant="ghost"
              className="justify-start w-full text-gray-800 dark:text-gray-200 hover:text-gray-600 dark:hover:text-gray-400"
              onClick={item.onClick}
            >
              {item.icon}
              {item.label}
            </Button>
          ))}
        </div>
        <div className="border-t pt-4 flex flex-col space-y-2">
          {bottomItems.map((item, index) => (
            <Button
              key={index}
              variant="ghost"
              className="justify-start w-full text-gray-800 dark:text-gray-200 hover:text-gray-600 dark:hover:text-gray-400"
              onClick={item.onClick}
            >
              {item.icon}
              {item.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full justify-between">
      <div className="w-full flex-col space-y-4 items-center text-gray-800 dark:text-gray-200">
        {items.map((item, index) => (
          <ToolTipIcon
            key={index}
            icon={item.icon}
            tooltip={item.label}
            onClick={item.onClick}
          />
        ))}
      </div>
      <div className="w-full flex-col space-y-4 text-gray-800 dark:text-gray-200">
        {bottomItems.map((item, index) => (
          <ToolTipIcon
            key={index}
            icon={item.icon}
            tooltip={item.label}
            onClick={item.onClick}
          />
        ))}
      </div>
    </div>
  );
};

const LeftNav = () => {
  return (
    <div className="hidden md:flex flex-col w-[4%] h-screen bg-light-tertiary dark:bg-bg-card/90 px-4 py-4 space-y-4 justify-between">
      <NavItems />
    </div>
  );
};

export default LeftNav;

const ToolTipIcon = ({
  icon,
  tooltip,
  onClick,
}: {
  icon: React.ReactNode;
  tooltip: string;
  onClick?: () => void;
}) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          className="bg-[#a768d0]/30 hover:bg-[#a768d0]/20 dark:bg-bg-tertiary/50 dark:hover:bg-bg-tertiary/70 rounded-lg p-2 dark:border-none dark:outline-none w-full"
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
};
