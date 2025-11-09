import TopNav from "@/components/Dashboard/TopNav";
import LeftNav from "@/components/LeftNav";
import { SidebarProvider } from "@/components/ui/sidebar";

const Dashboard = () => {
  return (
    <SidebarProvider>
      <div className="flex w-full h-screen bg-gray-300/60 dark:bg-workflow-void/90">
        <LeftNav />
        <TopNav />
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
