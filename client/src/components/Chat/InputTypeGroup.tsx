import { Search, Atom, Cpu, Check } from "lucide-react";
import React, { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const InputTypeGroup: React.FC = () => {
  const [active, setActive] = useState("research");

  const buttons = [
    {
      id: "research",
      label: "Research",
      icon: Search,
      short: "Ask anything on automation",
      description: "Search the web and docs to get any automation information.",
    },
    {
      id: "generation",
      label: "Generation",
      icon: Atom,
      short: "Automation workflows and scripts",
      description: "Generate workflows and scripts from your prompt.",
    },
    {
      id: "execution",
      label: "Execution",
      icon: Cpu,
      short: "Run workflows with scripts",
      description: "Execute tools, scripts, or workflows to complete tasks.",
    },
  ];

  return (
    <div className="flex items-center bg-[#efe9f3] dark:bg-[#170f2085] rounded-lg shadow-sm border border-[#d9cde0] dark:border-[#27073a52] w-fit">
      {buttons.map(({ id, label, short, description, icon: Icon }) => (
        <Tooltip key={id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setActive(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all
                  ${
                    active === id
                      ? "bg-white dark:bg-[#5e3e732b] text-[#1b267a] shadow-md"
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
          <TooltipContent side="bottom" className="rounded-xl">
            <TooltipContentBox
              label={label}
              short={short}
              description={description}
              status="Enabled"
              tag="Automation Suite"
            />
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
};

export default InputTypeGroup;

const TooltipContentBox = ({
  label,
  short,
  description,
  status,
  tag,
}: {
  label: string;
  short: string;
  description: string;
  status?: string;
  tag?: string;
}) => {
  return (
    <div className="bg-transparent text-white p-3 rounded-lg w-[220px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        {status && (
          <div className="flex items-center gap-1 text-xs text-[#8ef0a0]">
            <Check size={14} strokeWidth={2} /> {status}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 leading-snug">{short}</p>

      <div className="h-px my-2 bg-[#2e2e2e]" />

      <p className="text-[11px] text-gray-300">{description}</p>

      {tag && (
        <div className="mt-2 text-[10px] text-purple-300 uppercase tracking-wide">
          {tag}
        </div>
      )}
    </div>
  );
};
