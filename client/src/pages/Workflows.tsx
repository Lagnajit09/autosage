import { useState, useEffect } from "react";
import LeftNav, { NavItems } from "@/components/LeftNav";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, Plus, Search, Menu } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Workflow } from "@/components/Workflows/types";
import { WorkflowCard } from "@/components/Workflows/WorkflowCard";
import { WorkflowListItem } from "@/components/Workflows/WorkflowListItem";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { apiRequest } from "@/lib/api-client";
import Loader from "@/components/Loader";

const Workflows = () => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  const navigate = useNavigate();
  const { getToken, isSignedIn } = useAuth();

  // Get Clerk Token
  useEffect(() => {
    if (isSignedIn) {
      const getClerkToken = async () => {
        try {
          const clerkToken = await getToken();
          setToken(clerkToken);
        } catch (error) {
          console.error("Failed to get token:", error);
        }
      };
      getClerkToken();
    } else {
      setLoading(false);
    }
  }, [isSignedIn, getToken]);

  // Fetch Workflows
  useEffect(() => {
    if (token) {
      const fetchWorkflows = async () => {
        setLoading(true);
        try {
          const response = await apiRequest("/api/workflows/list/", {}, token);
          const data = response?.data || response || [];

          // Map server response to client Workflow type with default values
          const mappedWorkflows: Workflow[] = Array.isArray(data)
            ? data.map((item: any) => ({
                id: item.id,
                title: item.name || "Untitled Workflow",
                description: item.description || "Autosage Workflow",
                lastRun: formatDate(item.created_at) || "Never",
                runs: typeof item.runs === "number" ? item.runs : 0,
                total_nodes:
                  typeof item.total_nodes === "number" ? item.total_nodes : 0,
                total_edges:
                  typeof item.total_edges === "number" ? item.total_edges : 0,
              }))
            : [];

          setWorkflows(mappedWorkflows);
        } catch (error) {
          console.error("Failed to fetch workflows:", error);
          setWorkflows([]); // Fallback to empty list on error
        } finally {
          setLoading(false);
        }
      };
      fetchWorkflows();
    }
  }, [token]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredWorkflows = workflows.filter(
    (workflow) =>
      workflow.title
        .toLowerCase()
        .includes(debouncedSearchQuery.toLowerCase()) ||
      workflow.description
        .toLowerCase()
        .includes(debouncedSearchQuery.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-workflow-void/90">
        <Loader />
      </div>
    );
  }

  return (
    <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
      <LeftNav />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
            {/* Header Section */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Mobile Menu */}
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
                            <div className="flex flex-col items-start">
                              <h1 className="text-gray-950 dark:text-gray-100 font-semibold text-lg">
                                Autosage
                              </h1>
                              <p className="text-sidebar-foreground text-sm">
                                Automation Hub
                              </p>
                            </div>
                          </div>
                        </SheetHeader>
                        <NavItems mobile />
                      </SheetContent>
                    </Sheet>
                  </div>

                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                      Workflows
                    </h1>
                    <p className="text-sm md:text-lg text-gray-500 dark:text-gray-400 mt-1 hidden md:block">
                      Manage, monitor, and execute your automation workflows.
                    </p>
                  </div>
                </div>

                <Button className="md:hidden bg-[#a768d0] hover:bg-[#9556bf] text-white shadow-md shadow-purple-500/20">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <Input
                    placeholder="Search workflows..."
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

                  <Button
                    className="hidden md:flex bg-[#a768d0] hover:bg-[#9556bf] text-white shadow-md shadow-purple-500/20 transition-all hover:shadow-purple-500/40"
                    onClick={() => navigate("/workflow/new")}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    New Workflow
                  </Button>
                </div>
              </div>
            </div>

            {/* Workflows Grid/List */}
            <div
              className={cn(
                "animate-in fade-in slide-in-from-bottom-4 duration-500",
                viewMode === "grid"
                  ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
                  : "flex flex-col space-y-4",
              )}
            >
              {filteredWorkflows.length > 0 ? (
                filteredWorkflows.map((workflow) =>
                  viewMode === "grid" ? (
                    <WorkflowCard key={workflow.id} workflow={workflow} />
                  ) : (
                    <WorkflowListItem key={workflow.id} workflow={workflow} />
                  ),
                )
              ) : (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                  <div className="bg-gray-100 dark:bg-gray-800/50 p-4 rounded-full mb-4">
                    <Search className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    No workflows found
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                    We couldn't find any workflows matching "{searchQuery}". Try
                    adjusting your search terms.
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Workflows;
