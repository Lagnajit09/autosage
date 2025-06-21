import AuthHeader from "@/components/auth/AuthHeader";
import { SignUpForm } from "@/components/auth/SignUpForm";
import Logo from "@/components/Logo";

const Signup = () => {
  return (
    <div
      className="w-[100%] min-h-screen flex justify-center p-4"
      style={{
        background:
          "linear-gradient(172deg,rgba(23, 26, 33, 1) 0%, rgba(33, 11, 79, 1) 50%, rgba(54, 0, 74, 1) 100%)",
      }}
    >
      <div className="w-full min-h-[100%] animate-fade-in">
        <div className="w-full animate-scale-in">
          {/* Header */}
          <AuthHeader route="/signin" />

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
