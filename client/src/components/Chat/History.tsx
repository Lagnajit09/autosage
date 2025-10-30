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
  return (
    <Sidebar
      className={`${className} ${
        state === "collapsed"
          ? "h-fit border-none [&_[data-sidebar=sidebar]]:bg-transparent"
          : "h-full [&_[data-sidebar=sidebar]]:bg-light-tertiary"
      } ml-16 `}
      collapsible="icon"
    >
      {state === "collapsed" ? (
        <div className="flex items-center justify-center mt-4">
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
        </div>
      ) : (
        <>
          <SidebarHeader className="mt-2 flex items-start gap-2 w-full">
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
            <SidebarInput placeholder="Search chats..." />
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Chat History</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        onClick={() => onSelect?.(item.id)}
                        isActive={item.id === activeId}
                        tooltip={item.title}
                      >
                        <span>{item.title}</span>
                        {item.unreadCount ? (
                          <SidebarMenuBadge>
                            {item.unreadCount}
                          </SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuButton>
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
