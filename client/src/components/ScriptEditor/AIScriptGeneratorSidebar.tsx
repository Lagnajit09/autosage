import React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import AIScriptGenerator from "@/components/AIScriptGenerator";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface AIScriptGeneratorSidebarProps {
  scriptType: string;
  onGeneratedScript: (script: string, filename: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const AIScriptGeneratorSidebar: React.FC<
  AIScriptGeneratorSidebarProps
> = ({ scriptType, onGeneratedScript, isOpen, onToggle }) => {
  // We'll use a controlled sidebar approach or just a right-side sidebar
  // The Sidebar component supports 'side="right"'

  if (!isOpen) return null;

  return (
    <div className="w-80 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 h-full flex flex-col transition-all duration-300">
      <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
        <span className="font-semibold text-sm dark:text-gray-100">
          Autobot
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-8 w-8"
        >
          <X className="h-4 w-4 dark:text-gray-100" />
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        <AIScriptGenerator
          scriptType={scriptType}
          onGeneratedScript={onGeneratedScript}
        />
      </div>
    </div>
  );
};
