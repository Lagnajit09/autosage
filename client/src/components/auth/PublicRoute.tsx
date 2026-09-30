import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import Loader from "../Loader";
import { DEFAULT_AFTER_AUTH, redirectFromSearch } from "@/lib/redirect";

const PublicRoute = () => {
  const { isSignedIn, isLoaded } = useAuth();
  const location = useLocation();

  // Show loading state while checking authentication
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-black dark:to-gray-900">
        <Loader />
      </div>
    );
  }

  // Signed-in users skip the public pages. Honour `redirect_url` here too: the
  // moment Clerk flips `isSignedIn` after sign-in/sign-up this component
  // re-renders, so it must agree with the form's own post-auth navigation.
  if (isSignedIn) {
    const target = redirectFromSearch(location.search) ?? DEFAULT_AFTER_AUTH;
    return <Navigate to={target} replace />;
  }

  return <Outlet />;
};

export default PublicRoute;
