import React from "react";
import { Link } from "react-router-dom";

const AuthHeader = ({ route }: { route: string }) => {
  return (
    <div className="w-full flex items-center justify-between mb-8 opacity-0 animate-[fade-in_0.6s_ease-out_0.2s_forwards]">
      <Link
        to="/"
        className="text-gray-700 dark:text-gray-400 hover:text-foreground transition-all duration-200 flex items-center gap-2 text-sm hover:scale-105"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to Home
      </Link>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-700 dark:text-gray-400">
          {route === "/signin" ? "Already a member?" : "New to AutoSage?"}
        </span>
        <Link
          to={route}
          className="text-gray-900 dark:text-gray-100 hover:text-primary transition-all duration-200 border border-border hover:border-primary px-4 py-1.5 rounded-full hover:shadow-sm hover:scale-105 font-medium"
        >
          {route === "/signin" ? "Sign In" : "Sign Up"}
        </Link>
      </div>
    </div>
  );
};

export default AuthHeader;
