import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { Spinner } from "@/components/ui/spinner";
import Loader from "../Loader";

const PublicRoute = () => {
  const { isSignedIn, isLoaded } = useAuth();

  // Show loading state while checking authentication
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-black dark:to-gray-900">
        <Loader />
      </div>
    );
  }

  // If user is signed in, redirect to dashboard
  // Otherwise, show the public route (sign in, sign up, landing page)
  return isSignedIn ? <Navigate to="/dashboard" replace /> : <Outlet />;
};

export default PublicRoute;
