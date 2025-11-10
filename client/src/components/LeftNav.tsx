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

const LeftNav = () => {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  return (
    <div className="flex flex-col w-[4%] h-screen bg-light-tertiary dark:bg-bg-card/90 px-4 py-4 space-y-4 justify-between">
      <div className="w-full flex-col space-y-4 items-center">
        <ToolTipIcon
          icon={
            <Home className="w-10 h-10 text-text-light-primary/70 dark:text-light-secondary" />
          }
          tooltip="Dashboard"
          onClick={() => navigate("/dashboard")}
        />
        <ToolTipIcon
          icon={
            <Workflow className="w-10 h-10 text-text-light-primary/70 dark:text-light-secondary" />
          }
          tooltip="All Workflows"
          onClick={() => navigate("/workflows")}
        />
        <ToolTipIcon
          icon={
            <ListPlus className="w-10 h-10 text-text-light-primary/70 dark:text-light-secondary" />
          }
          tooltip="Templates"
          onClick={() => navigate("/templates")}
        />
        <ToolTipIcon
          icon={
            isDark ? (
              <img
                src="/autobot-dark.svg"
                alt="autobot"
                className="w-10 h-10 mx-2"
              />
            ) : (
              <img
                src="/autobot-light.svg"
                alt="autobot"
                className="w-10 h-10 mx-2"
              />
            )
          }
          tooltip="AutoBot"
          onClick={() => navigate("/ai/autobot")}
        />
      </div>
      <div className="w-full flex-col space-y-4">
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
        <ToolTipIcon
          icon={
            <Settings className="w-10 h-10 text-text-light-primary/70 dark:text-light-secondary" />
          }
          tooltip="Settings"
          onClick={() => navigate("/settings")}
        />
        <ToolTipIcon
          icon={
            <User className="w-10 h-10 text-text-light-primary/70 dark:text-light-secondary" />
          }
          tooltip="Account"
          onClick={() => navigate("/account")}
        />
      </div>
    </div>
  );
};

export default LeftNav;

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
          className="bg-[#a768d0]/30 hover:bg-[#a768d0]/20 dark:bg-bg-tertiary/50 dark:hover:bg-bg-tertiary/70 rounded-lg p-2 dark:border-none dark:outline-none"
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
