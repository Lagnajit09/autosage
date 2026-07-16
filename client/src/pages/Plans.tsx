import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
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
  createCheckout,
  createCreditsCheckout,
  verifyCreditsPayment,
  type Subscription,
} from "@/lib/api/billing";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api-client";
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

  // Enterprise contact dialog state
  const [contactOpen, setContactOpen] = useState(false);
  const [contactType, setContactType] = useState("Solo / Individual");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactDesc, setContactDesc] = useState("");
  const [contactLoading, setContactLoading] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

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
        description: `Pro Plan — ${interval === "monthly" ? "$15/month" : "$120/year"}`,
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
  }, [getToken, navigate, pollUntilActivated]);

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

  const handleContactSubmit = async () => {
    if (!contactName.trim() || !contactEmail.trim() || !contactDesc.trim()) {
      setContactError("Name, email, and description are required.");
      return;
    }
    setContactLoading(true);
    setContactError(null);
    try {
      const token = await getToken();
      const res = await apiRequest(
        "/api/billing/contact/",
        {
          method: "POST",
          body: JSON.stringify({
            type: contactType,
            name: contactName.trim(),
            email: contactEmail.trim(),
            description: contactDesc.trim(),
          }),
        },
        token ?? "anonymous",
      );
      if (res && !res.success) {
        throw new Error(res.message || "Failed to send.");
      }
      setContactSuccess(true);
    } catch (e: unknown) {
      setContactError(e instanceof Error ? e.message : "Failed to send. Please try emailing us directly at autosagex@gmail.com.");
    } finally {
      setContactLoading(false);
    }
  };

  const handleContactOpen = () => {
    setContactOpen(true);
    setContactSuccess(false);
    setContactError(null);
    setContactName("");
    setContactEmail("");
    setContactDesc("");
    setContactType("Solo / Individual");
  };

  const currentPlan = sub?.plan ?? "free";
  const dayPass = sub?.day_pass;
  const dayPassPrice = dayPass
    ? `${dayPass.currency === "INR" ? "₹" : ""}${(dayPass.amount / 100).toFixed(0)}`
    : "₹99";
  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

  const plans = [
    {
      key: "free",
      name: "Free",
      price_monthly: "$0",
      price_yearly: "$0",
      description: "Perfect for getting started",
      features: [
        "5 workflows",
        "10 scripts",
        "30 workflow runs / month",
        "50 script executions / month",
        "10 Autobot threads",
        "1 HTTP trigger & 1 schedule trigger",
        "5 vault entries",
        "Community support",
      ],
      color: "bg-blue-50 dark:bg-blue-900/20",
      borderColor: "border-blue-200 dark:border-blue-800",
    },
    {
      key: "pro",
      name: "Pro",
      price_monthly: "$15",
      price_yearly: "$120",
      description: "For power users and creators",
      features: [
        "50 workflows",
        "100 scripts",
        "300 workflow runs / month",
        "500 script executions / month",
        "Unlimited Autobot threads",
        "20 HTTP triggers & 20 schedule triggers",
        "50 vault entries",
        "Execution mode (AI-driven runs)",
        "Priority support",
      ],
      color: "bg-purple-50 dark:bg-purple-900/20",
      borderColor: "border-purple-200 dark:border-purple-800",
      popular: true,
    },
    {
      key: "enterprise",
      name: "Enterprise",
      price_monthly: "Custom",
      price_yearly: "Custom",
      description: "For teams and organizations",
      features: [
        "Unlimited everything",
        "All Pro features",
        "Dedicated support",
        "Custom integrations",
        "SLA guarantee",
      ],
      color: "bg-orange-50 dark:bg-orange-900/20",
      borderColor: "border-orange-200 dark:border-orange-800",
    },
  ];

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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => {
              const isCurrent = currentPlan === plan.key || (sub?.is_admin && plan.key === "enterprise");
              return (
                <Card
                  key={plan.key}
                  className={`relative flex flex-col ${plan.color} ${plan.borderColor} border-2 transition-all duration-200 hover:shadow-lg`}
                >
                  {plan.popular && (
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
                      {plan.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="mb-6">
                      <span className="text-4xl font-bold text-gray-900 dark:text-white">
                        {plan.price_monthly}
                      </span>
                      {plan.price_monthly !== "Custom" && (
                        <span className="text-gray-500 dark:text-gray-400">/month</span>
                      )}
                      {plan.key === "pro" && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          or {plan.price_yearly}/year (save 33%)
                        </p>
                      )}
                    </div>
                    <ul className="space-y-3">
                      {plan.features.map((feature) => (
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
                          Subscribe Monthly — $15
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
                          Subscribe Yearly — $120
                        </Button>

                        {/* One-time Pro Day Pass */}
                        {dayPass && !sub?.is_admin && (
                          <div className="mt-2 pt-3 border-t border-purple-200 dark:border-purple-800/60">
                            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-2">
                              Just want to try Pro? Grab a 24-hour pass.
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
                                Pro Day Pass — {dayPassPrice} / 24 hrs
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
                      <Button className="w-full" variant="outline" size="lg" onClick={handleContactOpen}>
                        Contact Us
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      </main>

      <Dialog open={contactOpen} onOpenChange={(open) => { if (!contactLoading) setContactOpen(open); }}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">Contact Us — Enterprise</DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Tell us about your needs and our team will reach out to you shortly.
            </DialogDescription>
          </DialogHeader>

          {contactSuccess ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-green-600 dark:text-green-400 font-medium">
                We've received your request!
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Our team will reach out to you shortly.
              </p>
              <Button className="mt-4" onClick={() => setContactOpen(false)}>
                Close
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Type</Label>
                <Select value={contactType} onValueChange={setContactType}>
                  <SelectTrigger className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100">
                    <SelectItem value="Solo / Individual" className="cursor-pointer">Solo / Individual</SelectItem>
                    <SelectItem value="Organization / Team" className="cursor-pointer">Organization / Team</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Your name</Label>
                <Input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Your name"
                  className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Your email address</Label>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Your email address"
                  className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">What are you planning to automate?</Label>
                <Textarea
                  value={contactDesc}
                  onChange={(e) => setContactDesc(e.target.value)}
                  placeholder="Tell us about your use case."
                  rows={4}
                  className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none"
                />
              </div>

              {contactError && (
                <p className="text-sm text-red-600 dark:text-red-400">{contactError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setContactOpen(false)}
                  disabled={contactLoading}
                  className="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleContactSubmit}
                  disabled={contactLoading}
                  className="bg-orange-600 hover:bg-orange-700 text-white min-w-[80px]"
                >
                  {contactLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Send"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Plans;
