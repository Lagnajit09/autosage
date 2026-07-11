import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser, useAuth, useClerk } from "@clerk/clerk-react";
import LeftNav, { NavItems } from "@/components/LeftNav";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  User,
  CreditCard,
  Bell,
  Palette,
  LogOut,
  Mail,
  Menu,
  Bot,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useTheme } from "@/contexts/theme/theme-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import {
  getNotificationSettings,
  patchNotificationSettings,
} from "@/lib/api/user";
import type {
  UserNotificationSettings,
  UserNotificationSettingsUpdateBody,
} from "@/lib/api/user";
import { getSettings } from "@/lib/api/autobot";
import type { UserSettings } from "@/lib/api/autobot";

const TONE_LABELS: Record<string, string> = {
  concise: "Concise",
  balanced: "Balanced",
  detailed: "Detailed",
};

const EXPERTISE_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  expert: "Expert",
};

type NotifKey = keyof UserNotificationSettingsUpdateBody;

const Settings = () => {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();

  const [notifs, setNotifs] = useState<UserNotificationSettings | null>(null);
  const [savingKey, setSavingKey] = useState<NotifKey | null>(null);

  const name = user?.fullName ?? user?.firstName ?? "";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const [notifData] = await Promise.all([getNotificationSettings(token)]);
        if (!cancelled) {
          setNotifs(notifData);
        }
      } catch {
        // fall back to defaults; toggles stay disabled until loaded
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const handleToggle = useCallback(
    async (key: NotifKey, checked: boolean) => {
      if (!notifs) return;
      const previous = notifs[key];
      // Optimistic update
      setNotifs({ ...notifs, [key]: checked });
      setSavingKey(key);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");
        const updated = await patchNotificationSettings(
          { [key]: checked },
          token,
        );
        setNotifs(updated);
      } catch {
        // Roll back on failure
        setNotifs((prev) => (prev ? { ...prev, [key]: previous } : prev));
        toast({
          title: "Couldn't save",
          description: "Your notification preference wasn't updated.",
          variant: "destructive",
        });
      } finally {
        setSavingKey(null);
      }
    },
    [notifs, getToken],
  );

  const handleSignOut = async () => {
    await signOut();
    navigate("/signin", { replace: true });
  };

  const notifsLoaded = notifs !== null;

  return (
    <SidebarProvider>
      <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
        <LeftNav />

        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6 md:p-10">
            <div className="max-w-4xl mx-auto space-y-8">
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
                        Settings
                      </h1>
                      <p className="text-gray-500 dark:text-gray-400 mt-2 text-lg hidden md:block">
                        Manage your account, billing, and preferences.
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm md:hidden">
                  Manage your account, billing, and preferences.
                </p>
              </div>

              <Separator className="bg-gray-200 dark:bg-gray-800" />

              {/* Profile Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <User className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Profile
                  </h2>
                </div>
                <div className="bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      {user?.imageUrl ? (
                        <img
                          src={user.imageUrl}
                          alt={name}
                          className="h-16 w-16 rounded-full object-cover border border-purple-200 dark:border-purple-800"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 text-2xl font-bold border border-purple-200 dark:border-purple-800">
                          {(name || email).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                          {name || "—"}
                        </h3>
                        <div className="flex items-center text-gray-500 dark:text-gray-400 mt-1 break-all">
                          <Mail className="w-4 h-4 mr-2 shrink-0" />
                          {email}
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => navigate("/profile")}
                      variant="outline"
                      className="shrink-0 dark:bg-gray-950 dark:border-gray-800 dark:hover:bg-gray-900 dark:text-gray-200"
                    >
                      Manage Profile
                    </Button>
                  </div>
                </div>
              </section>

              {/* Billing Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Billing & Subscription
                  </h2>
                </div>
                <div className="bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-medium text-gray-900 dark:text-white">
                          Current Plan:{" "}
                          <span className="text-purple-600 dark:text-purple-400">
                            Free Plan
                          </span>
                        </h3>
                        <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium border border-green-200 dark:border-green-800">
                          Active
                        </span>
                      </div>
                      <p className="text-gray-500 text-sm dark:text-gray-400 mt-1">
                        Upgrade for higher limits and premium features.
                      </p>
                    </div>
                    <Button
                      onClick={() => navigate("/billing")}
                      className="shrink-0 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-none"
                    >
                      Manage Subscription
                    </Button>
                  </div>
                </div>
              </section>

              {/* General Settings Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Appearance */}
                <section className="flex flex-col space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Palette className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Appearance
                    </h2>
                  </div>
                  <div className="bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-base font-medium text-gray-900 dark:text-white">
                          Dark Mode
                        </Label>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Switch between light and dark themes.
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="theme-mode"
                          checked={isDark}
                          onCheckedChange={toggleTheme}
                          className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600 data-[state=unchecked]:border-gray-800"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Notifications */}
                <section className="flex flex-col space-y-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Bell className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Notifications
                      </h2>
                    </div>
                    {savingKey && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Saving…
                      </span>
                    )}
                  </div>
                  <div className="bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm flex-1 space-y-4">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="email-notifs"
                        className="text-gray-700 dark:text-gray-300"
                      >
                        Email Notifications
                      </Label>
                      <Checkbox
                        id="email-notifs"
                        checked={notifs?.email_notifications ?? false}
                        disabled={!notifsLoaded}
                        onCheckedChange={(c) =>
                          handleToggle("email_notifications", c === true)
                        }
                        className="data-[state=checked]:bg-purple-600 dark:data-[state=unchecked]:border-gray-400"
                      />
                    </div>
                    <Separator className="bg-gray-100 dark:bg-gray-800" />
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="push-notifs"
                        className="text-gray-700 dark:text-gray-300"
                      >
                        Push Notifications
                      </Label>
                      <Checkbox
                        id="push-notifs"
                        checked={notifs?.push_notifications ?? false}
                        disabled={!notifsLoaded}
                        onCheckedChange={(c) =>
                          handleToggle("push_notifications", c === true)
                        }
                        className="data-[state=checked]:bg-purple-600 dark:data-[state=unchecked]:border-gray-400"
                      />
                    </div>
                    <Separator className="bg-gray-100 dark:bg-gray-800" />
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="marketing-emails"
                        className="text-gray-700 dark:text-gray-300"
                      >
                        Marketing Emails
                      </Label>
                      <Checkbox
                        id="marketing-emails"
                        checked={notifs?.marketing_emails ?? false}
                        disabled={!notifsLoaded}
                        onCheckedChange={(c) =>
                          handleToggle("marketing_emails", c === true)
                        }
                        className="data-[state=checked]:bg-purple-600 dark:data-[state=unchecked]:border-gray-400"
                      />
                    </div>
                  </div>
                </section>
              </div>

              <div className="flex justify-end pt-6">
                <Button
                  variant="destructive"
                  className="bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-900/50"
                  onClick={handleSignOut}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Settings;
