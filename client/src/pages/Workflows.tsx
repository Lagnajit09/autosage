import { useState } from "react";
import LeftNav from "@/components/LeftNav";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Workflow } from "@/components/Workflows/types";
import { WorkflowCard } from "@/components/Workflows/WorkflowCard";
import { WorkflowListItem } from "@/components/Workflows/WorkflowListItem";

// Mock Data
const workflows: Workflow[] = [
  {
    id: "1",
    title: "Data Scraper Pro",
    description:
      "Automated scraping of competitor prices and inventory updates daily.",
    status: "active",
    lastRun: "2 hours ago",
    avgDuration: "45s",
    runs: 1240,
    tags: ["Scraping", "E-commerce"],
  },
  {
    id: "2",
    title: "Email Marketing Automator",
    description:
      "Sends personalized follow-up emails to new leads from the landing page.",
    status: "active",
    lastRun: "1 day ago",
    avgDuration: "12s",
    runs: 850,
    tags: ["Marketing", "Email"],
  },
  {
    id: "3",
    title: "Weekly Report Generator",
    description:
      "Compiles weekly sales data and generates a PDF report for stakeholders.",
    status: "paused",
    lastRun: "5 days ago",
    avgDuration: "2m 10s",
    runs: 45,
    tags: ["Reporting", "Analytics"],
  },
  {
    id: "4",
    title: "Database Backup",
    description:
      "Performs a full backup of the production database and uploads to S3.",
    status: "active",
    lastRun: "12 hours ago",
    avgDuration: "5m 30s",
    runs: 365,
    tags: ["DevOps", "Maintenance"],
  },
  {
    id: "5",
    title: "Social Media Poster",
    description:
      "Schedules and posts content to Twitter and LinkedIn automatically.",
    status: "draft",
    lastRun: "Never",
    avgDuration: "-",
    runs: 0,
    tags: ["Social", "Marketing"],
  },
  {
    id: "6",
    title: "Invoice Processor",
    description:
      "Extracts data from incoming invoice PDFs and updates the accounting system.",
    status: "active",
    lastRun: "30 mins ago",
    avgDuration: "15s",
    runs: 2100,
    tags: ["Finance", "Automation"],
  },
];

const Workflows = () => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  return (
    <div className="flex w-full h-screen bg-gray-50 dark:bg-workflow-void/95 overflow-hidden">
      <LeftNav />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                  Workflows
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1 text-lg">
                  Manage, monitor, and execute your automation workflows.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center bg-white dark:bg-gray-800/50 rounded-lg p-1 border border-gray-200 dark:border-gray-700/50 shadow-sm">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "h-8 w-8 p-0 rounded-md transition-all",
                      viewMode === "grid"
                        ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-800"
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
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-800"
                    )}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>

                <Button className="bg-[#a768d0] hover:bg-[#9556bf] text-white shadow-md shadow-purple-500/20 transition-all hover:shadow-purple-500/40">
                  <Plus className="w-4 h-4 mr-2" />
                  New Workflow
                </Button>
              </div>
            </div>

            {/* Workflows Grid/List */}
            <div
              className={cn(
                "animate-in fade-in slide-in-from-bottom-4 duration-500",
                viewMode === "grid"
                  ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                  : "flex flex-col space-y-4"
              )}
            >
              {workflows.map((workflow) =>
                viewMode === "grid" ? (
                  <WorkflowCard key={workflow.id} workflow={workflow} />
                ) : (
                  <WorkflowListItem key={workflow.id} workflow={workflow} />
                )
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Workflows;
