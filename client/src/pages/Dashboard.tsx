import { useState, useEffect } from "react";
import { DashboardSidebar } from "@/components/Dashboard/Sidebar";
import TopNav from "@/components/Dashboard/TopNav";
import LeftNav from "@/components/LeftNav";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ProBanner, AutobotBanner } from "@/components/Dashboard/Banners";
import { StatsOverview } from "@/components/Dashboard/StatsOverview";
import {
  ExecutionRow,
  RecentItemCard,
} from "@/components/Dashboard/RecentActions";

const Dashboard = () => {
  // Dynamic Welcome Message
  const [welcomeMessage, setWelcomeMessage] = useState("");

  useEffect(() => {
    const messages = [
      "Welcome back, User!",
      "Ready to automate the world?",
      "Your agents are waiting, User.",
      "Let's build something amazing today!",
      "Automation makes life easier, doesn't it?",
      "Good to see you again!",
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    setWelcomeMessage(randomMessage);
  }, []);

  // Mock Data
  const stats = {
    workflows: 12,
    scripts: 45,
    executions: 128,
  };

  const recentWorkflows = [
    {
      title: "Data Scraper Pro",
      type: "workflow" as const,
      date: "2 hours ago",
      status: "active" as const,
    },
    {
      title: "Email Automator",
      type: "workflow" as const,
      date: "1 day ago",
      status: "active" as const,
    },
    {
      title: "Report Generator",
      type: "workflow" as const,
      date: "3 days ago",
      status: "draft" as const,
    },
  ];

  const recentScripts = [
    { title: "Parse JSON Logs", type: "script" as const, date: "5 hours ago" },
    { title: "Image Resizer", type: "script" as const, date: "2 days ago" },
    { title: "Backup DB", type: "script" as const, date: "1 week ago" },
  ];

  const recentExecutions = [
    {
      name: "Data Scraper Pro",
      status: "success" as const,
      time: "10 mins ago",
      duration: "45s",
    },
    {
      name: "Email Automator",
      status: "failed" as const,
      time: "1 hour ago",
      duration: "12s",
    },
    {
      name: "Image Resizer",
      status: "success" as const,
      time: "3 hours ago",
      duration: "1.2m",
    },
    {
      name: "Backup DB",
      status: "running" as const,
      time: "Just now",
      duration: "5s",
    },
  ];

  return (
    <SidebarProvider>
      <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
        <DashboardSidebar />

        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <TopNav />

          <main className="flex-1 overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto">
              {/* Header */}
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  {welcomeMessage}
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  Here's what's happening with your automations today.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Main Content Area */}
                <div className="lg:col-span-3 space-y-8">
                  {/* Stats Overview */}
                  <StatsOverview stats={stats} />

                  {/* Recent Activity Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Recent Workflows */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Recent Workflows
                        </h2>
                        <Button
                          variant="link"
                          className="text-blue-600 dark:text-blue-400 p-0 h-auto"
                        >
                          View All
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {recentWorkflows.map((item, i) => (
                          <RecentItemCard key={i} item={item} />
                        ))}
                      </div>
                    </div>

                    {/* Recent Scripts */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Recent Scripts
                        </h2>
                        <Button
                          variant="link"
                          className="text-blue-600 dark:text-blue-400 p-0 h-auto"
                        >
                          View All
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {recentScripts.map((item, i) => (
                          <RecentItemCard key={i} item={item} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Recent Executions */}
                  <div className="bg-white dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700/50 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Recent Executions
                      </h2>
                      <Button variant="outline" size="sm">
                        View Logs
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {recentExecutions.map((exec, i) => (
                        <ExecutionRow key={i} execution={exec} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Sidebar / Banners */}
                <div className="lg:col-span-1 space-y-6">
                  <ProBanner />
                  <AutobotBanner />
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
