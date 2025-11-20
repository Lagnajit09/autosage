import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Zap, FileText, Activity } from "lucide-react";

export const StatsOverview = ({ stats }: { stats: { workflows: number; scripts: number; executions: number } }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Card className="bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Workflows</CardTitle>
          <Zap className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.workflows}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400">+2 from last week</p>
        </CardContent>
      </Card>
      <Card className="bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Scripts</CardTitle>
          <FileText className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.scripts}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400">+5 new scripts</p>
        </CardContent>
      </Card>
      <Card className="bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Executions</CardTitle>
          <Activity className="h-4 w-4 text-purple-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.executions}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400">+12% from last month</p>
        </CardContent>
      </Card>
    </div>
  );
};