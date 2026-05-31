import React from "react";
import { AIWorkflowGenerator } from "./AIWorkflowGenerator";

interface OpenWorkflowShape {
  id: string;
  name: string;
}

interface AIWorkflowGeneratorSidebarProps {
  /** Workflow currently loaded on the WorkflowBuilder canvas, or null
   * if the user is on `/workflow/new`. */
  openWorkflow: OpenWorkflowShape | null;
  /** Fired with the new Workflow.id when the bot calls `create_workflow`. */
  onWorkflowCreated: (workflowId: string, workflowName: string) => void;
  /** Fired with the Workflow.id when the bot calls `update_workflow`. */
  onWorkflowUpdated: (workflowId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Right-side sidebar wrapper for the inline Workflow Generator.
 *
 * Stays mounted across open/close cycles (mirrors the Script Editor's
 * AIScriptGeneratorSidebar). Hiding via CSS instead of unmounting keeps
 * the AIWorkflowGenerator's thread state alive — open the panel 10
 * times across one canvas session, still one archived autobot thread,
 * not ten little ones. Also lets an in-flight stream complete in the
 * background; create_workflow / update_workflow callbacks still fire
 * and the canvas updates even if the user closed the panel while the
 * model was still thinking.
 */
export const AIWorkflowGeneratorSidebar: React.FC<
  AIWorkflowGeneratorSidebarProps
> = ({
  openWorkflow,
  onWorkflowCreated,
  onWorkflowUpdated,
  isOpen,
  onToggle,
}) => {
  return (
    <div
      className={`w-80 shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 h-full flex flex-col transition-all duration-300 ${
        isOpen ? "" : "hidden"
      }`}
      aria-hidden={!isOpen}
    >
      <AIWorkflowGenerator
        openWorkflow={openWorkflow}
        onWorkflowCreated={onWorkflowCreated}
        onWorkflowUpdated={onWorkflowUpdated}
        onClose={onToggle}
      />
    </div>
  );
};
