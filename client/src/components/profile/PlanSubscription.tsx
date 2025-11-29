import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Crown, CreditCard, CheckCircle2 } from "lucide-react";

interface PlanSubscriptionProps {
  user: {
    plan: string;
    planStatus: string;
    nextBilling: string;
  };
  planFeatures: string[];
}

export const PlanSubscription = ({
  user,
  planFeatures,
}: PlanSubscriptionProps) => {
  const navigate = useNavigate();

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Crown className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Plan & Subscription
        </h2>
      </div>
      <Card className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900/95 dark:to-gray-950 border-purple-200 dark:border-purple-700 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Plan Details */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Crown className="w-6 h-6 text-yellow-500" />
                    {user.plan}
                  </h3>
                  <Badge className="mt-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                    {user.planStatus}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Next billing: {user.nextBilling}
                </p>
              </div>

              <Separator className="bg-purple-200 dark:bg-gray-700" />

              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Plan Features:
                </p>
                <ul className="space-y-2">
                  {planFeatures.map((feature, index) => (
                    <li
                      key={index}
                      className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 text-green-500 dark:text-green-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Usage Limits */}
            <div className="flex-1 space-y-4">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                Usage & Limits
              </h4>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-300">
                      Workflows
                    </span>
                    <span className="text-gray-900 dark:text-white font-medium">
                      12 / Unlimited
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className="bg-gradient-to-r from-purple-600 to-blue-600 h-2 rounded-full w-[12%]" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-300">
                      Executions (Monthly)
                    </span>
                    <span className="text-gray-900 dark:text-white font-medium">
                      128 / Unlimited
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className="bg-gradient-to-r from-purple-600 to-blue-600 h-2 rounded-full w-[25%]" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-300">
                      API Calls (Monthly)
                    </span>
                    <span className="text-gray-900 dark:text-white font-medium">
                      2,450 / 10,000
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className="bg-gradient-to-r from-purple-600 to-blue-600 h-2 rounded-full w-[24.5%]" />
                  </div>
                </div>
              </div>

              <Button
                onClick={() => navigate("/billing")}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-none mt-4"
              >
                Manage Subscription
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};
