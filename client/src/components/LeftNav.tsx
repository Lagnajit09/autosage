import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CodeXml,
  Home,
  ListPlus,
  Moon,
  Settings,
  Sun,
  User,
  Workflow,
  Zap,
} from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/theme/theme-context";
import { useNavigate } from "react-router-dom";
import { AutobotIcon } from "./AutobotIcon";
import { cn } from "@/lib/utils";

export const NavItems = ({ mobile = false }: { mobile?: boolean }) => {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const items = [
    {
      icon: <Home className={cn("w-6 h-6", mobile ? "w-5 h-5 mr-2" : "")} />,
      label: "Dashboard",
      onClick: () => navigate("/dashboard"),
    },
    {
      icon: (
        <Workflow className={cn("w-6 h-6", mobile ? "w-5 h-5 mr-2" : "")} />
      ),
      label: "All Workflows",
      onClick: () => navigate("/workflows"),
    },
    {
      icon: (
        <ListPlus className={cn("w-6 h-6", mobile ? "w-5 h-5 mr-2" : "")} />
      ),
      label: "Templates",
      onClick: () => navigate("/templates"),
    },
    {
      icon: <CodeXml className={cn("w-6 h-6", mobile ? "w-5 h-5 mr-2" : "")} />,
      label: "Editor",
      onClick: () => navigate("/script-editor"),
    },
    {
      icon: (
        <AutobotIcon
          size={16}
          className={cn("w-6 h-6", mobile ? "w-5 h-5 mr-2" : "")}
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
            "w-6 h-6 text-light-primary",
            mobile ? "w-5 h-5 mr-2" : "",
          )}
        />
      ) : (
        <Moon className={cn("w-6 h-6", mobile ? "w-5 h-5 mr-2" : "")} />
      ),
      label: isDark ? "Light Mode" : "Dark Mode",
      onClick: toggleTheme,
    },
    {
      icon: (
        <Settings className={cn("w-6 h-6", mobile ? "w-5 h-5 mr-2" : "")} />
      ),
      label: "Settings",
      onClick: () => navigate("/settings"),
    },
    {
      icon: <User className={cn("w-6 h-6", mobile ? "w-5 h-5 mr-2" : "")} />,
      label: "Account",
      onClick: () => navigate("/profile"),
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
    <div className="flex flex-col h-full justify-between w-full">
      <div className="w-full flex flex-col space-y-4 items-center text-gray-800 dark:text-gray-200">
        {items.map((item, index) => (
          <ToolTipIcon
            key={index}
            icon={item.icon}
            tooltip={item.label}
            onClick={item.onClick}
          />
        ))}
      </div>
      <div className="w-full flex flex-col space-y-4 items-center text-gray-800 dark:text-gray-200">
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
    <div className="hidden lg:flex flex-col w-16 shrink-0 h-screen bg-gray-50 dark:bg-bg-card/90 px-2 py-4 space-y-4 justify-between items-center border-r border-gray-200 dark:border-gray-800/50">
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
          className="bg-[#a768d0]/30 hover:bg-[#a768d0]/20 dark:bg-bg-tertiary/50 dark:hover:bg-bg-tertiary/70 dark:hover:text-gray-100 rounded-lg p-0 flex items-center justify-center dark:border-none dark:outline-none w-full aspect-square"
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
