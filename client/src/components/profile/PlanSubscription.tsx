import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Crown, CreditCard, CheckCircle2, Zap } from "lucide-react";
import type { Subscription } from "@/lib/api/billing";

interface PlanSubscriptionProps {
  subscription: Subscription | null;
  isLoading?: boolean;
}

function limitLabel(limit: number | null | undefined): string {
  return limit == null ? "Unlimited" : String(limit);
}

function usagePct(used: number, limit: number | null | undefined): number {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export const PlanSubscription = ({
  subscription,
  isLoading = false,
}: PlanSubscriptionProps) => {
  const navigate = useNavigate();

  const planName = subscription?.is_admin
    ? "Enterprise (Admin)"
    : `${subscription?.plan_display?.name ?? "Free"} Plan`;

  const isPro = subscription?.plan === "pro";

  const features = subscription
    ? [
        `${limitLabel(subscription.limits.max_workflows)} workflows`,
        `${limitLabel(subscription.limits.max_scripts)} scripts`,
        `${limitLabel(subscription.limits.max_workflow_runs_per_month)} workflow runs / month`,
        `${limitLabel(subscription.limits.max_script_executions_per_month)} script executions / month`,
        subscription.execution_mode ? "Execution mode" : null,
        "Autobot AI assistant",
        "Vault credential management",
        "Scheduled & HTTP triggers",
      ].filter(Boolean) as string[]
    : [
        "Unlimited workflows",
        "Unlimited script executions",
        "Autobot AI assistant",
        "Vault credential management",
        "Scheduled & HTTP triggers",
      ];

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Crown className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Plan & Subscription
        </h2>
      </div>
      <Card className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900/95 dark:to-gray-950 border-purple-200 dark:border-purple-700 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Plan Details */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    {isPro ? (
                      <Zap className="w-6 h-6 text-purple-500" />
                    ) : (
                      <Crown className="w-6 h-6 text-yellow-500" />
                    )}
                    {planName}
                  </h3>
                  <Badge className="mt-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                    {subscription?.status === "cancelled" ? "Cancels at period end" : "Active"}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  {isPro
                    ? `${subscription?.billing_interval === "yearly" ? "$120/year" : "$15/month"} — manage in billing`
                    : "Free tier — upgrade for higher limits"}
                </p>
              </div>

              <Separator className="bg-purple-200 dark:bg-gray-700" />

              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Plan Features:
                </p>
                <ul className="space-y-2">
                  {features.map((feature, index) => (
                    <li
                      key={index}
                      className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 text-green-500 dark:text-green-400 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Usage */}
            <div className="flex-1 space-y-4">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                Your Usage
              </h4>
              {isLoading ? (
                <div className="space-y-4 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
                      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full w-full" />
                    </div>
                  ))}
                </div>
              ) : subscription ? (
                <div className="space-y-3">
                  {[
                    {
                      label: "Workflows",
                      used: subscription.usage.workflows,
                      limit: subscription.limits.max_workflows,
                    },
                    {
                      label: "Workflow runs (month)",
                      used: subscription.usage.workflow_runs_this_month,
                      limit: subscription.limits.max_workflow_runs_per_month,
                    },
                    {
                      label: "Script executions (month)",
                      used: subscription.usage.script_executions_this_month,
                      limit: subscription.limits.max_script_executions_per_month,
                    },
                  ].map(({ label, used, limit }) => (
                    <div key={label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600 dark:text-gray-300">{label}</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {used} / {limitLabel(limit)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-purple-600 to-blue-600 h-2 rounded-full"
                          style={{ width: `${usagePct(used, limit)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <Button
                onClick={() => navigate("/billing")}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-none mt-4"
              >
                {subscription?.plan === "free" && !subscription.is_admin
                  ? "Upgrade to Pro"
                  : "View Billing"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};
