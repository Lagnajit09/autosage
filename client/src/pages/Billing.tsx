import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import LeftNav, { NavItems } from "@/components/LeftNav";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard,
  Download,
  CheckCircle2,
  AlertCircle,
  Menu,
  Zap,
  Crown,
  RefreshCw,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getSubscription,
  createCheckout,
  createCreditsCheckout,
  verifyCreditsPayment,
  cancelSubscription,
  getInvoices,
  type Subscription,
  type Invoice,
} from "@/lib/api/billing";
import ProActivationOverlay, {
  type ActivationState,
} from "@/components/billing/ProActivationOverlay";

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
    };
  }
}

const loadRazorpay = async (): Promise<void> => {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay failed to load"));
    document.body.appendChild(script);
  });
};

function usagePercent(used: number, limit: number | null): number {
  if (limit === null || limit === 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function limitLabel(limit: number | null): string {
  return limit === null ? "Unlimited" : String(limit);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatInvoiceDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const Billing = () => {
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<"monthly" | "yearly" | null>(null);
  const [dayPassLoading, setDayPassLoading] = useState(false);
  const [activation, setActivation] = useState<{
    open: boolean;
    state: ActivationState;
    label: string;
  }>({ open: false, state: "activating", label: "Pro Plan" });
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const data = await getSubscription(token);
      setSub(data);
    } catch (e) {
      setError("Failed to load subscription.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const loadInvoices = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setInvoicesLoading(true);
    try {
      const data = await getInvoices(token);
      setInvoices(data);
    } catch {
      // fail silently — empty table is better than error
    } finally {
      setInvoicesLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  // Poll the subscription until `predicate` holds, driving the activation
  // overlay in place (no reload). Also refreshes invoices on success.
  const pollUntilActivated = useCallback(
    async (label: string, predicate: (s: Subscription) => boolean) => {
      setActivation({ open: true, state: "activating", label });
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const t = await getToken();
        if (t) {
          try {
            const updated = await getSubscription(t);
            if (predicate(updated)) {
              setSub(updated);
              setActivation({ open: true, state: "success", label });
              void loadInvoices();
              await new Promise((r) => setTimeout(r, 1800));
              setActivation((a) => ({ ...a, open: false }));
              return;
            }
          } catch { /* keep polling */ }
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      setActivation((a) => ({ ...a, open: false }));
      await loadSubscription();
    },
    [getToken, loadSubscription, loadInvoices],
  );

  const handleUpgrade = async (interval: "monthly" | "yearly") => {
    const token = await getToken();
    if (!token) return;

    setCheckoutLoading(interval);
    try {
      const session = await createCheckout(token, interval);

      if (session.already_subscribed) {
        setCheckoutLoading(null);
        return;
      }

      await loadRazorpay();

      const rzp = new window.Razorpay({
        key: session.key_id,
        subscription_id: session.subscription_id,
        name: "Autosage",
        description: `Pro Plan — ${interval === "monthly" ? "$15/month" : "$120/year"}`,
        image: "/icon.png",
        theme: { color: "#7c3aed" },
        handler: () => {
          void pollUntilActivated("Pro Plan", (s) => s.plan === "pro" && !s.day_pass.active);
        },
      });
      rzp.open();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Checkout failed.";
      setError(msg);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleDayPass = async () => {
    const token = await getToken();
    if (!token) return;
    setDayPassLoading(true);
    setError(null);
    try {
      const order = await createCreditsCheckout(token);
      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: "Autosage",
        description: "Pro Day Pass — 24 hours of Pro",
        image: "/icon.png",
        theme: { color: "#7c3aed" },
        handler: async (response: RazorpayResponse) => {
          setActivation({ open: true, state: "activating", label: "Pro Day Pass" });
          try {
            const t = await getToken();
            if (t) {
              await verifyCreditsPayment(t, {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
            }
          } catch {
            // Verify may race the webhook; polling below confirms the grant.
          }
          await pollUntilActivated("Pro Day Pass", (s) => s.day_pass.active);
        },
      });
      rzp.open();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not start the Day Pass checkout.");
    } finally {
      setDayPassLoading(false);
    }
  };

  const handleCancel = async () => {
    const token = await getToken();
    if (!token) return;
    setCancelLoading(true);
    try {
      await cancelSubscription(token);
      await loadSubscription();
      setCancelDialogOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Cancellation failed.";
      setError(msg);
    } finally {
      setCancelLoading(false);
    }
  };

  const planName = sub?.plan_display.name ?? "Free";
  const isPro = sub?.plan === "pro";
  const isFree = sub?.plan === "free";
  const isAdmin = sub?.is_admin;
  const dayPass = sub?.day_pass;
  const dayPassPrice = dayPass
    ? `${dayPass.currency === "INR" ? "₹" : ""}${(dayPass.amount / 100).toFixed(0)}`
    : "₹99";

  return (
    <SidebarProvider>
      <ProActivationOverlay
        open={activation.open}
        state={activation.state}
        planLabel={activation.label}
      />
      <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
        <LeftNav />

        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6 md:p-10">
            <div className="max-w-5xl mx-auto space-y-8">
              {/* Header */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="md:hidden">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="-ml-2 hover:bg-gray-200 dark:hover:bg-gray-800">
                          <Menu className="h-6 w-6 text-gray-800 dark:text-gray-200" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="left" className="w-[250px] sm:w-[300px] bg-gray-100 dark:bg-gray-900 dark:border-gray-800">
                        <SheetHeader>
                          <div className="flex items-center gap-3">
                            <img src="/icon.png" alt="AutoSage Icon" className="w-10 h-10 object-contain rounded-full shadow-sm" />
                            <div className="flex flex-col items-start">
                              <h1 className="text-gray-950 dark:text-gray-100 font-semibold text-xl tracking-tight leading-tight">Autosage</h1>
                              <p className="text-sidebar-foreground text-xs font-medium">Automation Hub</p>
                            </div>
                          </div>
                        </SheetHeader>
                        <NavItems mobile />
                      </SheetContent>
                    </Sheet>
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Billing & Subscription</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 text-lg hidden md:block">Manage your plan, payment methods, and invoices.</p>
                  </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm md:hidden">Manage your plan, payment methods, and invoices.</p>
              </div>

              <Separator className="bg-gray-200 dark:bg-gray-800" />

              {error && (
                <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                  <button onClick={() => setError(null)} className="ml-auto text-xs underline">Dismiss</button>
                </div>
              )}

              <Tabs defaultValue="overview" className="w-full space-y-6">
                <TabsList className="bg-gray-100 dark:bg-gray-900/50 p-1 border border-gray-200 dark:border-gray-800">
                  <TabsTrigger value="overview" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:shadow-sm dark:data-[state=active]:text-gray-200">Overview</TabsTrigger>
                  <TabsTrigger value="invoices" onClick={loadInvoices} className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:shadow-sm dark:data-[state=active]:text-gray-200">Invoices</TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-6">
                  {loading ? (
                    <div className="text-center py-16 text-gray-400">Loading subscription...</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Current Plan Card */}
                      <Card className="md:col-span-2 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-xl text-gray-900 dark:text-white flex items-center gap-2">
                                {isAdmin && <Crown className="w-5 h-5 text-yellow-500" />}
                                {isPro && <Zap className="w-5 h-5 text-purple-500" />}
                                Current Plan
                              </CardTitle>
                              <CardDescription className="mt-2">
                                You are on the{" "}
                                <span className="font-semibold text-purple-600 dark:text-purple-400">
                                  {isAdmin
                                    ? "Enterprise (Admin)"
                                    : dayPass?.active
                                    ? "Pro (Day Pass)"
                                    : `${planName} Plan`}
                                </span>
                              </CardDescription>
                            </div>
                            <Badge
                              variant="secondary"
                              className={
                                sub?.status === "cancelled"
                                  ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                  : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800"
                              }
                            >
                              {sub?.status === "cancelled" ? "Cancels at period end" : "Active"}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {dayPass?.active ? (
                            <>
                              <div className="text-3xl font-bold text-gray-900 dark:text-white">
                                {dayPassPrice} / 24 hrs
                              </div>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                Pass expires {formatDate(dayPass.expires_at)}
                              </p>
                            </>
                          ) : (
                            <>
                              {isFree && !isAdmin && (
                                <div className="text-3xl font-bold text-gray-900 dark:text-white">$0 / month</div>
                              )}
                              {isPro && (
                                <div className="text-3xl font-bold text-gray-900 dark:text-white">
                                  {sub?.billing_interval === "yearly" ? "$120 / year" : "$15 / month"}
                                </div>
                              )}
                              {sub?.current_period_end && (
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {sub.status === "cancelled" ? "Access until" : "Renews on"}{" "}
                                  {formatDate(sub.current_period_end)}
                                </p>
                              )}
                            </>
                          )}
                          {/* Plan features */}
                          <div className="space-y-2 mt-4">
                            {[
                              `${limitLabel(sub?.limits.max_workflows ?? 5)} workflows`,
                              `${limitLabel(sub?.limits.max_scripts ?? 10)} scripts`,
                              `${limitLabel(sub?.limits.max_workflow_runs_per_month ?? 30)} workflow runs / month`,
                              `${limitLabel(sub?.limits.max_script_executions_per_month ?? 50)} script executions / month`,
                              sub?.execution_mode ? "Execution mode (AI-driven runs)" : null,
                            ]
                              .filter(Boolean)
                              .map((f, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                                  <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                  {f}
                                </div>
                              ))}
                          </div>
                        </CardContent>
                        {!isAdmin && (
                          <CardFooter className="flex flex-col gap-4 border-t border-gray-100 dark:border-gray-800 pt-6">
                            <div className="flex flex-wrap gap-3">
                              {isFree && (
                                <>
                                  <Button
                                    onClick={() => handleUpgrade("monthly")}
                                    disabled={checkoutLoading !== null}
                                    className="bg-purple-600 hover:bg-purple-700 text-white"
                                  >
                                    {checkoutLoading === "monthly" ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                                    Upgrade — $15/mo
                                  </Button>
                                  <Button
                                    onClick={() => handleUpgrade("yearly")}
                                    disabled={checkoutLoading !== null}
                                    variant="outline"
                                    className="dark:bg-transparent dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                                  >
                                    {checkoutLoading === "yearly" ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                                    Upgrade — $120/yr (save 33%)
                                  </Button>
                                </>
                              )}
                              {/* A day pass reports plan="pro" but has no real subscription to cancel. */}
                              {isPro && !dayPass?.active && sub?.status !== "cancelled" && (
                                <>
                                  <Button onClick={() => navigate("/plans")} variant="outline" className="dark:bg-transparent dark:border-gray-700 dark:text-gray-300">
                                    Change Plan
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    className="text-red-600 hover:text-red-700 dark:text-red-400"
                                    onClick={() => setCancelDialogOpen(true)}
                                  >
                                    Cancel Subscription
                                  </Button>
                                </>
                              )}
                            </div>

                            {/* One-time Pro Day Pass */}
                            {dayPass && (
                              <div className="w-full rounded-lg border border-dashed border-purple-300 dark:border-purple-800/60 bg-purple-50/50 dark:bg-purple-900/10 p-4">
                                {dayPass.active ? (
                                  <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300">
                                    <Zap className="w-4 h-4 shrink-0" />
                                    <span>
                                      Pro Day Pass active — expires{" "}
                                      <span className="font-semibold">{formatDate(dayPass.expires_at)}</span>.
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                                        Pro Day Pass
                                      </p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Try Pro for 24 hours — {dayPassPrice}. Once per week.
                                      </p>
                                    </div>
                                    {dayPass.available ? (
                                      <Button
                                        onClick={handleDayPass}
                                        disabled={dayPassLoading}
                                        variant="secondary"
                                        size="sm"
                                        className="shrink-0"
                                      >
                                        {dayPassLoading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                                        Get Day Pass — {dayPassPrice}
                                      </Button>
                                    ) : (
                                      <Button variant="secondary" size="sm" disabled className="shrink-0">
                                        {dayPass.next_available_at
                                          ? `Available again ${formatDate(dayPass.next_available_at)}`
                                          : "Unavailable"}
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </CardFooter>
                        )}
                      </Card>

                      {/* Usage Card */}
                      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                        <CardHeader>
                          <CardTitle className="text-lg text-gray-900 dark:text-white">Usage This Month</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {sub && (
                            <>
                              <UsageBar
                                label="Workflows"
                                used={sub.usage.workflows}
                                limit={sub.limits.max_workflows}
                              />
                              <UsageBar
                                label="Scripts"
                                used={sub.usage.scripts}
                                limit={sub.limits.max_scripts}
                              />
                              <UsageBar
                                label="Workflow runs"
                                used={sub.usage.workflow_runs_this_month}
                                limit={sub.limits.max_workflow_runs_per_month}
                              />
                              <UsageBar
                                label="Script executions"
                                used={sub.usage.script_executions_this_month}
                                limit={sub.limits.max_script_executions_per_month}
                              />
                              <UsageBar
                                label="Vault entries"
                                used={sub.usage.vault_entries}
                                limit={sub.limits.max_vault_entries}
                              />
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </TabsContent>

                {/* Invoices Tab */}
                <TabsContent value="invoices" className="space-y-6">
                  <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                    <CardHeader>
                      <CardTitle className="text-xl text-gray-900 dark:text-white">Billing History</CardTitle>
                      <CardDescription>Your past invoices from Razorpay.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {invoicesLoading ? (
                        <div className="text-center py-8 text-gray-400 text-sm">Loading invoices...</div>
                      ) : invoices.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-sm">No invoices yet.</div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent border-gray-200 dark:border-gray-800">
                              <TableHead>Invoice</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invoices.map((inv) => (
                              <TableRow key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 border-gray-200 dark:border-gray-800">
                                <TableCell className="font-medium text-gray-900 dark:text-white">{inv.invoice_number}</TableCell>
                                <TableCell className="text-gray-500 dark:text-gray-400">{formatInvoiceDate(inv.date)}</TableCell>
                                <TableCell className="text-gray-900 dark:text-white">
                                  {inv.currency} {inv.amount.toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800 capitalize">
                                    {inv.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Security note */}
              <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/30">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900 dark:text-blue-300">Secure Payment Processing</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                    All payments are processed securely via Razorpay. We do not store your card information.
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Cancel confirmation dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Your Pro access continues until the end of the current billing period. After that your account reverts to the Free plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700">Keep Plan</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {cancelLoading ? "Cancelling..." : "Yes, cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = usagePercent(used, limit);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{label}</span>
        <span>
          {used} / {limitLabel(limit)}
        </span>
      </div>
      {limit !== null ? (
        <Progress value={pct} className="h-1.5 bg-gray-100 dark:bg-gray-800 [&>div]:bg-purple-500" />
      ) : (
        <div className="h-1.5 rounded-full bg-green-200 dark:bg-green-900/40" />
      )}
    </div>
  );
}

export default Billing;
