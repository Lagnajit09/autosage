import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTrigger } from "@/components/ui/sheet";
import { Loader2, Menu, Activity, Download } from "lucide-react";
import { NavItems } from "@/components/LeftNav";
import Logo from "../Logo";

interface ExecutionLogsHeaderProps {
  loading: boolean;
  onRefresh: () => void;
  onExportCSV: (range: "24h" | "7d" | "30d" | "all") => void;
  onExportJSON: (range: "24h" | "7d" | "30d" | "all") => void;
}

export const ExecutionLogsHeader: React.FC<ExecutionLogsHeaderProps> = ({
  loading,
  onRefresh,
  onExportCSV,
  onExportJSON,
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">

          {/* Mobile Menu Navigation */}
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-ml-2 hover:bg-gray-300 dark:hover:bg-gray-700"
                >
                  <Menu className="h-6 w-6 text-gray-800 dark:text-gray-200" />
                </Button>
              </SheetTrigger>

              <SheetContent
                side="left"
                className="w-[250px] sm:w-[300px] bg-gray-100 dark:bg-gray-900 dark:border-gray-800"
              >
                <SheetHeader>
                  <div className="flex items-center gap-3">
                    <img
                      src="/logo.png"
                      alt="AutoSage Icon"
                      className="w-10 h-10 object-contain shadow-sm"
                    />
                    <div className="flex flex-col items-start">
                      <h1 className="text-gray-950 dark:text-gray-100 font-semibold text-xl tracking-tight leading-tight">
                        Autosage
                      </h1>
                      <p className="text-sidebar-foreground text-xs font-medium">
                        Automation Hub
                      </p>
                    </div>
                  </div>
                </SheetHeader>
                <NavItems mobile />
              </SheetContent>
            </Sheet>
          </div>

          <div className="flex items-center gap-4">
            <img
              src="/logo.png"
              alt="AutoSage Logo"
              className="h-10 md:h-12 w-auto rounded-full object-contain"
            />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                Execution Logs
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 hidden md:block">
                Monitor execution logs, statuses, and performance for your automation runs.
              </p>
            </div>
          </div>

        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : null}
            Refresh
          </Button>

          {/* Date-Ranged Export Options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="bg-[#a768d0] hover:bg-[#9556bf] text-white shadow-md shadow-purple-500/15">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 dark:bg-gray-800 dark:border-gray-700">
              {/* CSV Sub-menu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200">
                  Export as CSV
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="dark:bg-gray-800 dark:border-gray-700">
                    <DropdownMenuItem
                      onClick={() => onExportCSV("24h")}
                      className="cursor-pointer dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200"
                    >
                      Today
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onExportCSV("7d")}
                      className="cursor-pointer dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200"
                    >
                      Last 7 Days
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onExportCSV("30d")}
                      className="cursor-pointer dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200"
                    >
                      Current Month
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onExportCSV("all")}
                      className="cursor-pointer dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium"
                    >
                      All Time
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>

              {/* JSON Sub-menu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200">
                  Export as JSON
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="dark:bg-gray-800 dark:border-gray-700">
                    <DropdownMenuItem
                      onClick={() => onExportJSON("24h")}
                      className="cursor-pointer dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200"
                    >
                      Today
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onExportJSON("7d")}
                      className="cursor-pointer dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200"
                    >
                      Last 7 Days
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onExportJSON("30d")}
                      className="cursor-pointer dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200"
                    >
                      Current Month
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onExportJSON("all")}
                      className="cursor-pointer dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium"
                    >
                      All Time
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};
