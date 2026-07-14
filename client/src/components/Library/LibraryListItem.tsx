import { User, Download, Loader2, BadgeCheck, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LibraryItem } from "./types";
import { TYPE_META } from "./libraryDisplay";

interface Props {
  item: LibraryItem;
  onFork: (item: LibraryItem) => void;
  isForking: boolean;
  onPreview?: (item: LibraryItem) => void;
}

export const LibraryListItem = ({
  item,
  onFork,
  isForking,
  onPreview,
}: Props) => {
  const meta = TYPE_META[item.type] ?? TYPE_META.workflow;
  const Icon = meta.icon;
  const ActionIcon = meta.actionIcon;

  return (
    <div className="group flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl hover:shadow-md hover:border-purple-500/30 dark:hover:border-purple-500/30 transition-all duration-300 gap-4 md:gap-0">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 flex-1 w-full">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div
            className={`p-3 rounded-lg ${meta.iconClass} group-hover:scale-110 transition-transform duration-300`}
          >
            <Icon className="w-6 h-6" />
          </div>

          <div className="min-w-0 flex-1 md:w-[220px]">
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">
              {item.name}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge
                variant="outline"
                className="capitalize border bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300 border-gray-200 dark:border-gray-600"
              >
                {meta.label}
              </Badge>
              {item.category && (
                <Badge
                  variant="outline"
                  className="capitalize border bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-blue-200 dark:border-blue-500/30"
                >
                  {item.category}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400 w-full md:w-auto pl-[60px] md:pl-0">
          <span className="hidden lg:block text-sm text-gray-500 dark:text-gray-400 truncate max-w-[320px]">
            {item.description}
          </span>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4" />
            <span>{item.author}</span>
          </div>
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span>{item.downloads} uses</span>
          </div>
          {item.is_verified && (
            <div className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-medium">
              <BadgeCheck className="w-4 h-4" />
              <span className="hidden md:inline">Verified</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 w-full md:w-auto border-t md:border-none pt-4 md:pt-0 border-gray-100 dark:border-gray-700/50">
        {onPreview && (
          <Button
            variant="outline"
            onClick={() => onPreview(item)}
            className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Eye className="w-4 h-4" />
          </Button>
        )}
        <Button
          onClick={() => onFork(item)}
          disabled={isForking}
          className="bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-500/20"
        >
          {isForking ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <ActionIcon className="w-4 h-4 mr-2" />
          )}
          {meta.action}
        </Button>
      </div>
    </div>
  );
};
