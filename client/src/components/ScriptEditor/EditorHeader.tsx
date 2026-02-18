import { Airplay, DatabaseZap, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import GenieButton from "@/components/GenieButton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import { Vault } from "../vault/Vault";

interface EditorHeaderProps {
  hasUnsavedChanges: boolean;
  isAISidebarOpen: boolean;
  onSave: () => void;
  onToggleAI: () => void;
  onToggleTerminal: () => void;
}

export function EditorHeader({
  hasUnsavedChanges,
  isAISidebarOpen,
  onSave,
  onToggleAI,
  onToggleTerminal,
}: EditorHeaderProps) {
  const [showVault, setShowVault] = useState(false);

  return (
    <div className="bg-gray-50 dark:bg-black/10 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="md:hidden" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
            Script Editor
          </h1>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowVault(!showVault)}
            className="flex items-center space-x-1 border-2 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/30"
          >
            <DatabaseZap size={16} />
            <span className="hidden sm:inline">Vault</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleTerminal}
            className="flex items-center space-x-1 border-2 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/30"
          >
            <Airplay size={16} />
            <span className="hidden sm:inline">Terminal</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSave}
            disabled={!hasUnsavedChanges}
            className={cn(
              "flex items-center space-x-1 border-2 border-gray-200 dark:border-gray-800",
              hasUnsavedChanges
                ? "text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-gray-700/10 dark:hover:bg-gray-500/20"
                : "text-gray-700 dark:text-gray-300",
            )}
          >
            <Save size={16} />
            <span className="hidden sm:inline">Save</span>
          </Button>
          <GenieButton onClick={onToggleAI} />
        </div>
      </div>
      <Vault isOpen={showVault} setIsOpen={setShowVault} />
    </div>
  );
}
