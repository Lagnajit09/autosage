import { useMemo, useState } from "react";
import { Boxes, Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LibraryNode } from "./LeftSidebar";

interface Props {
  open: boolean;
  onClose: () => void;
  nodes: LibraryNode[];
  onAdd: (node: LibraryNode) => void;
}

export const LibraryNodesModal = ({ open, onClose, nodes, onAdd }: Props) => {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.nodeType.toLowerCase().includes(q),
    );
  }, [search, nodes]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-[90vw] bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">
            Library Nodes
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search library nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 dark:text-gray-100 border border-gray-300 dark:border-gray-800"
          />
        </div>

        <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1 mt-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              No library nodes match your search.
            </p>
          ) : (
            filtered.map((node) => (
              <div
                key={node.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 hover:border-purple-300 dark:hover:border-purple-800 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 shrink-0">
                    <Boxes size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {node.name}
                    </p>
                    <Badge
                      variant="outline"
                      className="mt-1 capitalize border bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700 text-[10px]"
                    >
                      {node.nodeType}
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => onAdd(node)}
                  className="shrink-0 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
