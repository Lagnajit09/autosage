import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Crown, BarChart3, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { type AutobotDashboardData, getDashboard } from "@/lib/api/autobot";

// --- Banners ---
export const ProBanner = () => {
  return (
    <Card className="bg-gradient-to-br from-purple-600 to-blue-600 border-none text-white overflow-hidden relative mb-6">
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <Crown size={120} />
      </div>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown size={20} className="text-yellow-300" />
          Upgrade to Pro
        </CardTitle>
        <CardDescription className="text-purple-100">
          Unlock advanced AI models, unlimited executions, and priority support.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="secondary" className="w-full font-semibold text-purple-700 hover:bg-white/90">
          Get Pro Access
        </Button>
      </CardContent>
    </Card>
  );
};

export const AutobotBanner = () => {
  const navigate = useNavigate();
  return (
    <Card className="bg-gray-900 dark:bg-black border-gray-800 relative overflow-hidden group">
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]" />
      <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl group-hover:bg-blue-500/30 transition-all duration-500" />

      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Sparkles size={20} className="text-blue-400" />
          Meet Autobot
        </CardTitle>
        <CardDescription className="text-gray-400">
          Your personal AI agent for complex automation tasks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="p-3 bg-gray-800/50 rounded-lg text-sm text-gray-300 border border-gray-700/50">
            "Hey! I can help you debug that script or optimize your workflow."
          </div>
          <Button
            className="w-full bg-blue-600 hover:bg-blue-500 text-white"
            onClick={() => navigate("/ai/autobot")}
          >
            Chat with Autobot
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Compact "am I about to hit my quota?" tile. Renders "Stats unavailable"
// on endpoint failure — never breaks the parent Dashboard page.
export const AutobotTodayCard = () => {
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

  return (
    <Card className="bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-gray-900 dark:text-white">
          <BarChart3 size={18} className="text-[#7429a7] dark:text-[#d4b0eb] flex-shrink-0" />
          <span className="truncate">Autobot — today</span>
        </CardTitle>
        <CardDescription className="text-gray-500 dark:text-gray-400">
          Usage since 00:00 UTC.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : error || !data ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Stats unavailable.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="min-w-0">
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                Requests
              </p>
              <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                {compactNumber(data.today.requests)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                Tokens
              </p>
              <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                {compactNumber(data.today.total_tokens)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                Quota
              </p>
              <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                {data.admin_quota.limit > 0
                  ? `${data.admin_quota.used}/${data.admin_quota.limit}`
                  : "—"}
              </p>
            </div>
          </div>
        )}
        {/* w-full + justify-between pins the arrow to the right edge while the
            label truncates with an ellipsis inside its min-w-0 wrapper. Without
            min-w-0 the flex item refuses to shrink below its content width and
            shadcn Button's default whitespace-nowrap causes the text to push
            past the card edge at the lg sidebar width (~280-300px). */}
        <Button
          variant="link"
          className="w-full text-blue-600 dark:text-blue-400 p-0 h-auto justify-between text-xs sm:text-sm gap-1"
          onClick={() => navigate("/ai/autobot/dashboard")}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            View full Dashboard
          </span>
          <ArrowRight className="w-4 h-4 flex-shrink-0" />
        </Button>
      </CardContent>
    </Card>
  );
};