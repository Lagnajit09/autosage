import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LeftNav, { NavItems } from "@/components/LeftNav";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  User,
  CreditCard,
  Bell,
  Shield,
  Palette,
  LogOut,
  Mail,
  Menu,
} from "lucide-react";
import { useTheme } from "@/provider/theme-provider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";

const Settings = () => {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  // Mock User Data
  const user = {
    name: "John Doe",
    email: "john.doe@example.com",
    plan: "Pro Plan",
    nextBilling: "December 25, 2025",
  };

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
                      Settings
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 text-lg hidden md:block">
                      Manage your account, billing, and preferences.
                    </p>
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
                      <div className="h-16 w-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 text-2xl font-bold border border-purple-200 dark:border-purple-800">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                          {user.name}
                        </h3>
                        <div className="flex items-center text-gray-500 dark:text-gray-400 mt-1 break-words">
                          <Mail className="w-4 h-4 mr-2" />
                          {user.email}
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
                            {user.plan}
                          </span>
                        </h3>
                        <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium border border-green-200 dark:border-green-800">
                          Active
                        </span>
                      </div>
                      <p className="text-gray-500 text-sm dark:text-gray-400 mt-1">
                        Next billing date: {user.nextBilling}
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
                  <div className="flex items-center gap-2 mb-2">
                    <Bell className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Notifications
                    </h2>
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
                        defaultChecked
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
                        defaultChecked
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
                        className="data-[state=checked]:bg-purple-600 dark:data-[state=unchecked]:border-gray-400"
                      />
                    </div>
                  </div>
                </section>
              </div>

              {/* Security / API Keys */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Security & API
                  </h2>
                </div>
                <div className="bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="api-key"
                        className="text-gray-700 dark:text-gray-300"
                      >
                        OpenAI API Key
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="api-key"
                          type="password"
                          placeholder="sk-..."
                          defaultValue="sk-************************"
                          className="font-mono bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800 dark:text-gray-200 dark:placeholder:text-gray-200"
                        />
                        <Button
                          variant="outline"
                          className="dark:bg-gray-950 dark:border-gray-800 dark:text-gray-200"
                        >
                          Update
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Your API key is stored locally and used for AI features.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <div className="flex justify-end pt-6">
                <Button
                  variant="destructive"
                  className="bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-900/50"
                  onClick={() => navigate("/signin")}
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
