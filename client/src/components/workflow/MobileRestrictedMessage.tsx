import React from "react";
import { Monitor, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export const MobileRestrictedMessage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 bg-purple-100 dark:bg-purple-900/20 rounded-full animate-pulse" />
          <div className="relative flex items-center justify-center w-full h-full bg-white dark:bg-gray-900 rounded-full border-2 border-purple-100 dark:border-purple-900/50 shadow-sm">
            <Monitor className="w-10 h-10 text-purple-600 dark:text-purple-400" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Desktop Experience Recommended
          </h2>
          <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
            The Workflow Builder is designed for larger screens to provide the
            best possible experience. Please stick to a desktop or tablet device
            to build and manage your workflows.
          </p>
        </div>

        <div className="pt-4">
          <Button
            onClick={() => navigate("/")}
            variant="outline"
            className="gap-2 border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};
