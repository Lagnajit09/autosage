import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import {
  Archive,
  BarChart3,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DashboardSidebar } from "@/components/Dashboard/Sidebar";
import { AutobotDashboardHeader } from "@/components/Autobot/DashboardHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/contexts/theme/theme-context";
import { cn } from "@/lib/utils";
import {
  type AutobotDashboardData,
  type DashboardBucket,
  getDashboard,
} from "@/lib/api/autobot";

// Explicit dark variants — the design-system `bg-card` tokens lack
// dark contrast in this project's Tailwind config.
const CARD_SURFACE =
  "bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50";

const formatNumber = (n: number): string => n.toLocaleString();

const QuotaTile = ({ used, limit }: { used: number; limit: number }) => {
  if (limit <= 0) return null;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const barColor =
    pct >= 100
      ? "bg-red-500"
      : pct >= 80
        ? "bg-amber-500"
        : "bg-emerald-500";
  const remaining = Math.max(0, limit - used);
  return (
    <Card className={CARD_SURFACE}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">
          Default daily quota
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            {used}
            <span className="text-sm sm:text-base font-normal text-gray-400 dark:text-gray-500">
              {" / "}
              {limit}
            </span>
          </span>
          <span className="text-[11px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {remaining} left
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={cn("h-full transition-all", barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 leading-snug">
          Resets at 00:00 UTC. Add a BYO LLM key in Customize for unlimited
          requests.
        </p>
      </CardContent>
    </Card>
  );
};

const StatTile = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <Card className={CARD_SURFACE}>
    <CardHeader className="pb-2">
      <CardTitle className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white break-words">
        {value}
      </div>
      {hint && (
        <p className="mt-1 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 leading-snug">
          {hint}
        </p>
      )}
    </CardContent>
  </Card>
);

// Recharts renders to SVG and doesn't react to Tailwind classes — we
// pass color props through directly from the theme context.
const ModelUsageChart = ({
  data,
}: {
  data: DashboardBucket["model_usage"];
}) => {
  const { isDark } = useTheme();
  const rows = useMemo(
    () =>
      data.map((u) => ({
        name: `${u.provider}/${u.model}`,
        count: u.count,
      })),
    [data],
  );

  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No requests yet in this window.
      </p>
    );
  }

  const axisColor = isDark ? "#9ca3af" : "#4b5563";
  const gridColor = isDark ? "#374151" : "#e5e7eb";
  const barColor = isDark ? "#d4b0eb" : "#7429a7";
  const tooltipBg = isDark ? "#1f2937" : "#ffffff";
  const tooltipBorder = isDark ? "#374151" : "#e5e7eb";
  const tooltipText = isDark ? "#f3f4f6" : "#111827";

  // Narrow YAxis label column on mobile — provider/model ids can be very long.
  const yAxisWidth = typeof window !== "undefined" && window.innerWidth < 640
    ? 110
    : 180;

  return (
    <div className="h-56 sm:h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            type="number"
            allowDecimals={false}
            stroke={axisColor}
            tick={{ fill: axisColor, fontSize: 12 }}
          />
          <YAxis
            dataKey="name"
            type="category"
            width={yAxisWidth}
            stroke={axisColor}
            tick={{ fill: axisColor, fontSize: 11 }}
          />
          <RechartsTooltip
            contentStyle={{
              backgroundColor: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              borderRadius: 8,
              color: tooltipText,
              fontSize: 12,
            }}
            cursor={{ fill: isDark ? "rgba(212,176,235,0.08)" : "rgba(116,41,167,0.08)" }}
          />
          <Bar dataKey="count" fill={barColor} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const BucketSection = ({
  title,
  subtitle,
  bucket,
  trailing,
}: {
  title: string;
  subtitle: string;
  bucket: DashboardBucket;
  trailing?: React.ReactNode;
}) => (
  <section className="space-y-4">
    <div>
      <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
        {title}
      </h2>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
        {subtitle}
      </p>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <StatTile
        label="Requests"
        value={formatNumber(bucket.requests)}
        hint="Assistant turns"
      />
      <StatTile
        label="Total tokens"
        value={formatNumber(bucket.total_tokens)}
        hint={`Prompt ${formatNumber(bucket.prompt_tokens)} · Completion ${formatNumber(bucket.completion_tokens)}`}
      />
      <StatTile
        label="Avg tokens / req"
        value={formatNumber(bucket.avg_tokens_per_request)}
      />
      <StatTile
        label="BYO / Admin tokens"
        value={`${formatNumber(bucket.byo_tokens)} / ${formatNumber(bucket.admin_tokens)}`}
        hint="BYO key / Admin pool"
      />
      {trailing}
    </div>
    <Card className={CARD_SURFACE}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm sm:text-base text-gray-900 dark:text-white">
          Model usage
        </CardTitle>
        <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
          Provider/model breakdown over this window.
        </p>
      </CardHeader>
      <CardContent>
        <ModelUsageChart data={bucket.model_usage} />
      </CardContent>
    </Card>
  </section>
);

const AutobotDashboard = () => {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [data, setData] = useState<AutobotDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (signalRefresh = false) => {
    if (signalRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in.");
      const payload = await getDashboard(token);
      setData(payload);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load dashboard.";
      toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SidebarProvider>
      <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <AutobotDashboardHeader onConfigsChanged={() => void load(true)} />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[#7429a7] dark:text-[#d4b0eb]">
                    <BarChart3 className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm font-medium">
                      Usage analytics
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Per-bucket request and token totals for your Autobot
                    conversations.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/ai/autobot/archived")}
                    className="border-gray-300 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <Archive className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">View archived chats</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void load(true)}
                    disabled={refreshing || loading}
                    className="border-gray-300 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <RefreshCw
                      className={cn(
                        "w-4 h-4 mr-2",
                        refreshing && "animate-spin",
                      )}
                    />
                    Refresh
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="flex h-64 items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-[#7429a7] dark:text-[#d4b0eb]" />
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Loading dashboard…
                    </span>
                  </div>
                </div>
              ) : !data ? (
                <Card className={CARD_SURFACE}>
                  <CardContent className="py-10 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Dashboard data unavailable.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 border-gray-300 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800"
                      onClick={() => void load()}
                    >
                      Retry
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <BucketSection
                    title="Today"
                    subtitle="Since 00:00 UTC."
                    bucket={data.today}
                    trailing={
                      <QuotaTile
                        used={data.admin_quota.used}
                        limit={data.admin_quota.limit}
                      />
                    }
                  />
                  <BucketSection
                    title="Last 7 days"
                    subtitle="Rolling seven-day window."
                    bucket={data.last_7d}
                  />
                  <BucketSection
                    title="All-time"
                    subtitle="Every assistant turn on record."
                    bucket={data.all_time}
                  />
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AutobotDashboard;
