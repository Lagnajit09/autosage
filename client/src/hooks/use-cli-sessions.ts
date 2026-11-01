import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { listCliSessions, type CliSessionList } from "@/lib/api/sagecode";

/**
 * The signed-in user's working SageCode (CLI) sessions, for the Profile page
 * and the Dashboard banner. `data` is null while loading or if the request
 * failed; `error` holds the failure message. `refresh()` refetches quietly
 * (e.g. after a revoke, keeping the list on screen); `retry()` refetches with
 * the loading state shown (e.g. "Try again" after an error).
 */
export const useCliSessions = () => {
  const { getToken } = useAuth();
  const [data, setData] = useState<CliSessionList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isCancelled: () => boolean = () => false, showLoading = false) => {
      if (showLoading) {
        setLoading(true);
        setError(null);
      }
      try {
        const token = await getToken();
        const result = token ? await listCliSessions(token) : null;
        if (isCancelled()) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (isCancelled()) return;
        setData(null);
        setError(err instanceof Error ? err.message : "Couldn't load your SageCode sessions.");
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [getToken],
  );

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(() => load(), [load]);
  const retry = useCallback(() => load(undefined, true), [load]);

  return { data, loading, error, refresh, retry };
};
