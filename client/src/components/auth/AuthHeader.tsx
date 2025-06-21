import React from "react";
import { Link } from "react-router-dom";

const AuthHeader = ({ route }: { route: string }) => {
  return (
    <div className="w-full flex items-center justify-between mb-12 opacity-0 animate-[fade-in_0.6s_ease-out_0.2s_forwards]">
      <Link
        to="/"
        className="text-gray-400 hover:text-white transition-colors duration-200 flex items-center gap-2 text-sm hover:scale-105 transform transition-transform"
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
        <span className="text-gray-400">Already a member?</span>
        <Link
          to={route}
          className="text-white hover:text-purple-300 transition-colors duration-200 border border-gray-600 hover:border-purple-500 px-3 py-1 rounded hover:scale-105 transform transition-all"
        >
          {route === "/signin" ? "Sign In" : "Sign Up"}
        </Link>
      </div>
    </div>
  );
};

export default AuthHeader;
