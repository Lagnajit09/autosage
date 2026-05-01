import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Webhook,
  Link as LinkIcon,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SearchInput } from "./SearchInput";

interface HttpTrigger {
  id: string;
  workflow_id: string;
  workflow_name: string;
  trigger_url: string;
  is_active: boolean;
  last_triggered_at: string | null;
}

interface HttpTriggersTableProps {
  triggers: HttpTrigger[];
  onToggle: (id: string, current: boolean) => void;
  onDelete: (id: string) => void;
  itemsPerPage?: number;
}

export const HttpTriggersTable = ({
  triggers,
  onToggle,
  onDelete,
  itemsPerPage = 10,
}: HttpTriggersTableProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // 1s latency for search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setCurrentPage(1); // Reset to page 1 on search
    }, 800);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredTriggers = triggers.filter(
    (t) =>
      t.workflow_name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
      t.trigger_url.toLowerCase().includes(debouncedQuery.toLowerCase()),
  );

  const totalPages = Math.ceil(filteredTriggers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTriggers = filteredTriggers.slice(
    startIndex,
    startIndex + itemsPerPage,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Webhook className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            HTTP Triggers
          </h2>
        </div>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by workflow or URL..."
        />
      </div>

      {filteredTriggers.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center bg-white dark:bg-gray-900 rounded-md border border-dashed border-gray-300 dark:border-gray-700">
          {searchQuery
            ? "No triggers match your search."
            : "No HTTP triggers configured."}
        </div>
      ) : (
        <>
          <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-x-auto scrollbar-hide">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-gray-200 dark:border-gray-800 hover:bg-transparent">
                  <TableHead className="text-gray-500 dark:text-gray-400">
                    Workflow
                  </TableHead>
                  <TableHead className="text-gray-500 dark:text-gray-400">
                    Trigger URL
                  </TableHead>
                  <TableHead className="text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                    Last Triggered
                  </TableHead>
                  <TableHead className="text-gray-500 dark:text-gray-400">
                    Status
                  </TableHead>
                  <TableHead className="text-right text-gray-500 dark:text-gray-400">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTriggers.map((t) => (
                  <TableRow
                    key={t.id}
                    className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <TableCell className="font-medium">
                      <Link
                        to={`/workflow/${t.workflow_id}`}
                        className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                      >
                        {t.workflow_name}
                        <LinkIcon className="w-3 h-3" />
                      </Link>
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs max-w-[200px] truncate text-gray-700 dark:text-gray-300"
                      title={t.trigger_url}
                    >
                      {t.trigger_url}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                      {t.last_triggered_at
                        ? new Date(t.last_triggered_at).toLocaleString()
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={t.is_active}
                          onCheckedChange={() => onToggle(t.id, t.is_active)}
                        />
                        <span className="text-xs text-gray-700 dark:text-gray-300">
                          {t.is_active ? "Active" : "Disabled"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(t.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-4">
              <p className="text-sm text-gray-500">
                Showing <span className="font-medium">{startIndex + 1}</span> to{" "}
                <span className="font-medium">
                  {Math.min(startIndex + itemsPerPage, filteredTriggers.length)}
                </span>{" "}
                of{" "}
                <span className="font-medium">{filteredTriggers.length}</span>{" "}
                results
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400 italic px-1">
        * Note: Deleting a trigger only removes the trigger configuration. It does not delete the associated workflow.
      </p>
    </div>
  );
};
