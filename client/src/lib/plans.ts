import type { PlanInfo, PlanKey } from "@/lib/api/billing";

// Static copy of server/billing/limits.py (PLAN_LIMITS + PLAN_DISPLAY) and the
// RAZORPAY_PRO_CREDITS* settings, so the public pricing page never hits the
// server. Keep in sync by hand when plans change.
export const PLAN_CATALOGUE: PlanInfo[] = [
  {
    key: "free",
    name: "Free",
    price_monthly: 0,
    price_yearly: 0,
    limits: {
      max_workflows: 5,
      max_scripts: 10,
      max_script_executions_per_month: 50,
      max_workflow_runs_per_month: 30,
      max_autobot_admin_messages_per_day: 10,
      max_autobot_threads: 10,
      max_http_triggers: 5,
      max_schedule_triggers: 5,
      max_vault_entries: 5,
      execution_mode: false,
    },
  },
  {
    key: "pro",
    name: "Pro",
    price_monthly: 15,
    price_yearly: 120,
    limits: {
      max_workflows: 50,
      max_scripts: 100,
      max_script_executions_per_month: 500,
      max_workflow_runs_per_month: 300,
      max_autobot_admin_messages_per_day: 100,
      max_autobot_threads: null,
      max_http_triggers: 20,
      max_schedule_triggers: 20,
      max_vault_entries: 50,
      execution_mode: true,
    },
    day_pass: { amount: 9900, currency: "INR", days: 1 },
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price_monthly: null,
    price_yearly: null,
    limits: {
      max_workflows: null,
      max_scripts: null,
      max_script_executions_per_month: null,
      max_workflow_runs_per_month: null,
      max_autobot_admin_messages_per_day: null,
      max_autobot_threads: null,
      max_http_triggers: null,
      max_schedule_triggers: null,
      max_vault_entries: null,
      execution_mode: true,
    },
  },
];

export const PLAN_DESCRIPTIONS: Record<PlanKey, string> = {
  free: "Perfect for getting started",
  pro: "For power users and creators",
  enterprise: "For teams and organizations",
};

const PLAN_EXTRAS: Record<PlanKey, string[]> = {
  free: ["Community support"],
  pro: ["Priority support"],
  enterprise: [
    "All Pro features",
    "Dedicated support",
    "Custom integrations",
    "SLA guarantee",
  ],
};

const qty = (n: number | null, singular: string, plural = `${singular}s`) =>
  n === null ? `Unlimited ${plural}` : `${n} ${n === 1 ? singular : plural}`;

const perPeriod = (n: number | null, what: string, period: string) =>
  n === null ? `Unlimited ${what}` : `${n} ${what} / ${period}`;

export function planFeatures(plan: PlanInfo): string[] {
  const l = plan.limits;
  const numeric = [
    l.max_workflows,
    l.max_scripts,
    l.max_workflow_runs_per_month,
    l.max_script_executions_per_month,
    l.max_autobot_threads,
    l.max_autobot_admin_messages_per_day,
    l.max_http_triggers,
    l.max_schedule_triggers,
    l.max_vault_entries,
  ];

  // A plan with no numeric caps at all reads better as one line.
  if (numeric.every((n) => n === null)) {
    return ["Unlimited everything", ...PLAN_EXTRAS[plan.key]];
  }

  const triggers =
    l.max_http_triggers === null && l.max_schedule_triggers === null
      ? "Unlimited triggers"
      : `${qty(l.max_http_triggers, "HTTP trigger")} & ${qty(l.max_schedule_triggers, "schedule trigger")}`;

  const features = [
    qty(l.max_workflows, "workflow"),
    qty(l.max_scripts, "script"),
    perPeriod(l.max_workflow_runs_per_month, "workflow runs", "month"),
    perPeriod(l.max_script_executions_per_month, "script executions", "month"),
    qty(l.max_autobot_threads, "Autobot thread"),
    perPeriod(l.max_autobot_admin_messages_per_day, "Autobot AI messages", "day"),
    triggers,
    qty(l.max_vault_entries, "vault entry", "vault entries"),
  ];
  if (l.execution_mode) features.push("Execution mode (AI-driven runs)");
  return [...features, ...PLAN_EXTRAS[plan.key]];
}

/** "$15" for whole-dollar USD plan prices (PLAN_DISPLAY is in USD). */
export const formatUsd = (n: number) => `$${n}`;

/** Format a minor-unit amount (e.g. paise) in its currency: 9900 INR → "₹99". */
export function formatMinorAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(0)} ${currency}`;
  }
}

/** Percentage saved by paying yearly vs 12 × monthly (e.g. 15/120 → 33). */
export function yearlySavingsPct(monthly: number, yearly: number): number {
  if (!monthly || !yearly) return 0;
  return Math.round((1 - yearly / (monthly * 12)) * 100);
}

/** "24 hours" for a 1-day pass, otherwise "N days". */
export const dayPassDuration = (days: number) =>
  days === 1 ? "24 hours" : `${days} days`;
