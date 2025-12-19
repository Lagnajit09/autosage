import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@radix-ui/react-tooltip";
import {
  CircleUserRound,
  FileInput,
  Key,
  Moon,
  PlusSquare,
  Sun,
} from "lucide-react";
import { useTheme } from "@/provider/theme-provider";

const Header = ({
  nodes,
  edges,
  setShowImportDialog,
  setShowCredentialVault,
  showCredentialVault,
}: {
  nodes: number;
  edges: number;
  setShowImportDialog: (value: boolean) => void;
  setShowCredentialVault: (value: boolean) => void;
  showCredentialVault: boolean;
}) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="w-[25%] absolute right-6 top-4 z-50 shadow-sm">
      <div className="h-14 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 rounded-3xl">
        <div className="w-full flex items-center justify-between space-x-6">
          <div className="flex items-center space-x-3">
            <div className="">
              <div className="text-sm text-[#9631e9] dark:text-text-secondary">
                {nodes} nodes
              </div>
              <div className="text-sm text-[#9631e9] dark:text-text-secondary">
                {edges} connections
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger>
                <PlusSquare className="text-gray-900 dark:text-gray-900 bg-purple-100 dark:bg-gray-300 w-8 h-8 p-2 transition-transform duration-200 ease-in-out hover:scale-125 rounded-full" />
              </TooltipTrigger>
              <TooltipContent className="text-xs p-1 rounded-md bg-gray-200 dark:bg-gray-800 dark:text-gray-200">
                <p>New Workflow</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger onClick={() => setShowImportDialog(true)}>
                <FileInput className="text-gray-900 dark:text-gray-900 bg-purple-100 dark:bg-gray-300 w-8 h-8 p-2 transition-transform duration-200 ease-in-out hover:scale-125 rounded-full" />
              </TooltipTrigger>
              <TooltipContent className="text-xs p-1 rounded-md bg-gray-200 dark:bg-gray-800 dark:text-gray-200">
                <p>Import Workflow</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                onClick={() => setShowCredentialVault(!showCredentialVault)}
              >
                <Key className="text-gray-900 dark:text-gray-900 bg-purple-100 dark:bg-gray-300 w-8 h-8 p-2 transition-transform duration-200 ease-in-out hover:scale-125 rounded-full" />
              </TooltipTrigger>
              <TooltipContent className="text-xs p-1 rounded-md bg-gray-200 dark:bg-gray-800 dark:text-gray-200">
                <p>Credentials</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger>
                <CircleUserRound className="text-gray-900 dark:text-gray-900 bg-purple-100 dark:bg-gray-300 w-8 h-8 p-2 transition-transform duration-200 ease-in-out hover:scale-125 rounded-full" />
              </TooltipTrigger>
              <TooltipContent className="text-xs p-1 rounded-md bg-gray-200 dark:bg-gray-800 dark:text-gray-200">
                <p>Profile</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger onClick={() => toggleTheme()}>
                {isDark ? (
                  <Sun className="text-gray-900 dark:text-gray-900 bg-purple-100 dark:bg-gray-200 w-8 h-8 p-2 transition-transform duration-200 ease-in-out hover:scale-125 rounded-full" />
                ) : (
                  <Moon className="text-gray-900 dark:text-gray-900 bg-purple-100 dark:bg-gray-200 w-8 h-8 p-2 transition-transform duration-200 ease-in-out hover:scale-125 rounded-full" />
                )}
              </TooltipTrigger>
              <TooltipContent className="text-xs p-1 rounded-md bg-gray-200 dark:bg-gray-800 dark:text-gray-200">
                <p>{isDark ? "Light Mode" : "Dark Mode"}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;
