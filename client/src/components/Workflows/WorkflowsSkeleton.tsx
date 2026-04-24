import { Skeleton } from "../ui/skeleton";

const WorkflowCardSkeleton = () => (
  <div className="flex flex-col bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden shadow-sm animate-pulse">
    <div className="p-4 md:p-6 flex-1">
      <div className="flex items-start justify-between mb-4">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <Skeleton className="w-8 h-8 rounded-md" />
      </div>
      <Skeleton className="h-6 w-3/4 mb-3" />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-5/6 mb-4" />

      <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700/50">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
    <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700/50 flex items-center justify-between gap-2">
      <Skeleton className="h-10 flex-1 rounded-md" />
      <Skeleton className="h-10 flex-1 rounded-md" />
    </div>
  </div>
);

const WorkflowListItemSkeleton = () => (
  <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl gap-4 md:gap-0 shadow-sm animate-pulse">
    <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 flex-1 w-full">
      <div className="flex items-center gap-4 w-full md:w-auto">
        <Skeleton className="w-12 h-12 rounded-lg" />
        <div className="min-w-0 flex-1 md:w-[200px]">
          <Skeleton className="h-5 w-3/4 mb-2" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>

      <div className="flex items-center gap-6 w-full md:w-auto pl-[60px] md:pl-0">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>

    <div className="flex items-center justify-end gap-2 w-full md:w-auto border-t md:border-none pt-4 md:pt-0 border-gray-100 dark:border-gray-700/50">
      <Skeleton className="h-9 w-20 rounded-md" />
      <Skeleton className="h-9 w-9 rounded-md" />
      <Skeleton className="h-9 w-9 rounded-md" />
    </div>
  </div>
);

export { WorkflowCardSkeleton, WorkflowListItemSkeleton };
