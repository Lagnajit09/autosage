import React, { useEffect, useMemo, useState } from "react";
import {
  Zap,
  Terminal,
  GitBranch,
  Boxes,
  Search,
  LibraryBig,
  LucideIcon,
} from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { NodeData } from "@/utils/types";
import { libraryService } from "@/lib/api/library";
import Logo from "../Logo";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { LibraryNodesModal } from "./LibraryNodesModal";

interface LeftSidebarProps {
  onSaveWorkflow: () => void;
  workflowName: string;
  setWorkflowName: (name: string) => void;
  onAddLibraryNode?: (nodeType: string, data: NodeData) => void;
}

// A library node carries the node type plus a fully pre-configured NodeData blob.
export interface LibraryNode {
  id: string;
  name: string;
  nodeType: string;
  data: NodeData;
}

// The three generic node categories. The concrete sub-type (script/email,
// manual/http/schedule) is chosen in the config panel after dropping.
const nodePalette: {
  nodeType: string;
  label: string;
  icon: LucideIcon;
  wrap: string;
  icons: string;
}[] = [
  {
    nodeType: "trigger",
    label: "Trigger",
    icon: Zap,
    wrap: "hover:bg-green-50 dark:hover:bg-green-900/10 hover:border-green-200 dark:hover:border-green-800",
    icons:
      "bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 group-hover:text-green-700 dark:group-hover:text-green-300",
  },
  {
    nodeType: "action",
    label: "Action",
    icon: Terminal,
    wrap: "hover:bg-blue-50 dark:hover:bg-blue-900/10 hover:border-blue-200 dark:hover:border-blue-800",
    icons:
      "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300",
  },
  {
    nodeType: "decision",
    label: "Decision",
    icon: GitBranch,
    wrap: "hover:bg-amber-50 dark:hover:bg-amber-900/10 hover:border-amber-200 dark:hover:border-amber-800",
    icons:
      "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 group-hover:text-amber-700 dark:group-hover:text-amber-300",
  },
];

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  onSaveWorkflow,
  workflowName,
  setWorkflowName,
  onAddLibraryNode,
}) => {
  // Prepare drag data for the canvas drop handler.
  const onDragStart = (
    event: React.DragEvent,
    nodeType: string,
    nodeData: NodeData,
  ) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.setData("application/nodedata", JSON.stringify(nodeData));
    event.dataTransfer.effectAllowed = "move";
  };

  // Pre-configured nodes from the Library (fetched once on mount).
  const { getToken, isSignedIn } = useAuth();
  const [libraryNodes, setLibraryNodes] = useState<LibraryNode[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [showLibraryModal, setShowLibraryModal] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const list = await libraryService.list(token, { type: "node" });
        // The list omits `content`; fetch each detail to get {nodeType, data}.
        const details = await Promise.all(
          list.map((item) => libraryService.get(item.id, token)),
        );
        if (cancelled) return;
        const nodes: LibraryNode[] = details
          .map((d) => {
            const content = d.content as {
              nodeType?: string;
              data?: NodeData;
            };
            if (!content?.nodeType || !content?.data) return null;
            return {
              id: d.id,
              name: d.name,
              nodeType: content.nodeType,
              data: content.data,
            };
          })
          .filter((n): n is LibraryNode => n !== null);
        setLibraryNodes(nodes);
      } catch (error) {
        console.error("Failed to load library nodes:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  // Inline search results (kept short — full list lives in the modal).
  const inlineMatches = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return [];
    return libraryNodes
      .filter((n) => n.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [librarySearch, libraryNodes]);

  const handleAddFromModal = (node: LibraryNode) => {
    onAddLibraryNode?.(node.nodeType, node.data);
    toast.success(`Added "${node.name}" to the canvas.`);
  };

  return (
    <div className="w-56 h-[98%] my-auto bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-4 flex flex-col relative rounded-3xl shadow-sm z-20 shrink-0 ml-2">
      {/* Header */}
      <div className="shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Logo />
        </div>

        {/* Workflow Name */}
        <div className="mb-4">
          <Input
            placeholder="Workflow Name"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="w-full p-2 dark:text-gray-100 border-2 border-gray-300 dark:border-gray-800 rounded-md"
          />
        </div>

        <div className="flex items-center mb-4 relative z-10">
          <div className="w-2 h-2 bg-gradient-to-r from-workflow-royal to-workflow-nebula dark:from-workflow-nebula dark:to-workflow-aurora rounded-full mr-3 animate-pulse-glow"></div>
          <h2 className="text-sm font-semibold text-text-light-accent dark:text-text-primary">
            Components
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 -mr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full">
        {/* Nodes Section */}
        <div className="mb-6 relative z-10">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-4 uppercase tracking-wider font-medium flex items-center">
            <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full mr-2"></div>
            Nodes
          </div>
          <div className="space-y-3">
            {nodePalette.map((node) => {
              const Icon = node.icon;
              return (
                <div
                  key={node.nodeType}
                  draggable
                  onDragStart={(e) =>
                    onDragStart(e, node.nodeType, { label: node.label })
                  }
                  className={`group cursor-grab active:cursor-grabbing
                           bg-gray-50 dark:bg-gray-900 ${node.wrap}
                           rounded-xl p-2
                           border border-gray-200 dark:border-gray-800
                           transition-all duration-200 ease-out
                           transform hover:scale-[1.02]`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${node.icons}`}>
                      <Icon size={14} />
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">
                      {node.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3 leading-snug">
            Drag a node onto the canvas, then pick its type in the panel.
          </p>
        </div>

        {/* Library Section (search + browse) */}
        {libraryNodes.length > 0 && (
          <div className="mb-6 relative z-10">
            <div className="text-xs text-purple-600 dark:text-purple-400 mb-3 uppercase tracking-wider font-medium flex items-center">
              <div className="w-1 h-1 bg-purple-600 dark:bg-purple-400 rounded-full mr-2"></div>
              Library
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="Search library nodes..."
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                className="pl-7 h-9 text-sm dark:text-gray-100 border border-gray-300 dark:border-gray-800 rounded-md"
              />
            </div>

            {librarySearch.trim() && (
              <div className="space-y-2 mb-3">
                {inlineMatches.length > 0 ? (
                  inlineMatches.map((node) => (
                    <div
                      key={node.id}
                      draggable
                      onDragStart={(e) =>
                        onDragStart(e, node.nodeType, node.data)
                      }
                      className="group cursor-grab active:cursor-grabbing
                               bg-gray-50 dark:bg-gray-900
                               hover:bg-purple-50 dark:hover:bg-purple-900/10
                               rounded-xl p-2
                               border border-gray-200 dark:border-gray-800
                               hover:border-purple-200 dark:hover:border-purple-800
                               transition-all duration-200 ease-out
                               transform hover:scale-[1.02]"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg text-purple-600 dark:text-purple-400">
                          <Boxes size={14} />
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-200 font-medium truncate">
                          {node.name}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
                    No matching library nodes.
                  </p>
                )}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLibraryModal(true)}
              className="w-full text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/10"
            >
              <LibraryBig size={14} className="mr-2" />
              Browse Library ({libraryNodes.length})
            </Button>
          </div>
        )}
      </div>

      {/* Save Button at bottom */}
      <div className="shrink-0 mt-auto pt-4 border-t border-gray-300 dark:border-borders-primary/20 relative z-10">
        <Button
          onClick={onSaveWorkflow}
          className="w-full bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700
                   text-white dark:text-white
                   text-sm py-3 px-4 rounded-xl
                   shadow-sm hover:shadow-md
                   transform hover:scale-[1.02] hover:-translate-y-0.5 transition-all duration-200"
        >
          <div className="flex items-center justify-center space-x-2">
            <span className="font-medium">Save Workflow</span>
          </div>
        </Button>
      </div>

      <LibraryNodesModal
        open={showLibraryModal}
        onClose={() => setShowLibraryModal(false)}
        nodes={libraryNodes}
        onAdd={handleAddFromModal}
      />
    </div>
  );
};
