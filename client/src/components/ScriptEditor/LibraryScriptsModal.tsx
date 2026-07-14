import { useEffect, useMemo, useState } from "react";
import { FileCode2, GitFork, Loader2, Search } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { libraryService } from "@/lib/api/library";
import { LibraryItem } from "@/components/Library/types";

interface Props {
  open: boolean;
  onClose: () => void;
  // Called after a successful fork so the editor can refetch + open the copy.
  onForked: (scriptId: string, scriptName: string) => void;
}

export const LibraryScriptsModal = ({ open, onClose, onForked }: Props) => {
  const { getToken } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [forkingId, setForkingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;
        const data = await libraryService.list(token, { type: "script" });
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to load library scripts:", error);
        toast.error("Failed to load library scripts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, getToken]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [search, items]);

  const handleFork = async (item: LibraryItem) => {
    setForkingId(item.id);
    try {
      const token = await getToken();
      if (!token) {
        toast.error("You must be signed in to fork scripts.");
        return;
      }
      const result = await libraryService.fork(item.id, token);
      if (result.type === "script" && result.id != null) {
        toast.success(`Forked "${item.name}" to your scripts.`);
        onForked(String(result.id), result.name ?? item.name);
        onClose();
      }
    } catch (error) {
      console.error("Fork failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to fork this script.",
      );
    } finally {
      setForkingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-[90vw] bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">
            Library Scripts
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search library scripts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 dark:text-gray-100 border border-gray-300 dark:border-gray-800"
          />
        </div>

        <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1 mt-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-500 dark:text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <span className="text-sm">Loading library scripts…</span>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              No library scripts found.
            </p>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 hover:border-purple-300 dark:hover:border-purple-800 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 shrink-0">
                    <FileCode2 size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {item.description}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.tags.slice(0, 3).map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="capitalize border bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700 text-[10px]"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleFork(item)}
                  disabled={forkingId === item.id}
                  className="shrink-0 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {forkingId === item.id ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <GitFork className="w-4 h-4 mr-1.5" />
                  )}
                  Fork
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
