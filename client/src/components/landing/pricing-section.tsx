import { useRef } from "react";
import { motion, useInView } from "framer-motion";
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
import { useNavigate } from "react-router-dom";

const PricingSection = () => {
  const navigate = useNavigate();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

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
      color: "bg-blue-50 dark:bg-blue-900/10",
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
      color: "bg-purple-50 dark:bg-purple-900/10",
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
      color: "bg-orange-50 dark:bg-orange-900/10",
      borderColor: "border-orange-200 dark:border-orange-800",
      buttonVariant: "outline" as const,
    },
  ];

  return (
    <section className="py-24 bg-white dark:bg-black relative" ref={ref}>
      {/* Background Gradient */}
      <div
        className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
        aria-hidden="true"
      >
        <div
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          style={{
            clipPath:
              "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
          }}
        ></div>
      </div>

      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose the perfect plan for your automation journey. <br />
            No hidden fees.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
            >
              <Card
                className={`relative flex flex-col h-full ${plan.color} ${plan.borderColor} border-2 hover:shadow-xl transition-all duration-300 dark:bg-gray-950/50 backdrop-blur-sm`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium shadow-md">
                    Most Popular
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {plan.name}
                  </CardTitle>
                  <CardDescription className="text-base">
                    {plan.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-6">
                    <span className="text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground font-medium">
                      /month
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-1 mt-0.5">
                          <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-300 leading-tight">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full font-semibold"
                    variant={plan.buttonVariant}
                    size="lg"
                    onClick={() => navigate("/signup")}
                  >
                    {plan.name === "Free"
                      ? "Get Started For Free"
                      : `Subscribe to ${plan.name}`}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
