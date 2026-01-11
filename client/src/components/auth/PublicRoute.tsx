import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { Spinner } from "@/components/ui/spinner";

const PublicRoute = () => {
  const { isSignedIn, isLoaded } = useAuth();

  // Show loading state while checking authentication
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <Spinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is signed in, redirect to dashboard
  // Otherwise, show the public route (sign in, sign up, landing page)
  return isSignedIn ? <Navigate to="/dashboard" replace /> : <Outlet />;
};

export default PublicRoute;
