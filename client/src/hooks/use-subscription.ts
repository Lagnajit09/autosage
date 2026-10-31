import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { getSubscription, type Subscription } from "@/lib/api/billing";

/**
 * The signed-in user's subscription, for UI that differs by plan (e.g. the
 * Dashboard's Pro / plan banner). `sub` is null while loading or if the request
 * failed; check `loading` to tell those apart.
 */
export const useSubscription = (): { sub: Subscription | null; loading: boolean } => {
  const { getToken } = useAuth();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const data = token ? await getSubscription(token) : null;
        if (!cancelled) setSub(data);
      } catch {
        if (!cancelled) setSub(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  return { sub, loading };
};
