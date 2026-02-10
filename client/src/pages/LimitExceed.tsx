import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

interface LimitExceedProps {
  header?: string;
  userMessage?: string;
  errorCode?: string | number;
}

const LimitExceed = ({
  header = "429 Limit Exceeded",
  userMessage = "Oops! Too many requests. Please try again later.",
  errorCode = "429",
}: LimitExceedProps) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-950 p-4 overflow-hidden relative">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/5 rounded-full blur-3xl opacity-50" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="z-10 max-w-md w-full text-center space-y-6"
      >
        <div className="flex justify-center">
          <motion.div
            initial={{ scale: 0.8, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20,
              delay: 0.1,
            }}
            className="w-24 h-24 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-2 shadow-lg"
          >
            <AlertCircle className="w-12 h-12 text-red-600 dark:text-red-400" />
          </motion.div>
        </div>

        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-5xl drop-shadow-sm">
            {header}
          </h1>
          <p className="text-lg text-muted-foreground max-w-[320px] mx-auto leading-relaxed">
            {userMessage}
          </p>
        </div>

        <div className="pt-6 flex justify-center gap-4">
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate(-1)}
            className="gap-2 min-w-[120px]"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
          <Button
            size="lg"
            onClick={() => navigate("/dashboard")}
            className="gap-2 min-w-[120px] bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg transition-all"
          >
            <Home className="w-4 h-4" />
            Dashboard
          </Button>
        </div>
      </motion.div>

      {/* Footer text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="absolute bottom-8 text-sm text-muted-foreground/60"
      >
        Error Code: {errorCode}
      </motion.p>
    </div>
  );
};

export default LimitExceed;
