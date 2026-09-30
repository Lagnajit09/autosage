import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Check, Zap } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import EnterpriseContactDialog from "@/components/billing/EnterpriseContactDialog";
import type { PlanInfo, PlanKey } from "@/lib/api/billing";
import {
  PLAN_CATALOGUE,
  PLAN_DESCRIPTIONS,
  dayPassDuration,
  formatMinorAmount,
  formatUsd,
  planFeatures,
  yearlySavingsPct,
} from "@/lib/plans";
import { withRedirect } from "@/lib/redirect";

const PLAN_STYLE: Record<PlanKey, { color: string; border: string }> = {
  free: {
    color: "bg-blue-50 dark:bg-blue-900/10",
    border: "border-blue-200 dark:border-blue-800",
  },
  pro: {
    color: "bg-purple-50 dark:bg-purple-900/10",
    border: "border-purple-200 dark:border-purple-800",
  },
  enterprise: {
    color: "bg-orange-50 dark:bg-orange-900/10",
    border: "border-orange-200 dark:border-orange-800",
  },
};

// Paid plans are bought from the in-app Plans page, so the upgrade CTA sends
// visitors through sign-up and lands them there afterwards.
const UPGRADE_SIGNUP = withRedirect("/signup", "/plans");
const UPGRADE_SIGNIN = withRedirect("/signin", "/plans");

const PricingSection = () => {
  const navigate = useNavigate();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <section
      id="pricing"
      className="py-24 bg-white dark:bg-black relative scroll-mt-8"
      ref={ref}
    >
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
          {PLAN_CATALOGUE.map((plan, index) => (
            <motion.div
              key={plan.key}
              initial={{ opacity: 0, y: 20 }}
              animate={
                isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }
              }
              transition={{ duration: 0.6, delay: index * 0.1 }}
            >
              <PlanCard
                plan={plan}
                onGetStarted={() => navigate("/signup")}
                onUpgrade={() => navigate(UPGRADE_SIGNUP)}
                onContact={() => setContactOpen(true)}
              />
            </motion.div>
          ))}
        </div>
      </div>

      <EnterpriseContactDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
      />
    </section>
  );
};

interface PlanCardProps {
  plan: PlanInfo;
  onGetStarted: () => void;
  onUpgrade: () => void;
  onContact: () => void;
}

const PlanCard = ({ plan, onGetStarted, onUpgrade, onContact }: PlanCardProps) => {
  const style = PLAN_STYLE[plan.key] ?? PLAN_STYLE.free;
  const isPro = plan.key === "pro";
  const isCustom = plan.price_monthly === null;
  const savings =
    plan.price_monthly && plan.price_yearly
      ? yearlySavingsPct(plan.price_monthly, plan.price_yearly)
      : 0;

  return (
    <Card
      className={`relative flex flex-col h-full ${style.color} ${style.border} border-2 hover:shadow-xl transition-all duration-300 dark:bg-gray-950/50 backdrop-blur-sm`}
    >
      {isPro && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium shadow-md">
          Most Popular
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {plan.name}
        </CardTitle>
        <CardDescription className="text-base">
          {PLAN_DESCRIPTIONS[plan.key]}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="mb-6">
          <span className="text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            {isCustom ? "Custom" : formatUsd(plan.price_monthly ?? 0)}
          </span>
          {!isCustom && (
            <span className="text-muted-foreground font-medium">/month</span>
          )}
          {plan.price_yearly !== null && plan.price_yearly > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              or {formatUsd(plan.price_yearly)}/year
              {savings > 0 && ` (save ${savings}%)`}
            </p>
          )}
        </div>
        <ul className="space-y-3">
          {planFeatures(plan).map((feature) => (
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
      <CardFooter className="flex flex-col gap-3">
        {plan.key === "free" && (
          <Button
            className="w-full font-semibold"
            variant="outline"
            size="lg"
            onClick={onGetStarted}
          >
            Get Started For Free
          </Button>
        )}

        {isPro && (
          <>
            <Button
              className="w-full font-semibold"
              size="lg"
              onClick={onUpgrade}
            >
              <Zap className="w-4 h-4 mr-2" />
              Upgrade to Pro
            </Button>
            {plan.day_pass && (
              <p className="text-xs text-center text-muted-foreground">
                Just trying it out? Get a{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {dayPassDuration(plan.day_pass.days)} Pro Day Pass
                </span>{" "}
                for{" "}
                {formatMinorAmount(plan.day_pass.amount, plan.day_pass.currency)}.
              </p>
            )}
            <p className="text-xs text-center text-muted-foreground">
              Already have an account?{" "}
              <Link
                to={UPGRADE_SIGNIN}
                className="font-medium text-gray-700 dark:text-gray-300 hover:underline"
              >
                Sign in to upgrade
              </Link>
            </p>
          </>
        )}

        {plan.key === "enterprise" && (
          <Button
            className="w-full font-semibold"
            variant="outline"
            size="lg"
            onClick={onContact}
          >
            Contact Us
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default PricingSection;
