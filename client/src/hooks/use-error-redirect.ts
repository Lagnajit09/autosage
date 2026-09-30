import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { consumeFreshDocumentLoad, redirectFromSearch } from "@/lib/redirect";

/**
 * `redirect_url` handling for error pages (/server-error, /limit-exceeded, 404).
 *
 * - Fresh load (browser refresh / opened directly) with a `redirect_url` →
 *   go straight back to that page; the error was likely transient.
 * - Reached in-app (a request just failed) → stay and show the error, with a
 *   "Try again" action. Auto-redirecting here would loop while the server is
 *   still down.
 */
export function useErrorPageRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  const redirect = redirectFromSearch(location.search);

  // Decided once on first render so a refresh never flashes the error screen.
  const [redirecting] = useState(
    () =>
      !!redirect &&
      consumeFreshDocumentLoad(`${location.pathname}${location.search}`),
  );

  useEffect(() => {
    if (redirecting && redirect) navigate(redirect, { replace: true });
  }, [redirecting, redirect, navigate]);

  const retry = useCallback(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect, navigate]);

  return { redirect, redirecting, retry };
}
