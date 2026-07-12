import { apiRequest } from "../api-client";

const BILLING_BASE = "/api/billing";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlanKey = "free" | "pro" | "enterprise";

export interface PlanDisplay {
  name: string;
  price_monthly: number | null;
  price_yearly: number | null;
}

export interface PlanLimits {
  max_workflows: number | null;
  max_scripts: number | null;
  max_script_executions_per_month: number | null;
  max_workflow_runs_per_month: number | null;
  max_autobot_admin_messages_per_day: number | null;
  max_autobot_threads: number | null;
  max_http_triggers: number | null;
  max_schedule_triggers: number | null;
  max_vault_entries: number | null;
}

export interface BillingUsage {
  workflows: number;
  scripts: number;
  script_executions_this_month: number;
  workflow_runs_this_month: number;
  autobot_threads: number;
  http_triggers: number;
  schedule_triggers: number;
  vault_entries: number;
}

export interface Subscription {
  plan: PlanKey;
  plan_display: PlanDisplay;
  status: "active" | "cancelled" | "expired";
  is_admin: boolean;
  billing_interval: "monthly" | "yearly" | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  limits: PlanLimits;
  execution_mode: boolean;
  usage: BillingUsage;
}

export interface CheckoutSession {
  subscription_id: string;
  key_id: string;
  interval: "monthly" | "yearly";
  already_subscribed?: boolean;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  date: number | null;
  description: string;
}

export interface PlanInfo {
  key: PlanKey;
  name: string;
  price_monthly: number | null;
  price_yearly: number | null;
  limits: PlanLimits & { execution_mode: boolean };
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const getSubscription = async (token: string): Promise<Subscription> => {
  const res = await apiRequest(`${BILLING_BASE}/subscription/`, {}, token);
  return res.data as Subscription;
};

export const createCheckout = async (
  token: string,
  interval: "monthly" | "yearly"
): Promise<CheckoutSession> => {
  const res = await apiRequest(
    `${BILLING_BASE}/checkout/`,
    { method: "POST", body: JSON.stringify({ interval }) },
    token
  );
  return res.data as CheckoutSession;
};

export const cancelSubscription = async (
  token: string
): Promise<{ cancelled_at: string }> => {
  const res = await apiRequest(
    `${BILLING_BASE}/cancel/`,
    { method: "POST" },
    token
  );
  return res.data;
};

export const getInvoices = async (token: string): Promise<Invoice[]> => {
  const res = await apiRequest(`${BILLING_BASE}/invoices/`, {}, token);
  return (res.data ?? []) as Invoice[];
};

export const getPlans = async (token: string): Promise<PlanInfo[]> => {
  const res = await apiRequest(`${BILLING_BASE}/plans/`, {}, token);
  return (res.data ?? []) as PlanInfo[];
};
