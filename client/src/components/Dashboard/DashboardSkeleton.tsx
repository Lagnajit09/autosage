import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BannerSkeleton, ThinBarSkeleton } from "@/components/Dashboard/Banners";

const PANEL = "bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/50";

// Placeholder for the whole Dashboard while its data loads. It mirrors the real
// layout (header, usage strip, stats + recent lists + executions, banner column)
// so nothing jumps when the content arrives.
export const DashboardSkeleton = () => (
  <div className="max-w-7xl mx-auto" aria-busy="true" aria-label="Loading dashboard">
    {/* Header */}
    <div className="mb-8 space-y-3">
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>

    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-8">
        {/* Usage strip */}
        <Card className={`flex items-center gap-8 px-5 py-4 ${PANEL}`}>
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="hidden h-9 w-64 md:block" />
          <Skeleton className="ml-auto h-4 w-32" />
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className={`p-6 space-y-3 ${PANEL}`}>
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-7 w-14" />
              <Skeleton className="h-3 w-24" />
            </Card>
          ))}
        </div>

        {/* Recent workflows + scripts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1].map((col) => (
            <div key={col} className="space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-14" />
              </div>
              {[0, 1, 2].map((i) => (
                <div key={i} className={`flex items-center gap-3 p-4 rounded-lg border ${PANEL}`}>
                  <Skeleton className="h-9 w-9 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Recent executions */}
        <Card className={`p-6 space-y-4 ${PANEL}`}>
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-24" />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </Card>
      </div>

      {/* Banners (right column from xl, above the content below it) */}
      <div className="order-first grid content-start gap-4 md:grid-cols-2 xl:order-none xl:col-start-2 xl:row-start-1 xl:grid-cols-1">
        <BannerSkeleton />
        <BannerSkeleton />
        <ThinBarSkeleton className="md:col-span-2 xl:col-span-1" />
      </div>
    </div>
  </div>
);
