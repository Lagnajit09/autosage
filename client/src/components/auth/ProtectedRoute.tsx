import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import Loader from "../Loader";
import { getAccountStatus } from "@/lib/api/user";

// The reactivation page itself lives behind ProtectedRoute (the user is signed
// into Clerk, just deactivated in Django) — never gate it, or it can't render.
const REACTIVATION_PATH = "/account-activation-request";

const ProtectedRoute = () => {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const location = useLocation();

  // null = not yet checked, true/false = resolved active state
  const [isActive, setIsActive] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkStatus = async () => {
      if (!isSignedIn) return;
      try {
        const token = await getToken();
        if (!token) {
          if (!cancelled) setIsActive(true); // let downstream calls surface auth issues
          return;
        }
        const status = await getAccountStatus(token);
        if (!cancelled) {
          setIsActive(!(status.exists && status.is_active === false));
        }
      } catch {
        // On failure, don't lock the user out of the app for a transient error.
        if (!cancelled) setIsActive(true);
      }
    };

    checkStatus();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  // Show loading state while checking authentication
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-black dark:to-gray-900">
        <Loader />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/signin" replace />;
  }

  // Always allow the reactivation page through without a status gate.
  if (location.pathname === REACTIVATION_PATH) {
    return <Outlet />;
  }

  // Wait for the account-status check before rendering protected content.
  if (isActive === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-black dark:to-gray-900">
        <Loader />
      </div>
    );
  }

  if (!isActive) {
    return <Navigate to={REACTIVATION_PATH} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
