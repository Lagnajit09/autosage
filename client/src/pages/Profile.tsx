import LeftNav, { NavItems } from "@/components/LeftNav";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  UserInfo,
  StatsOverview,
  RecentActivity,
  MostUsedWorkflows,
  PlanSubscription,
  QuickLinks,
} from "@/components/profile";

const Profile = () => {
  // Mock User Data
  const user = {
    name: "John Doe",
    email: "john.doe@example.com",
    joinDate: "January 15, 2024",
    plan: "Pro Plan",
    planStatus: "Active",
    nextBilling: "December 25, 2025",
    avatar: "JD",
  };

  // Mock Statistics
  const stats = {
    workflows: { total: 12, trend: "+2 this week" },
    scripts: { total: 45, trend: "+5 new scripts" },
    executions: { total: 128, trend: "+12% this month" },
    successRate: 94.5,
  };

  // Mock Recent Activity
  const recentActivity = [
    {
      action: "Created workflow",
      name: "Data Scraper Pro",
      time: "2 hours ago",
      status: "success" as const,
    },
    {
      action: "Executed script",
      name: "Email Automator",
      time: "5 hours ago",
      status: "success" as const,
    },
    {
      action: "Execution failed",
      name: "Backup DB",
      time: "2 days ago",
      status: "failed" as const,
    },
  ];

  // Mock Most Used Workflows
  const mostUsedWorkflows = [
    { name: "Data Scraper Pro", executions: 45, successRate: 98 },
    { name: "Email Automator", executions: 32, successRate: 95 },
    { name: "Report Generator", executions: 28, successRate: 92 },
  ];

  // Plan Features
  const planFeatures = [
    "Unlimited workflows",
    "Advanced AI features",
    "Priority support",
    "Custom integrations",
    "Team collaboration",
  ];

  return (
    <SidebarProvider>
      <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
        <LeftNav />

        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6 md:p-10">
            <div className="max-w-6xl mx-auto space-y-8">
              {/* Header */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  {/* Mobile Menu */}
                  <div className="md:hidden">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-ml-2 hover:bg-gray-200 dark:hover:bg-gray-800"
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
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                      Profile
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 text-lg hidden md:block">
                      Manage your account and view your activity.
                    </p>
                  </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm md:hidden">
                  Manage your account and view your activity.
                </p>
              </div>

              <Separator className="bg-gray-200 dark:bg-gray-800" />

              {/* User Information Section */}
              <UserInfo user={user} />

              {/* Statistics Overview */}
              <StatsOverview stats={stats} />

              {/* Activity & Usage Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RecentActivity activities={recentActivity} />
                <MostUsedWorkflows workflows={mostUsedWorkflows} />
              </div>

              {/* Plan & Subscription Section */}
              <PlanSubscription user={user} planFeatures={planFeatures} />

              {/* Quick Links */}
              <QuickLinks />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Profile;
