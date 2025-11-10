import {
  LayoutGrid,
  Workflow,
  Code2,
  Bot,
  FileStack,
  Settings,
  User,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface NavItem {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  route: string;
}

const navItems: NavItem[] = [
  { icon: LayoutGrid, label: "Dashboard", active: true, route: "/dashboard" },
  { icon: Workflow, label: "All Workflows", route: "/workflows" },
  { icon: Code2, label: "Editor", route: "/editor" },
  { icon: Bot, label: "Autobot (AI)", route: "/ai/autobot" },
  { icon: FileStack, label: "Templates", route: "/templates" },
];

export const DashboardSidebar = () => {
  const navigate = useNavigate();
  return (
    <aside className="w-64 h-full bg-gray-100 dark:bg-gray-950 border-r border-gray-300 dark:border-gray-800 flex flex-col">
      {/* Logo Section */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-gray-950 dark:text-gray-100 font-semibold text-lg">
              Autosage
            </h1>
            <p className="text-sidebar-foreground text-sm">Automation Hub</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.route)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                item.active
                  ? "bg-[#a768d0]/30 dark:bg-bg-tertiary/60 text-[#7429a7] dark:text-[#d4b0eb]"
                  : "text-gray-700 dark:text-gray-200 hover:bg-[#a768d0]/20 dark:hover:bg-bg-tertiary/50"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* New Workflow Button */}
      <div className="p-4">
        <Button className="w-full bg-gray-800 hover:bg-gray-800/90 text-primary-foreground">
          <Plus className="w-4 h-4 mr-2" />
          New Workflow
        </Button>
      </div>

      {/* Bottom Navigation */}
      <div className="p-4 border-t border-sidebar-border space-y-1">
        <button
          onClick={() => navigate("/settings")}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-[#a768d0]/20 dark:hover:bg-bg-tertiary/50 hover:text-sidebar-accent-foreground transition-colors"
        >
          <Settings className="w-5 h-5" />
          <span className="text-sm font-medium">Settings</span>
        </button>
        <button
          onClick={() => navigate("/profile")}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-[#a768d0]/20 dark:hover:bg-bg-tertiary/50 hover:text-sidebar-accent-foreground transition-colors"
        >
          <User className="w-5 h-5" />
          <span className="text-sm font-medium">Profile</span>
        </button>
      </div>
    </aside>
  );
};
