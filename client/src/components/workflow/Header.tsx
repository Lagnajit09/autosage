import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@radix-ui/react-tooltip";
import {
  CircleUserRound,
  DatabaseZap,
  FileInput,
  Moon,
  PlayCircle,
  PlusSquare,
  Sun,
} from "lucide-react";
import { useTheme } from "@/provider/theme-provider";
import { Button } from "../ui/button";
import { useNavigate } from "react-router-dom";

const Header = ({
  nodes,
  edges,
  setShowImportDialog,
  setShowVault,
  showVault,
}: {
  nodes: number;
  edges: number;
  setShowImportDialog: (value: boolean) => void;
  setShowVault: (value: boolean) => void;
  showVault: boolean;
}) => {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="w-[32%] flex items-center justify-end gap-2 absolute right-4 top-4 z-50">
      <Button
        onClick={() => navigate("/workflow/execution/2")}
        className="flex items-center bg-green-100 hover:bg-green-200 dark:bg-green-900/50 dark:hover:bg-green-800 text-green-600 dark:text-green-400 border-2 border-green-500/90 rounded-xl"
      >
        <PlayCircle />
        <span className="font-medium">Run</span>
      </Button>
      <div className="h-14 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 rounded-3xl shadow-sm">
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
              <TooltipTrigger onClick={() => setShowVault(!showVault)}>
                <DatabaseZap className="text-gray-900 dark:text-gray-900 bg-purple-100 dark:bg-gray-300 w-8 h-8 p-2 transition-transform duration-200 ease-in-out hover:scale-125 rounded-full" />
              </TooltipTrigger>
              <TooltipContent className="text-xs p-1 rounded-md bg-gray-200 dark:bg-gray-800 dark:text-gray-200">
                <p>Vault</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger onClick={() => navigate("/profile")}>
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
