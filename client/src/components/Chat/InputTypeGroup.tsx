import { Search, Atom, Cpu } from "lucide-react";
import React, { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const InputTypeGroup: React.FC = () => {
  const [active, setActive] = useState("research");

  const buttons = [
    { id: "research", label: "Research", icon: Search },
    { id: "generation", label: "Generation", icon: Atom },
    { id: "execution", label: "Execution", icon: Cpu },
  ];

  return (
    <TooltipProvider>
      <div className="flex items-center bg-[#efe9f3] rounded-lg shadow-sm border border-[#d9cde0] w-fit">
        {buttons.map(({ id, label, icon: Icon }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setActive(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all
                  ${
                    active === id
                      ? "bg-white text-[#1b267a] shadow-md"
                      : "text-[#8d70b4] hover:text-[#83269d]"
                  }`}
              >
                <Icon
                  size={18}
                  strokeWidth={2}
                  className={active === id ? "text-[#9128b1]" : ""}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{label}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
};

export default InputTypeGroup;
