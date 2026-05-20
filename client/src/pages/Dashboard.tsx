import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2 } from "lucide-react";
import { DashboardSidebar } from "@/components/Dashboard/Sidebar";
import TopNav from "@/components/Dashboard/TopNav";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ProBanner, AutobotBanner } from "@/components/Dashboard/Banners";
import { StatsOverview } from "@/components/Dashboard/StatsOverview";
import {
  ExecutionRow,
  RecentItemCard,
} from "@/components/Dashboard/RecentActions";
import { useAuth, useUser } from "@clerk/clerk-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/api-client";

const Dashboard = () => {
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();

  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [showFirstVisitWelcome, setShowFirstVisitWelcome] = useState(false);
  const [setupTimer, setSetupTimer] = useState(0);

  // TODO: Remove this in Production
  // useEffect(() => {
  //   const getClerkToken = async () => {
  //     try {
  //       const clerkToken = await getToken({ template: "LongLivedJWT" });
  //       // console.log("LongLivedJWT clerkToken", clerkToken);
  //     } catch (error) {
  //       console.error("Failed to get token:", error);
  //     }
  //   };
  //   getClerkToken();
  // }, [getToken]);

  useEffect(() => {
    if (showFirstVisitWelcome) {
      const interval = setInterval(() => {
        setSetupTimer((prev) => (prev < 3 ? prev + 1 : prev));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [showFirstVisitWelcome]);

  useEffect(() => {
    if (user) {
      const messages = [
        `Welcome back, ${user.firstName || "User"}!`,
        "Ready to automate the world?",
        `Your agents are waiting, ${user.firstName || "User"}.`,
        "Let's build something amazing today!",
        "Automation makes life easier, doesn't it?",
        "Good to see you again!",
      ];
      const randomMessage =
        messages[Math.floor(Math.random() * messages.length)];
      setWelcomeMessage(randomMessage);

      // Check for first visit
      const hasSeenWelcome = localStorage.getItem("hasSeenWelcome");
      if (!hasSeenWelcome) {
        setShowFirstVisitWelcome(true);

        // Sync user with backend
        const syncUser = async () => {
          try {
            const token = await getToken();
            if (token) {
              await apiRequest(
                "/api/user/update/",
                {
                  method: "POST",
                  body: JSON.stringify({
                    first_name: user.firstName,
                    last_name: user.lastName,
                    email: user.primaryEmailAddress?.emailAddress,
                  }),
                },
                token,
              );
              console.log("User synced with backend successfully");
            }
          } catch (error) {
            console.error("Failed to sync user with backend:", error);
          }
        };

        syncUser();

        setTimeout(() => {
          setShowFirstVisitWelcome(false);
          localStorage.setItem("hasSeenWelcome", "true");
        }, 3500);
      }
    }
  }, [user, getToken]);

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    workflows: 0,
    workflows_current_month: 0,
    scripts: 0,
    scripts_current_month: 0,
    executions: 0,
    executions_current_month: 0,
  });
  const [recentWorkflows, setRecentWorkflows] = useState<any[]>([]);
  const [recentScripts, setRecentScripts] = useState<any[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<any[]>([]);

  const getRelativeTime = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "Just now";
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} mins ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return diffInHours === 1 ? "1 hour ago" : `${diffInHours} hours ago`;
    }
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return "yesterday";
    if (diffInDays < 30) return `${diffInDays} days ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const token = await getToken();
        if (token) {
          const response = await apiRequest("/api/dashboard/", { method: "GET" }, token);
          if (response.success && response.data) {
            setStats(response.data.stats);
            setRecentWorkflows(
              response.data.recentWorkflows.map((item: any) => ({
                ...item,
                date: getRelativeTime(item.date),
              }))
            );
            setRecentScripts(
              response.data.recentScripts.map((item: any) => ({
                ...item,
                date: getRelativeTime(item.date),
              }))
            );
            setRecentExecutions(
              response.data.recentExecutions.map((item: any) => ({
                ...item,
                time: getRelativeTime(item.time),
              }))
            );
          }
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchDashboardData();
    }
  }, [user, getToken]);



  return (
    <SidebarProvider>
      <AnimatePresence>
        {showFirstVisitWelcome && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white dark:bg-workflow-void"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 1.1, opacity: 0, y: -20 }}
              transition={{ delay: 0.2, duration: 0.8, ease: "easeOut" }}
              className="text-center space-y-8"
            >
              <div className="space-y-4">
                <div className="relative inline-block">
                  <div className="absolute -inset-4 dark:bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full blur-2xl opacity-20 animate-pulse" />
                  <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
                    Welcome, {user?.firstName || "Explorer"}
                  </h1>
                </div>
                <p className="text-xl text-gray-500 dark:text-gray-400 font-medium">
                  Your journey with AutoSage begins here.
                </p>
              </div>

              <div className="flex flex-col items-center gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3 px-6 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-full border border-gray-200 dark:border-gray-700/50 shadow-sm transition-all duration-300">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Setting up your account...
                    </span>
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-mono text-sm font-bold">
                      {setupTimer}s
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 max-w-[280px] leading-relaxed">
                  We are setting up your account, please wait...
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
        <DashboardSidebar />

        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <TopNav />

          <main className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex h-full w-full items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 animate-pulse">
                    Loading Dashboard...
                  </span>
                </div>
              </div>
            ) : (
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
                  {recentWorkflows.length === 0 &&
                    recentScripts.length === 0 &&
                    recentExecutions.length === 0 ? (
                    <div className="lg:col-span-3 flex flex-col items-center justify-center min-h-[400px] text-center space-y-6 bg-white dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700/50 border-dashed p-12">
                      <div className="space-y-4 flex flex-col items-center">
                        <img
                          src="/logo.png"
                          alt="AutoSage Logo"
                          className="w-auto h-12 object-contain"
                        />
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                          Welcome to AutoSage
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                          It looks like you haven't created anything yet. Start
                          your automation journey by building your first workflow.
                        </p>
                      </div>
                      <Button
                        size="lg"
                        className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                        onClick={() => navigate("/workflow")}
                      >
                        <Plus className="w-5 h-5" />
                        Start Building Your First Workflow
                      </Button>
                    </div>
                  ) : (
                    <div className="lg:col-span-3 space-y-8">
                      {/* Stats Overview */}
                      <StatsOverview stats={stats} />

                      {/* Recent Activity Grid */}
                      {(recentWorkflows.length > 0 ||
                        recentScripts.length > 0) && (
                          <div
                            className={`grid grid-cols-1 ${recentWorkflows.length > 0 && recentScripts.length > 0
                              ? "md:grid-cols-2"
                              : ""
                              } gap-6`}
                          >
                            {/* Recent Workflows */}
                            {recentWorkflows.length > 0 && (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Recent Workflows
                                  </h2>

                                  <Button
                                    variant="link"
                                    className="text-blue-600 dark:text-blue-400 p-0 h-auto"
                                    onClick={() => navigate("/workflows")}
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
                            )}

                            {/* Recent Scripts */}
                            {recentScripts.length > 0 && (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Recent Scripts
                                  </h2>

                                  <Button
                                    variant="link"
                                    className="text-blue-600 dark:text-blue-400 p-0 h-auto"
                                    onClick={() => navigate("/script-editor/")}
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
                            )}
                          </div>
                        )}

                      {/* Recent Executions */}
                      {recentExecutions.length > 0 && (
                        <div className="bg-white dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700/50 p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                              Recent Executions
                            </h2>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate("/execution-logs")}
                            >
                              View Logs
                            </Button>
                          </div>

                          <div className="space-y-1">
                            {recentExecutions.map((exec, i) => (
                              <ExecutionRow key={i} execution={exec} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Right Sidebar / Banners */}
                  <div className="lg:col-span-1 space-y-6">
                    <ProBanner />
                    <AutobotBanner />
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
