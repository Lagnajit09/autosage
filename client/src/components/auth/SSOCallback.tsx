import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import { Spinner } from "@/components/ui/spinner";

export function SSOCallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center">
        <Spinner size="lg" className="mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Completing authentication...
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Please wait while we sign you in
        </p>
      </div>
      <AuthenticateWithRedirectCallback />
    </div>
  );
}
