import React from "react";
import LeftNav from "@/components/LeftNav";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const Plans = () => {
  const plans = [
    {
      name: "Free",
      price: "$0",
      description: "Perfect for getting started",
      features: [
        "Basic workflow automation",
        "5 active workflows",
        "100 executions per month",
        "Community support",
      ],
      color: "bg-blue-50 dark:bg-blue-900/20",
      borderColor: "border-blue-200 dark:border-blue-800",
      buttonVariant: "outline" as const,
    },
    {
      name: "Pro",
      price: "$29",
      description: "For power users and creators",
      features: [
        "Advanced workflow automation",
        "Unlimited active workflows",
        "10,000 executions per month",
        "Priority email support",
        "Advanced analytics",
      ],
      color: "bg-purple-50 dark:bg-purple-900/20",
      borderColor: "border-purple-200 dark:border-purple-800",
      buttonVariant: "default" as const,
      popular: true,
    },
    {
      name: "Business",
      price: "$99",
      description: "For teams and organizations",
      features: [
        "Everything in Pro",
        "Unlimited executions",
        "Dedicated success manager",
        "SSO & Advanced security",
        "Custom integrations",
      ],
      color: "bg-orange-50 dark:bg-orange-900/20",
      borderColor: "border-orange-200 dark:border-orange-800",
      buttonVariant: "outline" as const,
    },
  ];

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-workflow-void/90 transition-colors duration-300">
      <LeftNav />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-6 py-12">
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold tracking-tight mb-4 text-gray-900 dark:text-text-primary">
              Choose Your Plan
            </h1>
            <p className="text-muted-foreground dark:text-text-secondary text-lg max-w-2xl mx-auto">
              Select the perfect plan for your automation needs. Upgrade or
              downgrade at any time.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={`relative flex flex-col ${plan.color} ${plan.borderColor} border-2 transition-all duration-200 hover:scale-105 hover:shadow-lg`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-2xl font-bold text-gray-900 dark:text-text-primary">
                    {plan.name}
                  </CardTitle>
                  <CardDescription className="text-base text-gray-500 dark:text-text-secondary">
                    {plan.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-gray-900 dark:text-text-primary">
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground dark:text-text-muted">
                      /month
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700 dark:text-text-secondary">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={plan.buttonVariant}
                    size="lg"
                  >
                    {plan.name === "Free" ? "Get Started" : "Subscribe"}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Plans;
