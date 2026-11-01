import { useEffect, useState, useCallback } from "react";
import { useUser, useAuth } from "@clerk/clerk-react";
import LeftNav, { NavItems } from "@/components/LeftNav";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Activity, CreditCard, Menu } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutobotIcon } from "@/components/AutobotIcon";
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
  SageCodeSessions,
  DangerZone,
} from "@/components/profile";
import { getDashboardStats, getUserProfile } from "@/lib/api/user";
import { getSettings, getDashboard, listLLMConfigs } from "@/lib/api/autobot";
import { getSubscription } from "@/lib/api/billing";
import type { DashboardData, UserProfile } from "@/lib/api/user";
import type {
  UserSettings,
  AutobotDashboardData,
  LLMConfig,
} from "@/lib/api/autobot";
import type { Subscription } from "@/lib/api/billing";

const TABS = [
  {
    value: "activity",
    label: "Usage & Activity",
    icon: <Activity className="h-4 w-4" />,
  },
  { value: "autobot", label: "Autobot", icon: <AutobotIcon size={16} /> },
  {
    value: "sagecode",
    label: "SageCode",
    icon: (
      <>
        <img
          src="/sagecode-mark-light.svg"
          alt=""
          className="h-3.5 w-auto dark:hidden"
        />
        <img
          src="/sagecode-mark-dark.svg"
          alt=""
          className="hidden h-3.5 w-auto dark:block"
        />
      </>
    ),
  },
  {
    value: "plan",
    label: "Plans & Subscription",
    icon: <CreditCard className="h-4 w-4" />,
  },
];
const DEFAULT_TAB = "activity";

const Profile = () => {
  const { user, isLoaded: clerkLoaded } = useUser();
  const { getToken } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // The open tab is the URL hash (#autobot, #sagecode, #plan); none = the first.
  const hashTab = location.hash.slice(1);
  const tab = TABS.some((t) => t.value === hashTab) ? hashTab : DEFAULT_TAB;
  const selectTab = (value: string) =>
    navigate({ hash: value === DEFAULT_TAB ? "" : value }, { replace: true });

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [autobotSettings, setAutobotSettings] = useState<UserSettings | null>(
    null,
  );
  const [autobotDashboard, setAutobotDashboard] =
    useState<AutobotDashboardData | null>(null);
  const [llmConfigs, setLlmConfigs] = useState<LLMConfig[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const [dash, profile, abSettings, abDash, configs, sub] =
        await Promise.all([
          getDashboardStats(token),
          getUserProfile(token),
          getSettings(token),
          getDashboard(token),
          listLLMConfigs(token),
          getSubscription(token),
        ]);
      setDashboard(dash);
      setUserProfile(profile);
      setAutobotSettings(abSettings);
      setAutobotDashboard(abDash);
      setLlmConfigs(configs);
      setSubscription(sub);
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

                  <div className="flex items-center gap-4">
                    <img
                      src="/logo.png"
                      alt="AutoSage Logo"
                      className="h-10 md:h-12 w-auto rounded-full object-contain"
                    />
                    <div>
                      <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                        Profile
                      </h1>
                      <p className="text-gray-500 dark:text-gray-400 mt-2 text-lg hidden md:block">
                        Manage your account and view your activity.
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm md:hidden">
                  Manage your account and view your activity.
                </p>
              </div>

              <Separator className="bg-gray-200 dark:bg-gray-800" />

              {/* Account: the same whichever tab is open */}
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

              <Separator className="bg-gray-200 dark:bg-gray-800" />

              {/* Sections, one tab each. The tab lives in the URL hash so links
                  like /profile#sagecode open on it. */}
              <Tabs value={tab} onValueChange={selectTab} className="space-y-6">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 border border-gray-200 bg-gray-100 p-1 dark:border-gray-800 dark:bg-gray-900/50 sm:inline-flex sm:w-auto">
                  {TABS.map(({ value, label, icon }) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="gap-2 px-3 py-1.5 text-gray-600 dark:text-gray-400 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm dark:data-[state=active]:bg-gray-800 dark:data-[state=active]:text-gray-100"
                    >
                      {icon}
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="activity" className="mt-0 space-y-8">
                  <StatsOverview
                    stats={dashboard?.stats ?? null}
                    isLoading={isLoading}
                  />
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
                </TabsContent>

                <TabsContent value="autobot" className="mt-0">
                  <AutobotInsights
                    settings={autobotSettings}
                    llmConfigs={llmConfigs}
                    todayStats={autobotDashboard?.today ?? null}
                    isLoading={isLoading}
                  />
                </TabsContent>

                <TabsContent value="sagecode" className="mt-0">
                  <SageCodeSessions />
                </TabsContent>

                <TabsContent value="plan" className="mt-0">
                  <PlanSubscription
                    subscription={subscription}
                    isLoading={isLoading}
                  />
                </TabsContent>
              </Tabs>

              <Separator className="bg-gray-200 dark:bg-gray-800" />

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
