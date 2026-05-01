import React from "react";
import { BaseConfigProps } from "@/utils/types";

export const ManualTrigger: React.FC<BaseConfigProps> = () => {
  return (
    <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed bg-gray-50 dark:bg-gray-900/50 p-3 rounded-md border border-gray-200 dark:border-gray-800">
      Manual triggers do not require any additional configuration. They can be
      executed directly from the dashboard or workflow builder.
    </div>
  );
};
