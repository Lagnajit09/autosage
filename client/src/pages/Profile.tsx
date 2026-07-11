import { useEffect, useState, useCallback } from "react";
import { useUser, useAuth } from "@clerk/clerk-react";
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
  AutobotInsights,
  DangerZone,
} from "@/components/profile";
import { getDashboardStats, getUserProfile } from "@/lib/api/user";
import { getSettings, getDashboard, listLLMConfigs } from "@/lib/api/autobot";
import type { DashboardData, UserProfile } from "@/lib/api/user";
import type { UserSettings, AutobotDashboardData, LLMConfig } from "@/lib/api/autobot";

const planFeatures = [
  "Unlimited workflows",
  "Unlimited script executions",
  "Autobot AI assistant",
  "Vault credential management",
  "Scheduled & HTTP triggers",
];

const Profile = () => {
  const { user, isLoaded: clerkLoaded } = useUser();
  const { getToken } = useAuth();

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [autobotSettings, setAutobotSettings] = useState<UserSettings | null>(null);
  const [autobotDashboard, setAutobotDashboard] = useState<AutobotDashboardData | null>(null);
  const [llmConfigs, setLlmConfigs] = useState<LLMConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const [dash, profile, abSettings, abDash, configs] = await Promise.all([
        getDashboardStats(token),
        getUserProfile(token),
        getSettings(token),
        getDashboard(token),
        listLLMConfigs(token),
      ]);
      setDashboard(dash);
      setUserProfile(profile);
      setAutobotSettings(abSettings);
      setAutobotDashboard(abDash);
      setLlmConfigs(configs);
    } catch {
      // individual components fall back to empty/zero states
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (clerkLoaded) fetchAll();
  }, [clerkLoaded, fetchAll]);

  const handleProfileUpdate = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const profile = await getUserProfile(token);
      setUserProfile(profile);
    } catch {
      // silent
    }
  }, [getToken]);

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

              {/* User Information */}
              <UserInfo
                name={user?.fullName ?? user?.firstName ?? ""}
                email={user?.primaryEmailAddress?.emailAddress ?? ""}
                avatarUrl={user?.imageUrl ?? null}
                joinDate={
                  user?.createdAt
                    ? user.createdAt.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : ""
                }
                bio={userProfile?.bio ?? ""}
                isLoading={!clerkLoaded}
                onProfileUpdated={handleProfileUpdate}
              />

              {/* Statistics Overview */}
              <StatsOverview
                stats={dashboard?.stats ?? null}
                isLoading={isLoading}
              />

              {/* Activity & Usage Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RecentActivity
                  recentExecutions={dashboard?.recentExecutions ?? []}
                  isLoading={isLoading}
                />
                <MostUsedWorkflows
                  workflows={dashboard?.topWorkflows ?? []}
                  isLoading={isLoading}
                />
              </div>

              {/* Autobot AI Insights */}
              <AutobotInsights
                settings={autobotSettings}
                llmConfigs={llmConfigs}
                todayStats={autobotDashboard?.today ?? null}
                isLoading={isLoading}
              />

              {/* Plan & Subscription */}
              <PlanSubscription
                stats={dashboard?.stats ?? null}
                planFeatures={planFeatures}
                isLoading={isLoading}
              />

              {/* Quick Links */}
              <QuickLinks />

              {/* Danger Zone */}
              <DangerZone />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Profile;
