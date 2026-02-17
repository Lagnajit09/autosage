import React from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuLabel,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";

type BaseActions = {
  onReload?: () => void;
  onBack?: () => void;
  onForward?: () => void;
};

type WorkflowActions = {
  onExportJson?: () => void;
  onSaveWorkflow?: () => void;
  onDeleteWorkflow?: () => void;
};

type Mode = "workflow" | "script";

type AppContextMenuProps = {
  children: React.ReactNode;
  mode: Mode;
  baseActions?: BaseActions;
  workflowActions?: WorkflowActions;
};

export function AppContextMenu({
  children,
  mode,
  baseActions = {},
  workflowActions = {},
}: AppContextMenuProps) {
  const { onReload, onBack, onForward } = baseActions;

  const { onExportJson, onSaveWorkflow, onDeleteWorkflow } = workflowActions;

  // Default implementations for browser-like actions
  const handleReload = () => {
    if (onReload) return onReload();
    window.location.reload();
  };

  const handleBack = () => {
    if (onBack) return onBack();
    window.history.back();
  };

  const handleForward = () => {
    if (onForward) return onForward();
    window.history.forward();
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>

      <ContextMenuContent className="w-56">
        {/* Browser-like section */}
        <ContextMenuLabel>Browser</ContextMenuLabel>
        <ContextMenuItem onSelect={handleBack}>
          Back
          <ContextMenuShortcut>Alt+←</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleForward}>
          Forward
          <ContextMenuShortcut>Alt+→</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleReload}>
          Reload
          <ContextMenuShortcut>Ctrl+R</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />

        {/* Mode-specific section */}
        {mode === "workflow" && (
          <>
            <ContextMenuLabel>Workflow</ContextMenuLabel>
            <ContextMenuItem onSelect={onExportJson}>
              Export JSON
            </ContextMenuItem>
            <ContextMenuItem onSelect={onSaveWorkflow}>
              Save workflow
              <ContextMenuShortcut>Ctrl+S</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={onDeleteWorkflow}
              className="text-red-500 focus:text-red-500"
            >
              Delete workflow
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
