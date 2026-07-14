import { useState, useEffect } from "react";
import LeftNav, { NavItems } from "@/components/LeftNav";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, Search, Menu, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LibraryItem,
  LibraryItemType,
  LIBRARY_NODE_CLIPBOARD_KEY,
} from "@/components/Library/types";
import { LibraryCard } from "@/components/Library/LibraryCard";
import { LibraryListItem } from "@/components/Library/LibraryListItem";
import { WorkflowPreviewModal } from "@/components/Library/WorkflowPreviewModal";
import { libraryService } from "@/lib/api/library";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";

const typeTabs: { key: "all" | LibraryItemType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "workflow", label: "Workflows" },
  { key: "node", label: "Nodes" },
  { key: "script", label: "Scripts" },
];

const Library = () => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<"all" | LibraryItemType>(
    "all",
  );
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [forkingId, setForkingId] = useState<string | null>(null);

  // Preview modal state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewName, setPreviewName] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewContent, setPreviewContent] = useState<{
    nodes?: unknown[];
    edges?: unknown[];
  } | null>(null);

  const navigate = useNavigate();
  const { getToken, isSignedIn } = useAuth();

  // Get Clerk token
  useEffect(() => {
    if (isSignedIn) {
      (async () => {
        try {
          setToken(await getToken());
        } catch (error) {
          console.error("Failed to get token:", error);
        }
      })();
    } else {
      setLoading(false);
    }
  }, [isSignedIn, getToken]);

  // Fetch library items
  useEffect(() => {
    if (!token) return;
    const fetchItems = async () => {
      setLoading(true);
      try {
        const data = await libraryService.list(token);
        setItems(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to fetch library:", error);
        toast.error("Failed to load the library.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, [token]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleFork = async (item: LibraryItem) => {
    if (!token) {
      toast.error("You must be signed in to fork library items.");
      return;
    }
    setForkingId(item.id);
    try {
      const result = await libraryService.fork(item.id, token);

      if (result.type === "node" && result.node_data) {
        const payload = {
          [LIBRARY_NODE_CLIPBOARD_KEY]: true,
          nodeType: result.node_data.nodeType,
          data: result.node_data.data,
        };
        await navigator.clipboard.writeText(JSON.stringify(payload));
        toast.success(
          "Node copied — open a workflow and paste it (Ctrl/Cmd + V).",
        );
        return;
      }

      if (result.redirect_url) {
        const label = result.type === "workflow" ? "Workflow" : "Script";
        toast.success(`${label} forked to your account.`);
        navigate(result.redirect_url);
      }
    } catch (error) {
      console.error("Fork failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to fork this item.",
      );
    } finally {
      setForkingId(null);
    }
  };

  const handlePreview = async (item: LibraryItem) => {
    if (!token) return;
    setPreviewName(item.name);
    setPreviewContent(null);
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const detail = await libraryService.get(item.id, token);
      setPreviewContent(detail.content ?? null);
    } catch (error) {
      console.error("Failed to load preview:", error);
      toast.error("Failed to load the preview.");
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesType = selectedType === "all" || item.type === selectedType;
    const q = debouncedSearchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.tags.some((tag) => tag.toLowerCase().includes(q));
    return matchesType && matchesSearch;
  });

  return (
    <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
      <LeftNav />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
            {/* Header */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Mobile menu */}
                  <div className="md:hidden">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-ml-2 hover:bg-gray-300 dark:hover:bg-gray-700"
                        >
                          <Menu className="h-6 w-6 text-gray-800 dark:text-gray-200" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent
                        side="left"
                        className="w-[250px] sm:w-[300px] bg-gray-100 dark:bg-gray-900 dark:border-gray-800"
                      >
                        <SheetHeader>
                          <div className="flex items-center gap-3">
                            <img
                              src="/icon.png"
                              alt="AutoSage Icon"
                              className="w-10 h-10 object-contain rounded-full shadow-sm"
                            />
                            <div className="flex flex-col items-start">
                              <h1 className="text-gray-950 dark:text-gray-100 font-semibold text-xl tracking-tight leading-tight">
                                Autosage
                              </h1>
                              <p className="text-sidebar-foreground text-xs font-medium">
                                Automation Hub
                              </p>
                            </div>
                          </div>
                        </SheetHeader>
                        <NavItems mobile />
                      </SheetContent>
                    </Sheet>
                  </div>

                  <div className="flex items-center gap-4">
                    <img
                      src="/logo.png"
                      alt="AutoSage Logo"
                      className="h-10 md:h-12 w-auto rounded-full object-contain"
                    />
                    <div>
                      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                        Library
                      </h1>
                      <p className="text-sm md:text-lg text-gray-500 dark:text-gray-400 mt-1 hidden md:block">
                        Reusable workflows, scripts, and nodes you can fork into
                        your account.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Type tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                {typeTabs.map((tab) => (
                  <Button
                    key={tab.key}
                    variant={selectedType === tab.key ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedType(tab.key)}
                    className={cn(
                      "whitespace-nowrap rounded-full",
                      selectedType === tab.key
                        ? "bg-purple-600 hover:bg-purple-700 text-white border-transparent"
                        : "bg-white dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700",
                    )}
                  >
                    {tab.label}
                  </Button>
                ))}
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <Input
                    placeholder="Search the library..."
                    className="pl-8 bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 dark:text-gray-200"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between md:justify-end gap-3">
                  <div className="flex items-center bg-white dark:bg-gray-800/50 rounded-lg p-1 border border-gray-200 dark:border-gray-700/50 shadow-sm">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewMode("grid")}
                      className={cn(
                        "h-8 w-8 p-0 rounded-md transition-all",
                        viewMode === "grid"
                          ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-800",
                      )}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewMode("list")}
                      className={cn(
                        "h-8 w-8 p-0 rounded-md transition-all",
                        viewMode === "list"
                          ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-800",
                      )}
                    >
                      <List className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                <p>Loading the library…</p>
              </div>
            ) : (
              <div
                className={cn(
                  "animate-in fade-in slide-in-from-bottom-4 duration-500",
                  viewMode === "grid"
                    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
                    : "flex flex-col space-y-4",
                )}
              >
                {filteredItems.length > 0 ? (
                  filteredItems.map((item) =>
                    viewMode === "grid" ? (
                      <LibraryCard
                        key={item.id}
                        item={item}
                        onFork={handleFork}
                        isForking={forkingId === item.id}
                        onPreview={
                          item.type === "workflow" ? handlePreview : undefined
                        }
                      />
                    ) : (
                      <LibraryListItem
                        key={item.id}
                        item={item}
                        onFork={handleFork}
                        isForking={forkingId === item.id}
                        onPreview={
                          item.type === "workflow" ? handlePreview : undefined
                        }
                      />
                    ),
                  )
                ) : (
                  <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                    <div className="bg-gray-100 dark:bg-gray-800/50 p-4 rounded-full mb-4">
                      <Search className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      No library items found
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                      We couldn't find anything matching your filters. Try a
                      different type or search term.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      <WorkflowPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        name={previewName}
        content={previewContent}
        loading={previewLoading}
      />
    </div>
  );
};

export default Library;
