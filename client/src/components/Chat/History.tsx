import React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MoreHorizontal,
  Plus,
  PlusCircle,
  Share,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "../ui/button";

type ChatItem = {
  id: string;
  title: string;
  lastMessage?: string;
  unreadCount?: number;
};

type HistoryProps = {
  items?: ChatItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  className?: string;
};

const defaultItems: ChatItem[] = [
  { id: "1", title: "New Automation Ideas", lastMessage: "Let's draft a plan" },
  {
    id: "2",
    title: "Weekly Report Agent",
    lastMessage: "Generated summary",
  },
  { id: "3", title: "Email Parser", lastMessage: "Deployed to prod" },
];

const History: React.FC<HistoryProps> = ({
  items = defaultItems,
  activeId,
  onSelect,
  onDelete,
  className,
}) => {
  const { state } = useSidebar();
  const [searchQuery, setSearchQuery] = React.useState("");

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredItems = React.useMemo(
    () =>
      normalizedQuery
        ? items.filter((item) => {
            const title = item.title.toLowerCase();
            const last = (item.lastMessage || "").toLowerCase();
            return (
              title.includes(normalizedQuery) || last.includes(normalizedQuery)
            );
          })
        : items,
    [items, normalizedQuery]
  );
  return (
    <Sidebar
      className={`${className} ${
        state === "collapsed"
          ? "h-fit border-none [&_[data-sidebar=sidebar]]:bg-transparent dark:[&_[data-sidebar=sidebar]]:bg-transparent"
          : "h-full border-gray-300 dark:border-gray-800 [&_[data-sidebar=sidebar]]:bg-light-tertiary dark:[&_[data-sidebar=sidebar]]:bg-gray-950/20"
      } ml-16 `}
      collapsible="icon"
    >
      {state === "collapsed" ? (
        <div className="flex flex-col items-center justify-center mt-4 gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <SidebarTrigger />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              Open sidebar
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-200 dark:hover:text-gray-700 cursor-pointer">
                <PlusCircle className="w-4 h-5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              New Chat
            </TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <>
          <SidebarHeader className="mt-2 flex items-start gap-2 w-full">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <SidebarTrigger />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="center">
                    Close sidebar
                  </TooltipContent>
                </Tooltip>
                <p className="tracking-wider text-gray-950 dark:text-gray-100 font-semibold">
                  AutoSage
                </p>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-200 dark:hover:text-gray-700 cursor-pointer">
                    <PlusCircle className="w-4 h-5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  New Chat
                </TooltipContent>
              </Tooltip>
            </div>
            <SidebarInput
              placeholder="Search chats..."
              className="dark:bg-gray-800 text-gray-900 dark:text-gray-200 outline-none border border-gray-500 dark:border-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Chat History</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredItems.map((item) => (
                    <SidebarMenuItem key={item.id} className="relative">
                      <div className="flex items-center w-full group/item  hover:bg-purple-200/30 dark:hover:bg-purple-800/30 rounded-lg">
                        <SidebarMenuButton
                          onClick={() => onSelect?.(item.id)}
                          isActive={item.id === activeId}
                          tooltip={item.title}
                          className="text-gray-900 dark:text-gray-200 font-medium flex-1 hover:bg-transparent"
                        >
                          <span>{item.title}</span>
                        </SidebarMenuButton>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded p-0.5 ml-1 text-gray-700 dark:text-gray-300 opacity-0 pointer-events-none group-hover/item:opacity-100 group-hover/item:pointer-events-auto data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto hover:bg-gray-100 dark:hover:bg-gray-800"
                              aria-label="Open chat actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            side="right"
                            sideOffset={8}
                            className="w-44"
                          >
                            <DropdownMenuItem className="text-gray-800 dark:text-gray-200">
                              <Share />
                              <span>Share</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-gray-800 dark:text-gray-200">
                              <Pencil />
                              <span>Rename</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onDelete?.(item.id)}
                              className="text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 focus:bg-red-100 dark:focus:bg-red-900/40"
                            >
                              <Trash2 />
                              <span>Delete</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {onDelete ? (
                        <SidebarMenuAction
                          aria-label="Delete chat"
                          onClick={() => onDelete(item.id)}
                        >
                          ×
                        </SidebarMenuAction>
                      ) : null}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarSeparator />

          <SidebarFooter>
            <div className="text-xs text-muted-foreground px-2">
              Press Ctrl+B to toggle
            </div>
          </SidebarFooter>

          <SidebarRail />
        </>
      )}
    </Sidebar>
  );
};

export default History;
