import Interface from "@/components/Chat/Interface";
import LeftSidebar from "@/components/Chat/LeftSidebar";
import LeftNav from "@/components/LeftNav";

const AutobotChat = () => {
  return (
    <div className="flex gap-10 w-full h-screen bg-light-tertiary">
      <LeftNav />
      <LeftSidebar />
      <Interface />
    </div>
  );
};

export default AutobotChat;
