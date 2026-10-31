import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, BarChart3, ArrowRight, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { type AutobotDashboardData, getDashboard } from "@/lib/api/autobot";
import type { Subscription } from "@/lib/api/billing";
import { SAGECODE_URL } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { AutobotIcon } from "@/components/AutobotIcon";

type BannerProps = { className?: string };

// --- Banners ---
// The Dashboard's banners: SageCode and Autobot cards, then a thin bar for the
// plan ("Upgrade to Pro" on free plans, the user's plan otherwise). They sit in
// the right column on wide screens and above the content on narrower ones.

// A thin, fully clickable bar (used for the plan): icon, two short lines, chevron.
const ThinBar = ({ title, detail, onClick, className }: BannerProps & { title: string; detail: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "group flex w-full items-center gap-3 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 px-4 py-3 text-left text-white shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400",
      className,
    )}
  >
    <Crown size={18} className="text-yellow-300 flex-shrink-0" />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold leading-tight">{title}</span>
      <span className="block truncate text-xs text-purple-100">{detail}</span>
    </span>
    <ArrowRight className="h-4 w-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
  </button>
);

export const ProBanner = ({ className }: BannerProps) => {
  const navigate = useNavigate();
  return (
    <ThinBar
      className={className}
      title="Upgrade to Pro"
      detail="Advanced AI and unlimited runs"
      onClick={() => navigate("/plans")}
    />
  );
};

const formatPlanDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

// The paid-plan counterpart of ProBanner, in the same slot and style. `sub` is
// null if the subscription couldn't be loaded; the bar then stays generic.
export const PlanBanner = ({ sub, className }: BannerProps & { sub: Subscription | null }) => {
  const navigate = useNavigate();
  const title = !sub ? "Your plan" : sub.is_admin ? "Admin access" : `Autosage ${sub.plan_display.name}`;
  const detail = !sub
    ? "Plan, usage and billing"
    : sub.is_admin
      ? "Every feature unlocked"
      : sub.current_period_end
        ? `${sub.status === "cancelled" ? "Access until" : "Renews on"} ${formatPlanDate(sub.current_period_end)}`
        : "Manage your plan and billing";
  return <ThinBar className={className} title={title} detail={detail} onClick={() => navigate("/billing")} />;
};

export const AutobotBanner = ({ className }: BannerProps) => {
  const navigate = useNavigate();
  return (
    <Card className={cn("flex flex-col bg-gray-900 dark:bg-black border-gray-800 relative overflow-hidden group", className)}>
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]" />
      <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl group-hover:bg-blue-500/30 transition-all duration-500" />

      <CardHeader className="pb-3 relative">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          {/* The card is dark in both themes, so always the light-on-dark logo. */}
          <AutobotIcon dark size={20} className="flex-shrink-0" />
          Meet Autobot
        </CardTitle>
        <CardDescription className="text-gray-400">
          Your AI agent for scripts, workflows, and fixing failed runs.
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto relative">
        <Button
          className="w-full bg-blue-600 hover:bg-blue-500 text-white"
          onClick={() => navigate("/ai/autobot")}
        >
          Chat with Autobot
        </Button>
      </CardContent>
    </Card>
  );
};

// SageCode: the `sagex` CLI. Dark in both themes (it's a terminal product) with
// Autosage purple; the action opens the SageCode site in a new tab.
export const SageCodeBanner = ({ className }: BannerProps) => (
  <Card className={cn("flex flex-col bg-gray-900 dark:bg-black border-gray-800 relative overflow-hidden group", className)}>
    <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]" />
    <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl group-hover:bg-purple-500/30 transition-all duration-500" />

    <CardHeader className="pb-3 relative">
      <CardTitle className="flex items-center gap-2 text-base text-white min-w-0">
        <img src="/sagecode-mark-dark.svg" alt="" className="h-[18px] w-auto flex-shrink-0" />
        <span className="truncate">
          Sage<span className="text-[#d4b0eb]">Code</span>
        </span>
        <span className="ml-auto flex-shrink-0 rounded border border-purple-400/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-purple-200">
          NEW
        </span>
      </CardTitle>
      <CardDescription className="text-gray-400">
        Autosage in your terminal: run workflows, webhooks and schedules from your shell.
      </CardDescription>
    </CardHeader>
    <CardContent className="mt-auto relative space-y-3">
      <code className="block truncate rounded-md border border-gray-700/60 bg-gray-800/60 px-2.5 py-1.5 font-mono text-xs text-gray-300">
        <span className="text-[#d77757] select-none">$ </span>uv tool install sagex-cli
      </code>
      <Button asChild className="w-full bg-[#7429a7] hover:bg-[#8a3fd6] text-white gap-1.5">
        <a href={SAGECODE_URL} target="_blank" rel="noopener noreferrer">
          Get SageCode
          <ArrowUpRight className="w-4 h-4" />
        </a>
      </Button>
    </CardContent>
  </Card>
);

/** A card-shaped placeholder for a banner (used by DashboardSkeleton). */
export const BannerSkeleton = ({ className }: BannerProps) => (
  <Card className={cn("flex flex-col gap-3 p-6 min-h-[15rem] bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/50", className)}>
    <Skeleton className="h-5 w-2/5" />
    <Skeleton className="h-3.5 w-full" />
    <Skeleton className="h-3.5 w-4/5" />
    <Skeleton className="mt-auto h-10 w-full" />
  </Card>
);

/** Placeholder for the thin plan bar while the subscription loads. */
export const ThinBarSkeleton = ({ className }: BannerProps) => (
  <Skeleton className={cn("h-[3.75rem] w-full rounded-lg", className)} />
);

// "Am I about to hit my quota?" — a slim full-width strip under the Dashboard
// header. Renders "Stats unavailable" on endpoint failure; never breaks the page.
export const AutobotTodayCard = ({ className }: BannerProps) => {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [data, setData] = useState<AutobotDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const token = await getToken();
        if (!token) {
          if (!cancelled) {
            setError(true);
            setLoading(false);
          }
          return;
        }
        const payload = await getDashboard(token);
        if (!cancelled) {
          setData(payload);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const compactNumber = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${(n / 1_000).toFixed(0)}k`;
    return n.toLocaleString();
  };

  const quota =
    data && data.admin_quota.limit > 0 ? `${data.admin_quota.used}/${data.admin_quota.limit}` : "—";

  return (
    <Card className={cn("bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 overflow-hidden", className)}>
      {/* One slim row from md up: title, the three numbers, then the link. */}
      <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:gap-8">
        <div className="min-w-0 flex-shrink-0">
          <p className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <BarChart3 size={18} className="text-[#7429a7] dark:text-[#d4b0eb] flex-shrink-0" />
            Autobot — today
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Usage since 00:00 UTC.</p>
        </div>
        <div className="min-w-0 flex-1 border-gray-200 dark:border-gray-700/50 md:border-l md:pl-8">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          ) : error || !data ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Stats unavailable.</p>
          ) : (
            <dl className="grid max-w-md grid-cols-3 gap-4">
              {[
                ["Requests", compactNumber(data.today.requests)],
                ["Tokens", compactNumber(data.today.total_tokens)],
                ["Quota", quota],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="truncate text-[11px] text-gray-500 dark:text-gray-400">{label}</dt>
                  <dd className="truncate text-lg font-bold leading-tight text-gray-900 dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <Button
          variant="link"
          className="h-auto self-start p-0 text-sm text-blue-600 dark:text-blue-400 gap-1 md:self-center"
          onClick={() => navigate("/ai/autobot/dashboard")}
        >
          View full Dashboard
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
};
