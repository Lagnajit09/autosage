import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useClerk, useUser } from "@clerk/clerk-react";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserX, MailCheck, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { requestReactivation } from "@/lib/api/user";

const AccountReactivationRequest = () => {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();

  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await requestReactivation(message.trim(), token);
      if (res.success) {
        setSent(true);
      } else {
        toast({
          title: "Couldn't send request",
          description: res.message || "Please try again later.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Couldn't send request",
        description: (err as Error).message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToSignIn = async () => {
    await signOut();
    navigate("/signin", { replace: true });
  };

  return (
    <div className="w-full min-h-screen flex justify-center p-4 bg-gray-100 dark:bg-gray-950 dark:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] dark:from-orange-900/20 dark:via-gray-950/20 dark:to-gray-950">
      <div className="w-full min-h-full animate-fade-in flex flex-col items-center">
        <div className="w-full max-w-5xl animate-scale-in">
          <div className="flex flex-col items-center justify-center mt-10 md:mt-20">
            <div className="mb-8">
              <div className="px-6 py-3 bg-white/50 dark:bg-orange-900/20 backdrop-blur-md border border-gray-200 dark:border-orange-500/30 rounded-full flex items-center justify-center shadow-xl">
                <Logo />
              </div>
            </div>

            <div className="max-w-md w-full">
              <Card className="border-border/50 bg-card/95 dark:bg-gray-800/40 dark:border-gray-700/50 backdrop-blur-sm shadow-xl">
                {sent ? (
                  <>
                    <CardHeader className="space-y-1">
                      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                        <MailCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
                      </div>
                      <CardTitle className="text-2xl font-bold tracking-tight text-center text-gray-900 dark:text-white">
                        Request sent
                      </CardTitle>
                      <CardDescription className="text-center text-gray-500 dark:text-gray-400">
                        We've notified the administrator. You'll be able to sign
                        in again once your account is reactivated.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        onClick={handleBackToSignIn}
                        className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white border-none"
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Sign In
                      </Button>
                    </CardContent>
                  </>
                ) : (
                  <>
                    <CardHeader className="space-y-1">
                      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
                        <UserX className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                      </div>
                      <CardTitle className="text-2xl font-bold tracking-tight text-center text-gray-900 dark:text-white">
                        Account deactivated
                      </CardTitle>
                      <CardDescription className="text-center text-gray-500 dark:text-gray-400">
                        Your account
                        {email ? ` (${email})` : ""} is currently deactivated.
                        Request reactivation and an administrator will review it.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="space-y-2">
                        <label
                          htmlFor="reactivation-message"
                          className="text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          Message to admin{" "}
                          <span className="font-normal text-gray-400">
                            (optional)
                          </span>
                        </label>
                        <Textarea
                          id="reactivation-message"
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder="Let the admin know why you'd like your account reactivated…"
                          rows={4}
                          maxLength={500}
                          className="resize-none bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-200"
                        />
                      </div>
                      <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white border-none"
                      >
                        {isSubmitting ? "Sending…" : "Request Reactivation"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={handleBackToSignIn}
                        className="w-full text-gray-600 dark:text-gray-400"
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Sign In
                      </Button>
                    </CardContent>
                  </>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountReactivationRequest;
