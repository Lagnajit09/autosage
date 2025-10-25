import { Home, MessageCircle, Workflow } from "lucide-react";
import React from "react";

const LeftNav = () => {
  return (
    <div className="flex-col h-screen my-auto px-4 items-center space-y-4 bg-light-primary">
      <Home className="w-10 h-10 text-text-light-primary bg-gray-400/20 rounded-lg p-2" />
      <Workflow className="w-10 h-10 text-text-light-primary bg-gray-400/20 rounded-lg p-2" />
      <MessageCircle className="w-10 h-10 text-text-light-primary bg-gray-400/20 rounded-lg p-2" />
    </div>
  );
};

export default LeftNav;
