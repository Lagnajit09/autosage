import { matchPath } from "react-router-dom";

/**
 * Single source of truth for per-page SEO metadata.
 *
 * Every route the app can render should have an entry here so it gets a
 * distinct <title>/description and the correct index/noindex directive.
 * Auth-gated ("app") pages are marked noIndex so they never leak into search
 * results — only the public marketing/auth surface is left indexable.
 */
export interface RouteMeta {
  /** react-router path pattern (supports params, e.g. "/workflow/:id"). */
  pattern: string;
  /** Page title; when omitted the SEO component falls back to the site title. */
  title?: string;
  /** Meta description; when omitted the SEO component uses its default. */
  description?: string;
  /** Keep the page out of search indexes. */
  noIndex?: boolean;
}

/**
 * Ordered most-specific → least-specific. `resolveRouteMeta` returns the first
 * match, so nested/dynamic routes must precede their broader siblings
 * (e.g. "/ai/autobot/dashboard" before "/ai/autobot/:id").
 */
export const ROUTE_META: RouteMeta[] = [
  // ---- Public, indexable ---------------------------------------------------
  {
    pattern: "/",
    description:
      "AutoSage: seamless automation, smarter execution. Build AI-powered workflows, run scripts on your own servers, and chat with Autobot — your intelligent automation assistant.",
    noIndex: false,
  },

  // ---- Auth (thin pages, deliberately kept out of the index) ---------------
  {
    pattern: "/signin",
    title: "Sign In",
    description:
      "Sign in to your AutoSage account and start building AI-powered workflows.",
    noIndex: true,
  },
  {
    pattern: "/signup",
    title: "Sign Up",
    description:
      "Create your free AutoSage account and start building AI-powered workflows today.",
    noIndex: true,
  },
  { pattern: "/sso-callback", title: "Signing in…", noIndex: true },

  // ---- App surface (auth-gated, never indexed) -----------------------------
  { pattern: "/dashboard", title: "Dashboard", noIndex: true },
  { pattern: "/workflows", title: "Workflows", noIndex: true },
  { pattern: "/workflow/new", title: "New Workflow", noIndex: true },
  {
    pattern: "/workflow/execution/:id",
    title: "Workflow Execution",
    noIndex: true,
  },
  { pattern: "/workflow/:id", title: "Workflow Editor", noIndex: true },
  { pattern: "/library", title: "Library", noIndex: true },
  { pattern: "/script-editor/:name", title: "Script Editor", noIndex: true },
  { pattern: "/script-editor", title: "Script Editor", noIndex: true },
  { pattern: "/raw/:id", title: "Raw Script", noIndex: true },
  { pattern: "/execution-logs", title: "Execution Logs", noIndex: true },
  { pattern: "/ai/autobot/dashboard", title: "Autobot Dashboard", noIndex: true },
  { pattern: "/ai/autobot/archived", title: "Autobot Archive", noIndex: true },
  { pattern: "/ai/autobot/:id", title: "Autobot", noIndex: true },
  { pattern: "/ai/autobot", title: "Autobot", noIndex: true },
  { pattern: "/settings", title: "Settings", noIndex: true },
  { pattern: "/profile", title: "Profile", noIndex: true },
  { pattern: "/plans", title: "Plans & Pricing", noIndex: true },
  { pattern: "/billing", title: "Billing", noIndex: true },
  {
    pattern: "/account-activation-request",
    title: "Account Reactivation",
    noIndex: true,
  },
  { pattern: "/report-bug", title: "Report a Bug", noIndex: true },
  { pattern: "/faq", title: "FAQ & Contact", noIndex: true },

  // ---- Error states --------------------------------------------------------
  { pattern: "/server-error", title: "Server Error", noIndex: true },
  { pattern: "/limit-exceeded", title: "Limit Exceeded", noIndex: true },
];

/** Fallback for any unmatched path (the catch-all 404 route). */
export const NOT_FOUND_META: RouteMeta = {
  pattern: "*",
  title: "Page Not Found",
  noIndex: true,
};

/** Resolve the metadata for a given pathname (first match wins). */
export function resolveRouteMeta(pathname: string): RouteMeta {
  for (const meta of ROUTE_META) {
    if (matchPath({ path: meta.pattern, end: true }, pathname)) {
      return meta;
    }
  }
  return NOT_FOUND_META;
}
