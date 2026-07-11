import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Clock } from "lucide-react";
import type { RecentExecution } from "@/lib/api/user";

interface RecentActivityProps {
  recentExecutions: RecentExecution[];
  isLoading?: boolean;
}

const timeAgo = (isoString: string): string => {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  return new Date(isoString).toLocaleDateString();
};

const parseExecution = (exec: RecentExecution) => {
  const colonIdx = exec.name.indexOf(": ");
  if (colonIdx !== -1) {
    const type = exec.name.slice(0, colonIdx);
    const name = exec.name.slice(colonIdx + 2);
    const action = type === "Script" ? "Executed script" : "Ran workflow";
    return { action, name };
  }
  return { action: "Executed", name: exec.name };
};

export const RecentActivity = ({
  recentExecutions,
  isLoading = false,
}: RecentActivityProps) => {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Recent Activity
        </h2>
      </div>
      <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 shadow-sm">
        <CardContent className="p-6">
          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 mt-2 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentExecutions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No recent activity yet.
            </p>
          ) : (
            <div className="space-y-4">
              {recentExecutions.map((exec, index) => {
                const { action, name } = parseExecution(exec);
                return (
                  <div key={index}>
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                          exec.status === "success"
                            ? "bg-green-500"
                            : exec.status === "running"
                              ? "bg-blue-500"
                              : "bg-red-500"
                        }`}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {action}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                          {timeAgo(exec.time)}
                        </p>
                        {exec.duration && exec.duration !== "0s" && (
                          <span className="text-xs text-gray-400 dark:text-gray-600">
                            · {exec.duration}
                          </span>
                        )}
                      </div>
                    </div>
                    {index < recentExecutions.length - 1 && (
                      <Separator className="mt-4 bg-gray-100 dark:bg-gray-800" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};
