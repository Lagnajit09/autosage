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

export const LibraryCard = ({ item, onFork, isForking, onPreview }: Props) => {
  const meta = TYPE_META[item.type] ?? TYPE_META.workflow;
  const Icon = meta.icon;
  const ActionIcon = meta.actionIcon;

  return (
    <div className="group flex flex-col bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden hover:shadow-lg hover:border-purple-500/30 dark:hover:border-purple-500/30 transition-all duration-300">
      <div className="p-4 md:p-6 flex-1">
        <div className="flex items-start justify-between mb-4">
          <div
            className={`p-3 rounded-xl ${meta.iconClass} group-hover:scale-110 transition-transform duration-300 shadow-sm`}
          >
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex items-center gap-2">
            {item.is_verified && (
              <span className="flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400">
                <BadgeCheck className="w-4 h-4" />
                Verified
              </span>
            )}
            <Badge
              variant="outline"
              className="capitalize border bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300 border-gray-200 dark:border-gray-600"
            >
              {meta.label}
            </Badge>
          </div>
        </div>

        <h3 className="font-semibold text-gray-900 dark:text-white text-lg md:text-xl mb-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
          {item.name}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 h-10">
          {item.description}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700/50 text-xs text-gray-600 dark:text-gray-300 font-medium"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700/50">
          {item.category && (
            <Badge
              variant="outline"
              className="capitalize border bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-blue-200 dark:border-blue-500/30"
            >
              {item.category}
            </Badge>
          )}
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <User className="w-3 h-3" />
            <span>{item.author}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Download className="w-3 h-3" />
            <span>{item.downloads} uses</span>
          </div>
        </div>
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700/50 flex items-center justify-between gap-2">
        {onPreview && (
          <Button
            variant="outline"
            onClick={() => onPreview(item)}
            className="shrink-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </Button>
        )}
        <Button
          onClick={() => onFork(item)}
          disabled={isForking}
          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-500/20"
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
