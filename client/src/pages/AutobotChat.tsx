import Interface from "@/components/Chat/Interface";
import History from "@/components/Chat/History";
import LeftNav from "@/components/LeftNav";
import { SidebarProvider } from "@/components/ui/sidebar";

const AutobotChat = () => {
  return (
    <SidebarProvider>
      <div className="flex w-full h-screen bg-gray-50 dark:bg-workflow-void/90 overflow-hidden transition-colors duration-300">
        <LeftNav />
        <History />
        <main className="flex-1 h-full w-full relative min-w-0">
          <Interface />
        </main>
      </div>
    </SidebarProvider>
  );
};

export default AutobotChat;
