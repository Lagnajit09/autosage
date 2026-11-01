import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowUpRight,
  Check,
  Copy,
  KeyRound,
  Laptop,
  Plus,
  ServerCog,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useCliSessions } from "@/hooks/use-cli-sessions";
import {
  createCliToken,
  revokeCliSession,
  type CliSession,
  type CliSessionKind,
} from "@/lib/api/sagecode";
import { SAGECODE_URL } from "@/lib/api-client";

const INSTALL_COMMAND = "uv tool install sagex-cli";

const KIND_META: Record<
  CliSessionKind,
  { icon: LucideIcon; badge: string | null }
> = {
  device: { icon: Laptop, badge: null },
  token: { icon: KeyRound, badge: "CI token" },
  admin: { icon: ServerCog, badge: "Issued key" },
};

// Outline buttons need explicit dark colours: the variant doesn't follow this app's dark theme.
const OUTLINE =
  "border-gray-300 bg-white text-gray-900 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800";

const plural = (n: number, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

const lastActive = (session: CliSession) => {
  if (!session.last_used_at)
    return `Signed in ${format(new Date(session.created_at), "MMM d, yyyy")}`;
  return `Active ${formatDistanceToNow(new Date(session.last_used_at), { addSuffix: true })}`;
};

const SessionRow = ({
  session,
  onRevoke,
}: {
  session: CliSession;
  onRevoke: (session: CliSession) => void;
}) => {
  const { icon: Icon, badge } = KIND_META[session.kind] ?? KIND_META.admin;
  const details = [
    session.client_os,
    session.cli_version && `v${session.cli_version}`,
    session.last_ip,
    `sgx_…${session.last4}`,
  ].filter(Boolean);
  const activity = [
    plural(session.commands_run, "command"),
    plural(session.runs_started, "run") + " started",
    session.last_command && `last: ${session.last_command}`,
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 gap-3">
        <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-[#7429a7] dark:border-gray-700 dark:bg-gray-800/60 dark:text-[#d4b0eb]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
              {session.name || "Unnamed session"}
            </p>
            {badge && (
              <Badge
                variant="secondary"
                className="flex-shrink-0 border-0 bg-purple-100 text-[11px] text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
              >
                {badge}
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            {details.join(" · ")}
          </p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            {activity.join(" · ")}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 pl-12 sm:justify-end sm:pl-0">
        <span className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
          {lastActive(session)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRevoke(session)}
          className="flex-shrink-0 border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-900/20"
        >
          Revoke
        </Button>
      </div>
    </li>
  );
};

/** Placeholder in the shape of the loaded section: stat tiles, session rows, footer. */
const SessionsSkeleton = () => (
  <div aria-busy="true" aria-label="Loading your SageCode sessions">
    <div className="grid grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/60">
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-3 w-24 max-w-full" />
        </div>
      ))}
    </div>
    <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 py-4">
          <Skeleton className="h-9 w-9 flex-shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-72 max-w-full" />
            <Skeleton className="h-3 w-52 max-w-full" />
          </div>
          <Skeleton className="hidden h-3 w-28 sm:block" />
          <Skeleton className="h-8 w-[4.5rem] flex-shrink-0" />
        </li>
      ))}
    </ul>
  </div>
);

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/60">
    <p className="text-xl font-bold text-gray-900 dark:text-white">
      {value.toLocaleString()}
    </p>
    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
  </div>
);

/**
 * SageCode (the `sagex` CLI) on the Profile page: every device and token signed
 * in to the user's account, what each has done, and Revoke. Also where CI
 * tokens are created. It's the Profile page's SageCode tab: /profile#sagecode.
 */
export const SageCodeSessions = () => {
  const { getToken } = useAuth();
  const { data, loading, error, refresh, retry } = useCliSessions();
  const sessions = data?.sessions ?? [];

  const [revoking, setRevoking] = useState<CliSession | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const totals = sessions.reduce(
    (acc, s) => ({
      commands: acc.commands + s.commands_run,
      runs: acc.runs + s.runs_started,
    }),
    { commands: 0, runs: 0 },
  );

  const confirmRevoke = async () => {
    if (!revoking) return;
    setRevokeBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session ended. Sign in again.");
      await revokeCliSession(token, revoking.id);
      toast({
        title: "Session revoked",
        description: `${revoking.name || "That session"} is signed out of SageCode.`,
      });
      setRevoking(null);
      refresh();
    } catch (err) {
      toast({
        title: "Couldn't revoke",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setRevokeBusy(false);
    }
  };

  const createToken = async (event: React.FormEvent) => {
    event.preventDefault();
    setTokenBusy(true);
    setTokenError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session ended. Sign in again.");
      const created = await createCliToken(token, tokenName.trim());
      setNewToken(created.api_key);
      refresh();
    } catch (err) {
      setTokenError((err as Error).message);
    } finally {
      setTokenBusy(false);
    }
  };

  const closeTokenDialog = (open: boolean) => {
    if (open) return;
    setTokenOpen(false);
    // Forget the plaintext as soon as the dialog closes.
    setNewToken(null);
    setTokenName("");
    setTokenError(null);
    setCopied(false);
  };

  const copyToken = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
    } catch {
      // Clipboard blocked: the token stays selectable in the field.
    }
  };

  return (
    <section className="space-y-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 dark:bg-black">
            <img src="/sagecode-mark-dark.svg" alt="" className="h-5 w-auto" />
          </span>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Sage<span className="text-[#7429a7] dark:text-[#d4b0eb]">Code</span>
          </h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTokenOpen(true)}
          className={OUTLINE}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Create token
        </Button>
      </div>

      <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 shadow-sm">
        <CardContent className="p-6">
          {loading ? (
            <SessionsSkeleton />
          ) : error ? (
            <div className="flex flex-col items-start gap-3">
              {/* The raw error is often a bare "An error occurred" (e.g. a 404 page
                  with no JSON body), so say plainly what failed instead. */}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Couldn't load your SageCode sessions right now.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => retry()}
                className={OUTLINE}
              >
                Try again
              </Button>
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                SageCode isn't signed in anywhere yet
              </p>
              <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
                SageCode is Autosage in your terminal. Install it, then run{" "}
                <code className="whitespace-nowrap font-mono text-[0.9em]">
                  sagex auth login
                </code>{" "}
                and approve the sign-in here.
              </p>
              <code className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900 dark:border-gray-700 dark:bg-black dark:text-gray-100">
                <span className="select-none text-[#d77757]">$ </span>
                {INSTALL_COMMAND}
              </code>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Stat
                  label={
                    sessions.length === 1 ? "Active session" : "Active sessions"
                  }
                  value={sessions.length}
                />
                <Stat label="Commands run" value={totals.commands} />
                <Stat label="Runs started" value={totals.runs} />
              </div>
              <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
                {sessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    onRevoke={setRevoking}
                  />
                ))}
              </ul>
            </>
          )}

          <div className="mt-6 flex flex-col gap-2 border-t border-gray-100 pt-4 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Sessions unused for {data?.idle_expiry_days ?? 90} days sign out
              automatically.
            </span>
            <a
              href={SAGECODE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[#7429a7] hover:underline underline-offset-4 dark:text-[#d4b0eb]"
            >
              About SageCode
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Revoke confirmation */}
      <Dialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
      >
        <DialogContent className="sm:max-w-[420px] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Revoke {revoking?.name || "this session"}?
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              {revoking?.kind === "token"
                ? "Anything using this token, like a CI job, stops working right away."
                : "SageCode on that device is signed out right away. It can sign in again with sagex auth login."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevoking(null)}
              className={OUTLINE}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmRevoke}
              disabled={revokeBusy}
              className="bg-red-600 hover:bg-red-700 text-white border-none"
            >
              {revokeBusy ? "Revoking…" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create a CI token */}
      <Dialog open={tokenOpen} onOpenChange={closeTokenDialog}>
        <DialogContent className="sm:max-w-[460px] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          {newToken ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-gray-900 dark:text-white">
                  Copy your token
                </DialogTitle>
                <DialogDescription className="text-gray-500 dark:text-gray-400">
                  This is the only time it's shown. Store it as a secret, for
                  example <code className="font-mono">SAGEX_API_KEY</code> in
                  your CI settings.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={newToken}
                  onFocus={(e) => e.target.select()}
                  aria-label="New token"
                  className="font-mono text-xs bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyToken}
                  aria-label={copied ? "Copied" : "Copy token"}
                  className={`flex-shrink-0 ${OUTLINE}`}
                >
                  {copied ? <Check className="text-green-600" /> : <Copy />}
                </Button>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => closeTokenDialog(false)}
                  className="bg-[#7429a7] hover:bg-[#8a3fd6] text-white"
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={createToken} className="grid gap-4">
              <DialogHeader>
                <DialogTitle className="text-gray-900 dark:text-white">
                  Create a token
                </DialogTitle>
                <DialogDescription className="text-gray-500 dark:text-gray-400">
                  For CI jobs and machines where you can't run{" "}
                  <code className="font-mono">sagex auth login</code>. It acts
                  as you, so keep it secret.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label
                  htmlFor="token-name"
                  className="text-sm text-gray-700 dark:text-gray-300"
                >
                  Name
                </Label>
                <Input
                  id="token-name"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="GitHub Actions"
                  maxLength={100}
                  autoFocus
                  className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-none"
                />
                {tokenError && (
                  <p className="text-sm text-red-500 dark:text-red-400">
                    {tokenError}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => closeTokenDialog(false)}
                  className={OUTLINE}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={tokenBusy || !tokenName.trim()}
                  className="bg-[#7429a7] hover:bg-[#8a3fd6] text-white"
                >
                  {tokenBusy ? "Creating…" : "Create token"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};
