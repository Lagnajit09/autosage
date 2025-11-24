import React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { AutobotIcon } from "./AutobotIcon";

type GenieBtnProps = {
  onClick: () => void;
};

const GenieButton = ({ onClick }: GenieBtnProps) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-purple-600 to-blue-600 dark:from-purple-600 dark:to-blue-600 hover:from-purple-700 hover:to-blue-700 dark:hover:from-purple-700 dark:hover:to-blue-700 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group z-50"
        >
          <AutobotIcon size={30} dark={true} />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Ask Autobot</p>
      </TooltipContent>
    </Tooltip>
  );
};

export default GenieButton;
