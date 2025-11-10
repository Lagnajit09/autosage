import { DashboardSidebar } from "@/components/Dashboard/Sidebar";
import TopNav from "@/components/Dashboard/TopNav";
import LeftNav from "@/components/LeftNav";
import { SidebarProvider } from "@/components/ui/sidebar";

const Dashboard = () => {
  return (
    <SidebarProvider>
      <div className="flex w-full h-screen bg-gray-300/60 dark:bg-workflow-void/90">
        <DashboardSidebar />
        {/* <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1> */}
        <TopNav />
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
