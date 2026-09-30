/**
 * `redirect_url` helpers — carry the user back to where they were after
 * sign-in / sign-up / sign-out or an error page.
 *
 * Security: a redirect target is only ever honoured if it resolves to a
 * same-origin, relative path. Anything else (absolute URLs, protocol-relative
 * `//evil.com`, backslash tricks, `javascript:`) is dropped, so the param can't
 * be abused as an open redirect.
 */

export const REDIRECT_PARAM = "redirect_url";

export const DEFAULT_AFTER_AUTH = "/dashboard";

// Never bounce back into auth/transient routes — that would loop (e.g. sign in
// → redirect to /signout → signed out again) or strand the user on an error.
const NON_REDIRECTABLE = new Set([
  "/signin",
  "/signup",
  "/signout",
  "/sso-callback",
  "/server-error",
  "/limit-exceeded",
]);

/** Validate a raw redirect value; returns a safe `path?search#hash` or null. */
export function getSafeRedirect(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const value = raw.trim();
  // Must be a root-relative path, and not protocol-relative ("//x" or "/\x").
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value, window.location.origin);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  if (NON_REDIRECTABLE.has(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Append `?redirect_url=` to `path` when `redirect` is safe. Always kept, even
 * for the dashboard: error pages need it to return there on refresh.
 */
export function withRedirect(path: string, redirect: string | null | undefined): string {
  const safe = getSafeRedirect(redirect);
  if (!safe) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${REDIRECT_PARAM}=${encodeURIComponent(safe)}`;
}

/** Full in-app path for a router location (or `window.location`). */
export function pathOf(loc: { pathname: string; search?: string; hash?: string }): string {
  return `${loc.pathname}${loc.search ?? ""}${loc.hash ?? ""}`;
}

/** Read and validate `redirect_url` from a query string. */
export function redirectFromSearch(search: string): string | null {
  return getSafeRedirect(new URLSearchParams(search).get(REDIRECT_PARAM));
}

// ── Last visited page (per tab) ──────────────────────────────────────────────
// Lets /signout return the user to the page they were on even when the URL is
// typed into the address bar (a full reload, so router state is gone).
// sessionStorage is tab-scoped and survives reloads.

const LAST_PATH_KEY = "autosage:last_path";

export function rememberLastPath(path: string): void {
  if (!getSafeRedirect(path)) return;
  try {
    sessionStorage.setItem(LAST_PATH_KEY, path);
  } catch {
    /* storage unavailable (private mode) — best effort only */
  }
}

export function getLastPath(): string | null {
  try {
    return getSafeRedirect(sessionStorage.getItem(LAST_PATH_KEY));
  } catch {
    return null;
  }
}

// ── Fresh document load detection (error pages) ──────────────────────────────
// An error page should auto-return to `redirect_url` only when it was loaded
// fresh (browser refresh / direct link) — NOT when the app navigated to it
// because a request just failed, or we'd loop while the server is still down.
// Captured at module evaluation, i.e. once per document at app boot.

const DOCUMENT_ENTRY = `${window.location.pathname}${window.location.search}`;
let documentEntryConsumed = false;

/**
 * True exactly once per document, and only if `path` is the URL the document
 * was loaded on. Subsequent calls (in-app navigations back to an error page)
 * return false, so an auto-redirect can fire at most once per page load.
 */
export function consumeFreshDocumentLoad(path: string): boolean {
  if (documentEntryConsumed) return false;
  documentEntryConsumed = true;
  return path === DOCUMENT_ENTRY;
}
