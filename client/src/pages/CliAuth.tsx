import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, ShieldX, TerminalSquare } from "lucide-react";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  approveCliLogin,
  denyCliLogin,
  getCliLoginRequest,
  type CliLoginRequest,
} from "@/lib/api/sagecode";
import { SAGECODE_URL } from "@/lib/api-client";

type Phase =
  | { name: "enter"; error?: string }
  | { name: "loading" }
  | { name: "review"; request: CliLoginRequest; busy: "approve" | "deny" | null; error?: string }
  | { name: "approved"; request: CliLoginRequest }
  | { name: "denied" };

/** 'wdjb mjht' / 'WDJBMJHT' -> 'WDJB-MJHT'; partial input keeps its hyphen once 5+ letters. */
const formatCode = (value: string) => {
  const letters = value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
  return letters.length > 4 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : letters;
};

const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true });

const SageCodeMark = ({ className = "h-7 w-auto" }: { className?: string }) => (
  <>
    <img src="/sagecode-mark-light.svg" alt="" className={`${className} dark:hidden`} />
    <img src="/sagecode-mark-dark.svg" alt="" className={`${className} hidden dark:block`} />
  </>
);

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
    <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
    <dd className="min-w-0 truncate text-right font-medium text-gray-900 dark:text-gray-100">{value}</dd>
  </div>
);

/**
 * Approves a `sagex auth login`. The CLI opens /cli-auth?code=XXXX-XXXX (or the
 * user types the code here, e.g. when signing in over SSH); after a check that the
 * code matches the terminal, Approve hands that device a session. ProtectedRoute
 * has already made sure the user is signed in to Autosage.
 */
const CliAuth = () => {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCode = formatCode(searchParams.get("code") ?? "");

  const [typed, setTyped] = useState(urlCode);
  const [phase, setPhase] = useState<Phase>(
    urlCode.length === 9 ? { name: "loading" } : { name: "enter" },
  );

  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  const lookup = useCallback(
    async (code: string) => {
      setPhase({ name: "loading" });
      try {
        const token = await getToken();
        if (!token) throw new Error("Your Autosage session ended. Sign in again.");
        const request = await getCliLoginRequest(token, code);
        setPhase({ name: "review", request, busy: null });
      } catch (err) {
        setPhase({ name: "enter", error: (err as Error).message });
      }
    },
    [getToken],
  );

  useEffect(() => {
    if (urlCode.length === 9) lookup(urlCode);
  }, [urlCode, lookup]);

  const submitCode = (event: React.FormEvent) => {
    event.preventDefault();
    const code = formatCode(typed);
    if (code.length !== 9) {
      setPhase({ name: "enter", error: "Codes have 8 letters, like WDJB-MJHT." });
      return;
    }
    // Put the code in the URL, which triggers the lookup (and survives a reload).
    if (code === urlCode) lookup(code);
    else setSearchParams({ code }, { replace: true });
  };

  const decide = async (approve: boolean) => {
    if (phase.name !== "review") return;
    const { request } = phase;
    setPhase({ ...phase, busy: approve ? "approve" : "deny", error: undefined });
    try {
      const token = await getToken();
      if (!token) throw new Error("Your Autosage session ended. Sign in again.");
      if (approve) {
        await approveCliLogin(token, request.user_code);
        setPhase({ name: "approved", request });
      } else {
        await denyCliLogin(token, request.user_code);
        setPhase({ name: "denied" });
      }
    } catch (err) {
      setPhase({ name: "review", request, busy: null, error: (err as Error).message });
    }
  };

  const startOver = () => {
    setTyped("");
    setSearchParams({}, { replace: true });
    setPhase({ name: "enter" });
  };

  return (
    <div className="w-full min-h-screen flex justify-center p-4 bg-gray-100 dark:bg-gray-950 dark:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] dark:from-purple-900/25 dark:via-gray-950/20 dark:to-gray-950">
      <div className="w-full flex flex-col items-center animate-fade-in">
        <div className="mt-10 mb-8 md:mt-20">
          <div className="px-6 py-3 bg-white/50 dark:bg-purple-900/20 backdrop-blur-md border border-gray-200 dark:border-purple-500/30 rounded-full flex items-center justify-center shadow-xl">
            <Logo />
          </div>
        </div>

        <Card className="w-full max-w-md border-border/50 bg-card/95 dark:bg-gray-800/40 dark:border-gray-700/50 backdrop-blur-sm shadow-xl animate-scale-in">
          {phase.name === "loading" && (
            <CardContent className="flex flex-col items-center gap-3 py-16 text-sm text-gray-500 dark:text-gray-400">
              <Spinner />
              Looking up your sign-in request…
            </CardContent>
          )}

          {phase.name === "enter" && (
            <>
              <CardHeader className="space-y-1">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                  <SageCodeMark className="h-6 w-auto" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight text-center text-gray-900 dark:text-white">
                  Sign in to SageCode
                </CardTitle>
                <CardDescription className="text-center text-gray-500 dark:text-gray-400">
                  Enter the code shown in your terminal after running{" "}
                  <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                    sagex auth login
                  </code>
                  .
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitCode} className="grid gap-4">
                  <Input
                    value={typed}
                    onChange={(e) => setTyped(formatCode(e.target.value))}
                    placeholder="WDJB-MJHT"
                    aria-label="Sign-in code"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    className="h-12 text-center font-mono text-xl tracking-[0.3em] uppercase bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  {phase.error && (
                    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                      {phase.error}
                    </p>
                  )}
                  <Button
                    type="submit"
                    disabled={typed.length !== 9}
                    className="w-full bg-[#7429a7] hover:bg-[#8a3fd6] text-white"
                  >
                    Continue
                  </Button>
                  <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                    Don't have SageCode yet?{" "}
                    <a
                      href={`${SAGECODE_URL}/install.html`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[#7429a7] underline-offset-4 hover:underline dark:text-[#d4b0eb]"
                    >
                      Install it
                    </a>
                  </p>
                </form>
              </CardContent>
            </>
          )}

          {phase.name === "review" && (
            <>
              <CardHeader className="space-y-1">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                  <SageCodeMark className="h-6 w-auto" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight text-center text-gray-900 dark:text-white">
                  Authorize SageCode?
                </CardTitle>
                <CardDescription className="text-center text-gray-500 dark:text-gray-400">
                  A device wants to use your Autosage account
                  {email ? <> (<span className="font-medium">{email}</span>)</> : null} from the
                  command line.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-center dark:border-purple-500/30 dark:bg-purple-500/10">
                  <p className="font-mono text-2xl font-semibold tracking-[0.25em] text-gray-900 dark:text-white">
                    {phase.request.user_code}
                  </p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    Only approve if this matches the code in your terminal.
                  </p>
                </div>

                <dl className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  <Detail label="Device" value={phase.request.device_name || "Unknown"} />
                  <Detail label="System" value={phase.request.client_os || "Unknown"} />
                  <Detail label="SageCode" value={phase.request.cli_version ? `v${phase.request.cli_version}` : "Unknown"} />
                  {phase.request.request_ip && <Detail label="IP address" value={phase.request.request_ip} />}
                  <Detail label="Requested" value={ago(phase.request.created_at)} />
                </dl>

                <p className="flex gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <TerminalSquare className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  It will be able to manage your workflows, scripts, vault, triggers and runs as
                  you, until you sign it out or revoke it from your profile.
                </p>

                {phase.error && (
                  <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                    {phase.error}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => decide(false)}
                    disabled={phase.busy !== null}
                    className="border-gray-300 bg-white text-gray-900 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                  >
                    {phase.busy === "deny" ? "Denying…" : "Deny"}
                  </Button>
                  <Button
                    onClick={() => decide(true)}
                    disabled={phase.busy !== null}
                    className="bg-[#7429a7] hover:bg-[#8a3fd6] text-white"
                  >
                    {phase.busy === "approve" ? "Approving…" : "Approve"}
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {phase.name === "approved" && (
            <CardHeader className="space-y-1 pb-8">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight text-center text-gray-900 dark:text-white">
                SageCode is signed in
              </CardTitle>
              <CardDescription className="text-center text-gray-500 dark:text-gray-400">
                {phase.request.device_name || "Your device"} can now use your account. Head back
                to your terminal; you can close this tab.
              </CardDescription>
              <p className="pt-3 text-center text-sm">
                <Link
                  to="/profile#sagecode"
                  className="font-medium text-[#7429a7] underline-offset-4 hover:underline dark:text-[#d4b0eb]"
                >
                  Manage your devices
                </Link>
              </p>
            </CardHeader>
          )}

          {phase.name === "denied" && (
            <CardHeader className="space-y-1 pb-8">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <ShieldX className="h-6 w-6 text-gray-600 dark:text-gray-300" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight text-center text-gray-900 dark:text-white">
                Sign-in denied
              </CardTitle>
              <CardDescription className="text-center text-gray-500 dark:text-gray-400">
                That device didn't get access to your account. If you didn't start this sign-in,
                there's nothing else to do.
              </CardDescription>
              <p className="pt-3 text-center text-sm">
                <button
                  type="button"
                  onClick={startOver}
                  className="font-medium text-[#7429a7] underline-offset-4 hover:underline dark:text-[#d4b0eb]"
                >
                  Enter a different code
                </button>
              </p>
            </CardHeader>
          )}
        </Card>
      </div>
    </div>
  );
};

export default CliAuth;
