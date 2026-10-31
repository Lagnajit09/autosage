import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  Copy,
  GitBranch,
  ShieldCheck,
  Terminal,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SAGECODE_URL } from "@/lib/api-client";

const INSTALL_COMMAND = "uv tool install sagex-cli";

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Terminal, title: "Run and watch live", text: "Start any workflow or script and follow it node by node." },
  { icon: Webhook, title: "Webhooks and schedules", text: "Set up HTTP triggers and cron schedules from your shell." },
  { icon: GitBranch, title: "Made for CI/CD", text: "Exit codes and --json output slot into any pipeline." },
  { icon: ShieldCheck, title: "Secrets stay secret", text: "Keys live in your OS keychain, never on disk." },
];

// Introduces SageCode (the `sagex` CLI) on the landing page; the hero's "New"
// pill links here (#sagecode).
export default function SageCodeSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [copied, setCopied] = useState(false);

  const copyInstall = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (permissions / insecure context): the command stays selectable.
    }
  };

  return (
    <section id="sagecode" ref={ref} className="py-20 md:py-24 relative scroll-mt-8">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950"
        >
          {/* Same blueprint grid as the hero, fading out from the top-left. */}
          <div
            className="pointer-events-none absolute inset-0 opacity-70 [background-size:20px_20px] [background-image:linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)] dark:[background-image:linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]"
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-purple-500/20 blur-3xl" aria-hidden="true" />

          <div className="relative grid items-center gap-10 p-6 md:p-12 lg:grid-cols-[1fr_1.1fr]">
            <div className="min-w-0">
              <a
                href={SAGECODE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-purple-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
              >
                <img src="/sagecode-mark-light.svg" alt="" className="h-4 w-auto dark:hidden" />
                <img src="/sagecode-mark-dark.svg" alt="" className="hidden h-4 w-auto dark:block" />
                <span>
                  New · <span className="font-semibold">Sage<span className="text-[#7429a7] dark:text-[#d4b0eb]">Code</span></span> v1.0
                </span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>

              <h2 className="mt-5 bg-gradient-to-b from-gray-900 to-gray-600 bg-clip-text text-3xl font-bold tracking-tight text-transparent dark:from-white dark:to-gray-400 md:text-5xl">
                Autosage, in your terminal.
              </h2>
              <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
                SageCode is the command line for Autosage. Build, run and watch your workflows,
                scripts, webhooks and schedules without leaving your shell, all with one command:{" "}
                <code className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 font-mono text-[0.9em] text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
                  sagex
                </code>
                .
              </p>

              <ul className="mt-8 grid gap-5 sm:grid-cols-2">
                {FEATURES.map(({ icon: Icon, title, text }) => (
                  <li key={title} className="flex gap-3">
                    <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-[#7429a7] dark:border-neutral-800 dark:bg-neutral-900 dark:text-[#d4b0eb]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
                      <span className="block text-sm text-muted-foreground">{text}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex max-w-md items-center gap-3 rounded-xl border border-neutral-200 bg-white py-2.5 pl-4 pr-2.5 font-mono text-sm dark:border-neutral-800 dark:bg-black">
                <span className="select-none text-[#d77757]">$</span>
                <code className="min-w-0 flex-1 truncate text-neutral-900 dark:text-neutral-100">{INSTALL_COMMAND}</code>
                <button
                  type="button"
                  onClick={copyInstall}
                  aria-label={copied ? "Copied" : "Copy install command"}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 transition-colors hover:text-neutral-900 dark:border-neutral-800 dark:hover:text-white"
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="gap-1.5 bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
                >
                  <a href={SAGECODE_URL} target="_blank" rel="noopener noreferrer">
                    Explore SageCode
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </Button>
                {/* Explicit colours, like the hero's secondary button: the outline
                    variant doesn't pick up this app's dark theme. */}
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border border-gray-300 bg-white text-black hover:bg-gray-100 dark:border-gray-700 dark:bg-black dark:text-white dark:hover:bg-gray-900"
                >
                  <a href={`${SAGECODE_URL}/install.html`} target="_blank" rel="noopener noreferrer">
                    Install guide
                  </a>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Early access: SageCode needs an Autosage API key.{" "}
                <Link to="/contact" className="font-medium text-[#7429a7] underline-offset-4 hover:underline dark:text-[#d4b0eb]">
                  Request one
                </Link>
              </p>
            </div>

            <a
              href={SAGECODE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block min-w-0 rounded-2xl border border-neutral-200 bg-neutral-100 p-2 shadow-md transition-transform duration-300 hover:-translate-y-0.5 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <img
                src="/sagecode-tui.svg"
                alt="The SageCode terminal app: workflows, scripts, vault items, recent runs and triggers on the left, and a live workflow run on the right."
                width={1726}
                height={928}
                loading="lazy"
                className="block h-auto w-full rounded-xl"
              />
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
