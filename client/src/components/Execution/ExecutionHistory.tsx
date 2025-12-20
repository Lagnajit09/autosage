import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock } from "lucide-react";

const history = [
  {
    id: "exec_1",
    status: "success",
    duration: "2.5s",
    startTime: "2024-03-20 10:30:45",
    triggeredBy: "Webhook",
  },
  {
    id: "exec_2",
    status: "failed",
    duration: "0.8s",
    startTime: "2024-03-20 09:15:22",
    triggeredBy: "Manual",
  },
  {
    id: "exec_3",
    status: "success",
    duration: "2.1s",
    startTime: "2024-03-19 18:45:10",
    triggeredBy: "Schedule",
  },
  {
    id: "exec_4",
    status: "success",
    duration: "1.9s",
    startTime: "2024-03-19 14:20:05",
    triggeredBy: "Webhook",
  },
  {
    id: "exec_5",
    status: "success",
    duration: "2.3s",
    startTime: "2024-03-19 10:00:00",
    triggeredBy: "Schedule",
  },
];

const ExecutionHistory = () => {
  return (
    <div className="h-full bg-white dark:bg-gray-950 p-4 overflow-hidden flex flex-col">
      <div className="rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50 dark:bg-gray-900">
            <TableRow className="dark:hover:bg-gray-800">
              <TableHead>Status</TableHead>
              <TableHead>Start Time</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Triggered By</TableHead>
              <TableHead className="text-right">Execution ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((run) => (
              <TableRow
                key={run.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    {run.status === "success" ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="capitalize text-sm font-medium text-gray-700 dark:text-gray-300">
                      {run.status}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {run.startTime}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {run.duration}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="font-normal dark:text-gray-400"
                  >
                    {run.triggeredBy}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-gray-500">
                  {run.id}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ExecutionHistory;
