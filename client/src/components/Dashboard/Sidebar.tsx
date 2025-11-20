import {
  LayoutGrid,
  Workflow,
  Code2,
  Settings,
  User,
  Plus,
  ListPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { AutobotIcon } from "../AutobotIcon";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface NavItem {
  icon: React.ElementType;
  label: string;
  route: string;
}

const navItems: NavItem[] = [
  { icon: LayoutGrid, label: "Dashboard", route: "/dashboard" },
  { icon: Workflow, label: "All Workflows", route: "/workflows" },
  { icon: Code2, label: "Editor", route: "/editor" },
  { icon: AutobotIcon, label: "Autobot", route: "/ai/autobot" },
  { icon: ListPlus, label: "Templates", route: "/templates" },
];

export const DashboardSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Sidebar className="dark:border-gray-700">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3 px-2">
          <div>
            <h1 className="text-gray-950 dark:text-gray-100 font-semibold text-lg">
              Autosage
            </h1>
            <p className="text-sidebar-foreground text-sm">Automation Hub</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-4">
        <SidebarMenu>
          {navItems.map((item) => {
            const isActive = location.pathname === item.route;
            return (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  onClick={() => navigate(item.route)}
                  isActive={isActive}
                  className={`w-full justify-start gap-3 px-4 py-5 ${isActive
                    ? "bg-[#a768d0]/30 dark:bg-bg-tertiary/60 text-[#7429a7] dark:text-[#d4b0eb] hover:bg-[#a768d0]/40 dark:hover:bg-bg-tertiary/70"
                    : "text-gray-700 dark:text-gray-200 hover:bg-[#a768d0]/20 dark:hover:bg-bg-tertiary/50"
                    }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <div className="mt-4 mb-2 px-2">
        <Button className="w-full bg-gray-800 hover:bg-gray-800/90 text-primary-foreground">
          <Plus className="w-4 h-4 mr-2" />
          New Workflow
        </Button>
      </div>
      <SidebarFooter className="border-t border-sidebar-border p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => navigate("/settings")}
              className="w-full justify-start gap-3 px-4 py-5 text-gray-700 dark:text-gray-200 hover:bg-[#a768d0]/20 dark:hover:bg-bg-tertiary/50"
            >
              <Settings className="w-5 h-5" />
              <span className="text-sm font-medium">Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => navigate("/profile")}
              className="w-full justify-start gap-3 px-4 py-5 text-gray-700 dark:text-gray-200 hover:bg-[#a768d0]/20 dark:hover:bg-bg-tertiary/50"
            >
              <User className="w-5 h-5" />
              <span className="text-sm font-medium">Profile</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};
