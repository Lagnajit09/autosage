import Interface from "@/components/Chat/Interface";
import LeftSidebar from "@/components/Chat/History";
import LeftNav from "@/components/LeftNav";

const AutobotChat = () => {
  return (
    <div className="flex gap-10 w-full h-screen bg-light-tertiary dark:bg-workflow-void/90">
      <LeftNav />
      <LeftSidebar />
      <Interface />
    </div>
  );
};

export default AutobotChat;
