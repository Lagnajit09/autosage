import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Zap } from "lucide-react";

interface Workflow {
  name: string;
  executions: number;
  successRate: number;
}

interface MostUsedWorkflowsProps {
  workflows: Workflow[];
}

export const MostUsedWorkflows = ({ workflows }: MostUsedWorkflowsProps) => {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Most Used Workflows
        </h2>
      </div>
      <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 shadow-sm">
        <CardContent className="p-6">
          <div className="space-y-4">
            {workflows.map((workflow, index) => (
              <div key={index}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {workflow.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {workflow.executions} executions
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                  >
                    {workflow.successRate}% success
                  </Badge>
                </div>
                {index < workflows.length - 1 && (
                  <Separator className="mt-4 bg-gray-100 dark:bg-gray-800" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
};
