import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Home, MessageCircle, Settings, User, Workflow } from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";

const LeftNav = () => {
  return (
    <div className="flex flex-col w-[4%] h-screen bg-light-primary px-4 py-4 space-y-4 justify-between">
      <div className="w-full flex-col space-y-4">
        <ToolTipIcon
          icon={<Home className="w-10 h-10 text-text-light-primary" />}
          tooltip="Home"
        />
        <ToolTipIcon
          icon={<Workflow className="w-10 h-10 text-text-light-primary" />}
          tooltip="Workflow"
        />
        <ToolTipIcon
          icon={<MessageCircle className="w-10 h-10 text-text-light-primary" />}
          tooltip="AutoBot"
        />
      </div>
      <div className="w-full flex-col space-y-4">
        <ToolTipIcon
          icon={<Settings className="w-10 h-10 text-text-light-primary" />}
          tooltip="Settings"
        />
        <ToolTipIcon
          icon={<User className="w-10 h-10 text-text-light-primary" />}
          tooltip="Account"
        />
      </div>
    </div>
  );
};

export default LeftNav;

const ToolTipIcon = ({
  icon,
  tooltip,
}: {
  icon: React.ReactElement;
  tooltip: string;
}) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" className="bg-gray-400/20 rounded-lg p-2">
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
};
