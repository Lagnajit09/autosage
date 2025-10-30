import Interface from "@/components/Chat/Interface";
import History from "@/components/Chat/History";
import LeftNav from "@/components/LeftNav";
import { SidebarProvider } from "@/components/ui/sidebar";

const AutobotChat = () => {
  return (
    <SidebarProvider>
      <div className="flex gap-10 w-full h-screen bg-light-tertiary dark:bg-workflow-void/90">
        <LeftNav />
        <History className="ml-16" />
        <Interface />
      </div>
    </SidebarProvider>
  );
};

export default AutobotChat;
