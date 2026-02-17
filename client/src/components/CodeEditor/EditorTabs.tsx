import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScriptFile } from "@/utils/types";
import { ReactNode } from "react";

interface EditorTabsProps {
  openTabs: ScriptFile[];
  currentFile: ScriptFile | null;
  getFileIcon: (filename: string) => ReactNode;
  onSelectTab: (tab: ScriptFile) => void;
  onCloseTab: (fileId: string, event: React.MouseEvent) => void;
}

export function EditorTabs({
  openTabs,
  currentFile,
  getFileIcon,
  onSelectTab,
  onCloseTab,
}: EditorTabsProps) {
  if (openTabs.length === 0) return null;

  return (
    <div className="flex items-center bg-gray-50 dark:bg-black/10 border-b border-gray-200 dark:border-gray-800 overflow-x-auto no-scrollbar">
      {openTabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelectTab(tab)}
          className={cn(
            "flex items-center space-x-2 px-4 py-2.5 border-r border-gray-200 dark:border-gray-800 transition-colors min-w-[120px] max-w-[200px] group relative",
            currentFile?.id === tab.id
              ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white border-t-2 border-t-purple-500"
              : "bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800",
          )}
        >
          {getFileIcon(tab.name)}
          <span className="text-xs font-medium truncate flex-1 text-left">
            {tab.name}
          </span>
          <div
            onClick={(e) => onCloseTab(tab.id, e)}
            className="opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded p-0.5 transition-opacity"
          >
            <X size={14} />
          </div>
        </button>
      ))}
    </div>
  );
}
