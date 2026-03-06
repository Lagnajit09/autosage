import AuthHeader from "@/components/auth/AuthHeader";
import { SignUpForm } from "@/components/auth/SignUpForm";
import Logo from "@/components/Logo";

const Signup = () => {
  return (
    <div className="w-full min-h-screen flex justify-center p-4 bg-gray-50 dark:bg-gray-950 dark:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] dark:from-sky-900/20 dark:via-gray-950/20 dark:to-gray-950">
      <div className="w-full min-h-full animate-fade-in flex flex-col items-center">
        <div className="w-full max-w-5xl animate-scale-in">
          {/* Header */}
          <AuthHeader route="/signin" />

          <div className="flex flex-col items-center justify-center mt-6 md:mt-6">
            {/* Logo */}
            <div className="mb-6 opacity-0 animate-[fade-in_0.6s_ease-out_0.4s_forwards]">
              <div className="px-6 py-3 bg-white/50 dark:bg-purple-900/20 backdrop-blur-md border border-gray-200 dark:border-purple-500/30 rounded-full flex items-center justify-center hover:scale-105 transition-transform duration-300 shadow-xl shadow-purple-500/10 dark:shadow-purple-900/20">
                <Logo />
              </div>
            </div>

            {/* Form */}
            <div className="max-w-md w-full opacity-0 animate-[fade-in_0.6s_ease-out_0.6s_forwards]">
              <SignUpForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
