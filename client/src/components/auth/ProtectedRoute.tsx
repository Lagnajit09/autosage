import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import Loader from "../Loader";

const ProtectedRoute = () => {
  const { isSignedIn, isLoaded } = useAuth();

  // Show loading state while checking authentication
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-black dark:to-gray-900">
        <Loader />
      </div>
    );
  }

  return isSignedIn ? <Outlet /> : <Navigate to="/signin" replace />;
};

export default ProtectedRoute;
