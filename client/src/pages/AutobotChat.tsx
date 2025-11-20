import Interface from "@/components/Chat/Interface";
import History from "@/components/Chat/History";
import LeftNav from "@/components/LeftNav";
import { SidebarProvider } from "@/components/ui/sidebar";

const AutobotChat = () => {
  return (
    <SidebarProvider>
      <div className="flex w-full h-screen bg-gray-200 dark:bg-workflow-void/90">
        <LeftNav />
        <History />
        <Interface />
      </div>
    </SidebarProvider>
  );
};

export default AutobotChat;
