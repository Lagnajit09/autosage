import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth, useClerk } from "@clerk/clerk-react";
import Loader from "@/components/Loader";
import {
  getLastPath,
  redirectFromSearch,
  withRedirect,
} from "@/lib/redirect";

/**
 * /signout — signs the user out, then lands on /signin with `redirect_url` set
 * to the page they came from, so signing back in returns them there.
 *
 * Source page, in order: explicit `?redirect_url=` (set by in-app sign-out
 * actions) → the last page visited in this tab (covers typing /signout into
 * the address bar) → none (sign-in falls back to the dashboard).
 */
const SignOut = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const location = useLocation();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (!isLoaded || started.current) return;
    started.current = true;

    const from = redirectFromSearch(location.search) ?? getLastPath();
    const target = withRedirect("/signin", from);

    if (!isSignedIn) {
      navigate(target, { replace: true });
      return;
    }
    // Clerk clears the session, then performs the navigation itself — a full
    // load, which also drops any cached per-user client state.
    void signOut({ redirectUrl: target });
  }, [isLoaded, isSignedIn, location.search, navigate, signOut]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-100 dark:bg-gray-950">
      <Loader />
      <p className="text-sm text-gray-500 dark:text-gray-400">Signing you out…</p>
    </div>
  );
};

export default SignOut;
