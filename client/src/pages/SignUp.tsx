import { SignUpForm } from "@/components/auth/SignUpForm";
import Logo from "@/components/Logo";
import { Link } from "react-router-dom";

const Signup = () => {
  return (
    <div
      className="w-[100%] min-h-screen flex justify-center p-4"
      style={{
        background:
          "linear-gradient(172deg,rgba(23, 26, 33, 1) 0%, rgba(33, 11, 79, 1) 50%, rgba(54, 0, 74, 1) 100%)",
      }}
    >
      <div className="w-full h-full animate-fade-in">
        <div className="w-full animate-scale-in">
          {/* Header */}
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
                to="/signin"
                className="text-white hover:text-purple-300 transition-colors duration-200 border border-gray-600 hover:border-purple-500 px-3 py-1 rounded hover:scale-105 transform transition-all"
              >
                Sign In
              </Link>
            </div>
          </div>

          {/* Logo */}
          <div className="flex justify-center mb-16 opacity-0 animate-[fade-in_0.6s_ease-out_0.4s_forwards]">
            <div className="p-4 bg-gradient-to-br from-purple-800/50 to-slate-800/50 backdrop-blur-sm border border-purple-700/30 rounded-lg flex items-center justify-center hover:scale-110 transition-transform duration-300">
              <Logo />
            </div>
          </div>

          {/* Form */}
          <div className="max-w-md mx-auto opacity-0 animate-[fade-in_0.6s_ease-out_0.6s_forwards]">
            <SignUpForm />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
