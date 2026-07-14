import {
  Workflow as WorkflowIcon,
  Boxes,
  FileCode2,
  Package,
  Download,
  Copy,
  GitFork,
} from "lucide-react";
import { LibraryItemType } from "./types";

// Per-type presentation: icon, colour classes, and the fork-button label/icon.
export const TYPE_META: Record<
  LibraryItemType,
  {
    label: string;
    icon: typeof WorkflowIcon;
    action: string;
    actionIcon: typeof Download;
    iconClass: string;
  }
> = {
  workflow: {
    label: "Workflow",
    icon: WorkflowIcon,
    action: "Use Workflow",
    actionIcon: GitFork,
    iconClass:
      "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  node: {
    label: "Node",
    icon: Boxes,
    action: "Copy Node",
    actionIcon: Copy,
    iconClass:
      "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  script: {
    label: "Script",
    icon: FileCode2,
    action: "Fork Script",
    actionIcon: GitFork,
    iconClass:
      "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  module: {
    label: "Module",
    icon: Package,
    action: "Use",
    actionIcon: Download,
    iconClass:
      "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
};
