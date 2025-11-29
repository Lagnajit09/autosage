import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Zap,
  FileText,
  Activity,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";

interface StatsOverviewProps {
  stats: {
    workflows: { total: number; trend: string };
    scripts: { total: number; trend: string };
    executions: { total: number; trend: string };
    successRate: number;
  };
}

export const StatsOverview = ({ stats }: StatsOverviewProps) => {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Statistics Overview
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Workflows
            </CardTitle>
            <Zap className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {stats.workflows.total}
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center mt-1">
              <TrendingUp className="w-3 h-3 mr-1" />
              {stats.workflows.trend}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Scripts
            </CardTitle>
            <FileText className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {stats.scripts.total}
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center mt-1">
              <TrendingUp className="w-3 h-3 mr-1" />
              {stats.scripts.trend}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Executions
            </CardTitle>
            <Activity className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {stats.executions.total}
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center mt-1">
              <TrendingUp className="w-3 h-3 mr-1" />
              {stats.executions.trend}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Success Rate
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {stats.successRate}%
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Across all executions
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
