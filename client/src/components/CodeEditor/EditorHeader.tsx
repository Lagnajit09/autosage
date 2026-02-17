import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import GenieButton from "@/components/GenieButton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface EditorHeaderProps {
  hasUnsavedChanges: boolean;
  isAISidebarOpen: boolean;
  onSave: () => void;
  onToggleAI: () => void;
}

export function EditorHeader({
  hasUnsavedChanges,
  isAISidebarOpen,
  onSave,
  onToggleAI,
}: EditorHeaderProps) {
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
    </div>
  );
}
