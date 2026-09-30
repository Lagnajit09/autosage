import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import LeftNav from "@/components/LeftNav";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, RefreshCw } from "lucide-react";
import {
  getSubscription,
  getPublicPlans,
  createCheckout,
  createCreditsCheckout,
  verifyCreditsPayment,
  type PlanKey,
  type Subscription,
} from "@/lib/api/billing";
import {
  PLAN_DESCRIPTIONS,
  dayPassDuration,
  formatMinorAmount,
  formatUsd,
  planFeatures,
  yearlySavingsPct,
} from "@/lib/plans";

const PLAN_STYLE: Record<PlanKey, { color: string; border: string }> = {
  free: {
    color: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
  },
  pro: {
    color: "bg-purple-50 dark:bg-purple-900/20",
    border: "border-purple-200 dark:border-purple-800",
  },
  enterprise: {
    color: "bg-orange-50 dark:bg-orange-900/20",
    border: "border-orange-200 dark:border-orange-800",
  },
};
import ProActivationOverlay, {
  type ActivationState,
} from "@/components/billing/ProActivationOverlay";
import EnterpriseContactDialog from "@/components/billing/EnterpriseContactDialog";

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const loadRazorpay = async (): Promise<void> => {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Razorpay failed to load"));
    document.body.appendChild(s);
  });
};

const Plans = () => {
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [sub, setSub] = useState<Subscription | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<"monthly" | "yearly" | null>(null);
  const [dayPassLoading, setDayPassLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Post-payment activation overlay
  const [activation, setActivation] = useState<{
    open: boolean;
    state: ActivationState;
    label: string;
  }>({ open: false, state: "activating", label: "Pro Plan" });

  // Enterprise contact dialog
  const [contactOpen, setContactOpen] = useState(false);

  // Server catalogue, so the limits and prices shown to a buyer are exactly
  // what the backend enforces (the public landing page uses a static copy).
  const {
    data: catalogue,
    isLoading: plansLoading,
    isError: plansError,
    refetch: refetchPlans,
    isFetching: plansFetching,
  } = useQuery({
    queryKey: ["public-plans"],
    queryFn: getPublicPlans,
    staleTime: Infinity,
    retry: 1,
  });
  const proPlan = catalogue?.find((p) => p.key === "pro");

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        setSub(await getSubscription(token));
      } catch { /* silent */ }
    })();
  }, [getToken]);

  // Poll the subscription until `predicate` is satisfied, driving the
  // activation overlay: "activating" while polling → "success" → auto-close,
  // with the fresh subscription applied in place (no reload/navigation).
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
              await new Promise((r) => setTimeout(r, 1800));
              setActivation((a) => ({ ...a, open: false }));
              return;
            }
          } catch { /* keep polling */ }
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      // Timed out — close the overlay and refresh whatever we have.
      setActivation((a) => ({ ...a, open: false }));
      const t = await getToken();
      if (t) {
        try {
          setSub(await getSubscription(t));
        } catch { /* silent */ }
      }
    },
    [getToken],
  );

  const handleUpgrade = useCallback(async (interval: "monthly" | "yearly") => {
    const token = await getToken();
    if (!token) return;
    setCheckoutLoading(interval);
    setError(null);
    try {
      const session = await createCheckout(token, interval);
      if (session.already_subscribed) {
        navigate("/billing");
        return;
      }
      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: session.key_id,
        subscription_id: session.subscription_id,
        name: "Autosage",
        description: proPlan
          ? `Pro Plan — ${
              interval === "monthly"
                ? `${formatUsd(proPlan.price_monthly ?? 0)}/month`
                : `${formatUsd(proPlan.price_yearly ?? 0)}/year`
            }`
          : "Pro Plan",
        image: "/icon.png",
        theme: { color: "#7c3aed" },
        handler: () => {
          void pollUntilActivated("Pro Plan", (s) => s.plan === "pro" && !s.day_pass.active);
        },
      });
      rzp.open();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Checkout failed. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  }, [getToken, navigate, pollUntilActivated, proPlan]);

  const handleDayPass = useCallback(async () => {
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
          // Show the activation overlay immediately, then verify + poll.
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
  }, [getToken, pollUntilActivated]);

  const currentPlan = sub?.plan ?? "free";
  const dayPass = sub?.day_pass;
  const dayPassPrice = dayPass
    ? formatMinorAmount(dayPass.amount, dayPass.currency)
    : "";
  const dayPassLength = dayPassDuration(proPlan?.day_pass?.days ?? 1);
  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      <ProActivationOverlay
        open={activation.open}
        state={activation.state}
        planLabel={activation.label}
      />
      <LeftNav />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-6 py-12">
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold tracking-tight mb-4 text-gray-900 dark:text-white">
              Choose Your Plan
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-lg max-w-2xl mx-auto">
              Select the perfect plan for your automation needs. Upgrade or downgrade at any time.
            </p>
          </div>

          {error && (
            <div className="max-w-2xl mx-auto mb-8 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {plansLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[520px] rounded-xl border-2 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 animate-pulse"
                />
              ))}
            </div>
          ) : plansError || !catalogue?.length ? (
            <div className="max-w-md mx-auto text-center space-y-4 py-10">
              <p className="text-gray-500 dark:text-gray-400">
                We couldn't load the plans right now.
              </p>
              <Button
                variant="outline"
                onClick={() => refetchPlans()}
                disabled={plansFetching}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${plansFetching ? "animate-spin" : ""}`} />
                Try again
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {catalogue.map((plan) => {
                const isCurrent = currentPlan === plan.key || (sub?.is_admin && plan.key === "enterprise");
                const style = PLAN_STYLE[plan.key] ?? PLAN_STYLE.free;
                const isCustom = plan.price_monthly === null;
                const savings =
                  plan.price_monthly && plan.price_yearly
                    ? yearlySavingsPct(plan.price_monthly, plan.price_yearly)
                    : 0;
                return (
                  <Card
                    key={plan.key}
                    className={`relative flex flex-col ${style.color} ${style.border} border-2 transition-all duration-200 hover:shadow-lg`}
                  >
                    {plan.key === "pro" && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                        Most Popular
                      </div>
                    )}
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
                          {plan.name}
                        </CardTitle>
                        {isCurrent && (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                            Current
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-base text-gray-500 dark:text-gray-400">
                        {PLAN_DESCRIPTIONS[plan.key]}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <div className="mb-6">
                        <span className="text-4xl font-bold text-gray-900 dark:text-white">
                          {isCustom ? "Custom" : formatUsd(plan.price_monthly ?? 0)}
                        </span>
                        {!isCustom && (
                          <span className="text-gray-500 dark:text-gray-400">/month</span>
                        )}
                        {plan.price_yearly !== null && plan.price_yearly > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            or {formatUsd(plan.price_yearly)}/year
                            {savings > 0 && ` (save ${savings}%)`}
                          </p>
                        )}
                      </div>
                      <ul className="space-y-3">
                        {planFeatures(plan).map((feature) => (
                          <li key={feature} className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-2">
                      {plan.key === "free" && (
                        <Button className="w-full" variant="outline" size="lg" disabled={isCurrent}>
                          {isCurrent ? "Current Plan" : "Get Started"}
                        </Button>
                      )}
                      {plan.key === "pro" && !isCurrent && (
                        <>
                          <Button
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                            size="lg"
                            disabled={checkoutLoading !== null}
                            onClick={() => handleUpgrade("monthly")}
                          >
                            {checkoutLoading === "monthly" ? (
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Zap className="w-4 h-4 mr-2" />
                            )}
                            Subscribe Monthly — {formatUsd(plan.price_monthly ?? 0)}
                          </Button>
                          <Button
                            className="w-full"
                            variant="outline"
                            size="lg"
                            disabled={checkoutLoading !== null}
                            onClick={() => handleUpgrade("yearly")}
                          >
                            {checkoutLoading === "yearly" && (
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            )}
                            Subscribe Yearly — {formatUsd(plan.price_yearly ?? 0)}
                          </Button>

                          {/* One-time Pro Day Pass */}
                          {dayPass && !sub?.is_admin && (
                            <div className="mt-2 pt-3 border-t border-purple-200 dark:border-purple-800/60">
                              <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-2">
                                Just want to try Pro? Grab a {dayPassLength} pass.
                              </p>
                              {dayPass.available ? (
                                <Button
                                  className="w-full"
                                  variant="secondary"
                                  size="sm"
                                  disabled={dayPassLoading}
                                  onClick={handleDayPass}
                                >
                                  {dayPassLoading ? (
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                  ) : (
                                    <Zap className="w-4 h-4 mr-2" />
                                  )}
                                  Pro Day Pass — {dayPassPrice} / {dayPassLength}
                                </Button>
                              ) : (
                                <Button className="w-full" variant="secondary" size="sm" disabled>
                                  {dayPass.next_available_at
                                    ? `Day Pass available again ${formatDate(dayPass.next_available_at)}`
                                    : "Day Pass unavailable"}
                                </Button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      {plan.key === "pro" && isCurrent && (
                        dayPass?.active ? (
                          <Button className="w-full" variant="outline" size="lg" disabled>
                            <Zap className="w-4 h-4 mr-2" />
                            Day Pass active until {formatDate(dayPass.expires_at)}
                          </Button>
                        ) : (
                          <Button className="w-full" variant="outline" size="lg" disabled>
                            Current Plan
                          </Button>
                        )
                      )}
                      {plan.key === "enterprise" && (
                        <Button className="w-full" variant="outline" size="lg" onClick={() => setContactOpen(true)}>
                          Contact Us
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <EnterpriseContactDialog open={contactOpen} onOpenChange={setContactOpen} />
    </div>
  );
};

export default Plans;
