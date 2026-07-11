import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, FileText, Activity, CheckCircle2 } from "lucide-react";
import type { DashboardStats } from "@/lib/api/user";

interface StatsOverviewProps {
  stats: DashboardStats | null;
  isLoading?: boolean;
}

const StatCard = ({
  title,
  value,
  subtext,
  icon,
  isLoading,
}: {
  title: string;
  value: string | number;
  subtext: string;
  icon: React.ReactNode;
  isLoading: boolean;
}) => (
  <Card className="bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {title}
      </CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-16" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
        </div>
      ) : (
        <>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {value}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {subtext}
          </p>
        </>
      )}
    </CardContent>
  </Card>
);

export const StatsOverview = ({
  stats,
  isLoading = false,
}: StatsOverviewProps) => {
  const thisMonthLabel = (count: number) =>
    count === 0
      ? "None this month"
      : `+${count} this month`;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Statistics Overview
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Workflows"
          value={stats?.workflows ?? 0}
          subtext={thisMonthLabel(stats?.workflows_current_month ?? 0)}
          icon={<Zap className="h-4 w-4 text-blue-500" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Total Scripts"
          value={stats?.scripts ?? 0}
          subtext={thisMonthLabel(stats?.scripts_current_month ?? 0)}
          icon={<FileText className="h-4 w-4 text-green-500" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Total Executions"
          value={stats?.executions ?? 0}
          subtext={thisMonthLabel(stats?.executions_current_month ?? 0)}
          icon={<Activity className="h-4 w-4 text-purple-500" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Success Rate"
          value={`${stats?.success_rate ?? 100}%`}
          subtext="Across all executions"
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
          isLoading={isLoading}
        />
      </div>
    </section>
  );
};
