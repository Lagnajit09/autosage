import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, Zap } from "lucide-react";

export type ActivationState = "activating" | "success";

interface ProActivationOverlayProps {
  open: boolean;
  state: ActivationState;
  /** e.g. "Pro Day Pass" or "Pro Plan" */
  planLabel?: string;
}

/**
 * Full-screen overlay shown after a successful payment while we poll the
 * backend for the activated plan. Mirrors the Dashboard first-visit welcome
 * animation (framer-motion, same layout language).
 */
const ProActivationOverlay = ({
  open,
  state,
  planLabel = "Pro Plan",
}: ProActivationOverlayProps) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white dark:bg-workflow-void"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 1.1, opacity: 0, y: -20 }}
            transition={{ delay: 0.1, duration: 0.7, ease: "easeOut" }}
            className="text-center space-y-8"
          >
            <div className="space-y-4">
              <div className="relative inline-block">
                <div className="absolute -inset-4 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full blur-2xl opacity-20 animate-pulse" />
                <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
                  {state === "success"
                    ? `${planLabel} Activated`
                    : `Activating ${planLabel}`}
                </h1>
              </div>
              <p className="text-xl text-gray-500 dark:text-gray-400 font-medium">
                {state === "success"
                  ? "You're all set — enjoy your Pro features!"
                  : "Confirming your payment…"}
              </p>
            </div>

            <div className="flex flex-col items-center gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3 px-6 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-full border border-gray-200 dark:border-gray-700/50 shadow-sm transition-all duration-300">
                {state === "success" ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Plan updated
                    </span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Setting up your Pro access…
                    </span>
                  </>
                )}
              </div>
              {state === "activating" && (
                <p className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 max-w-[300px] leading-relaxed">
                  <Zap className="w-3 h-3" />
                  This usually takes a few seconds.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ProActivationOverlay;
