import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import LeftNav, { NavItems } from "@/components/LeftNav";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Bug, ChevronDown, ChevronUp, HelpCircle, Mail, Menu, SendHorizontal } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { contactSupport } from "@/lib/api/support";
import Logo from "@/components/Logo";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How do I create a workflow?",
    answer:
      "Navigate to All Workflows from the sidebar and click \"New Workflow\". You'll enter the visual canvas where you can drag and connect nodes to build your automation. Each node represents an action — configure it via the side panel and connect them to define the execution order.",
  },
  {
    question: "What is AutoBot?",
    answer:
      "AutoBot is Autosage's built-in AI assistant. It can help you build workflows, write scripts, answer questions about your data, and much more. Access it from the AutoBot icon in the sidebar. You can start a new conversation or continue an existing one from the AutoBot dashboard.",
  },
  {
    question: "How does execution mode work?",
    answer:
      "Execution mode lets your workflows and scripts run code directly. It requires a BYO (Bring Your Own) API key configured in your settings. Shared or admin-managed keys do not support execution mode for security reasons.",
  },
  {
    question: "How do I set up a trigger for my workflow?",
    answer:
      "Open a workflow and click the Triggers section. You can configure HTTP triggers (webhook URLs that fire your workflow on incoming requests) or schedule triggers (cron expressions that run the workflow on a time-based schedule). Both types are available from within the workflow editor.",
  },
  {
    question: "What are the plan limits?",
    answer:
      "The Free plan includes a limited number of workflow executions and script runs per month. The Pro plan significantly increases these limits. You can view your current usage and limits at any time on the Billing page. If you need higher limits, consider upgrading or contact us for an Enterprise plan.",
  },
  {
    question: "How do I manage secrets and credentials?",
    answer:
      "Go to the Vault section (accessible from the sidebar). You can securely store API keys, passwords, and other credentials there. Stored secrets can then be referenced inside your workflows and scripts without exposing the raw values.",
  },
  {
    question: "Can I export or share my workflows?",
    answer:
      "Yes — workflows can be exported as JSON from the workflow editor menu. You can also save a workflow as a template (from the workflow menu) to make it reusable across your account or share it with the community via the Templates gallery.",
  },
  {
    question: "How do I cancel or change my subscription?",
    answer:
      "Go to the Billing page from the sidebar. You'll see your current plan, usage, and options to upgrade or cancel. Cancellations take effect at the end of your current billing period so you keep full access until then.",
  },
];

const FaqEntry = ({ item }: { item: FaqItem }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <span>{item.question}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-3">
          {item.answer}
        </div>
      )}
    </div>
  );
};

const FaqContact = () => {
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({
        title: "Missing fields",
        description: "Please provide both a subject and a message.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await contactSupport({ subject: subject.trim(), message: message.trim() }, token);
      if (res.success) {
        toast({
          title: "Message sent!",
          description: "We'll get back to you as soon as possible.",
        });
        setSubject("");
        setMessage("");
      } else {
        toast({
          title: "Failed to send",
          description: res.message || "Please try again or email autosagex@gmail.com directly.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Failed to send",
        description: (err as Error).message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex w-full h-screen bg-gray-100 dark:bg-gray-950 overflow-hidden">
        <LeftNav />
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6 md:p-10">
            {/* Mobile nav */}
            <div className="flex items-center gap-3 mb-6 lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 bg-white dark:bg-gray-900 dark:border-gray-800">
                  <SheetHeader>
                    <Logo />
                  </SheetHeader>
                  <NavItems mobile />
                </SheetContent>
              </Sheet>
              <Logo />
            </div>

            {/* Page header */}
            <div className="flex items-center gap-3 mb-2">
              <HelpCircle className="w-6 h-6 text-purple-500" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Help & Support</h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Browse frequently asked questions or send us a message.
            </p>
            <Separator className="mb-8 bg-gray-200 dark:bg-gray-800" />

            <div className="flex justify-center">
              <div className="w-full max-w-3xl space-y-10">
                {/* FAQ section */}
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Frequently Asked Questions
                  </h2>
                  <div className="space-y-2">
                    {FAQ_ITEMS.map((item) => (
                      <FaqEntry key={item.question} item={item} />
                    ))}
                  </div>
                </section>

                <Separator className="bg-gray-200 dark:bg-gray-800" />

                {/* Report a bug CTA */}
                <section>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                        <Bug className="h-5 w-5 text-red-600 dark:text-red-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Found a bug?</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Help us improve by filing a detailed bug report.
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => navigate("/report-bug")}
                      variant="outline"
                      className="shrink-0 border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 bg-white dark:bg-transparent hover:bg-red-100 dark:hover:bg-red-900/30"
                    >
                      <Bug className="w-4 h-4 mr-2" />
                      Report a Bug
                    </Button>
                  </div>
                </section>

                <Separator className="bg-gray-200 dark:bg-gray-800" />

                {/* Contact form */}
                <section>
                  <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                          <Mail className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <CardTitle className="text-lg text-gray-900 dark:text-white">
                            Contact Us
                          </CardTitle>
                          <CardDescription className="text-gray-500 dark:text-gray-400">
                            Can't find the answer? Send us a message and we'll get back to you.
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="contact-subject" className="text-gray-700 dark:text-gray-300">
                          Subject <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="contact-subject"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          placeholder="e.g. Question about Pro plan limits"
                          maxLength={200}
                          className="bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="contact-message" className="text-gray-700 dark:text-gray-300">
                          Message <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                          id="contact-message"
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder="Describe your question or issue in detail…"
                          rows={5}
                          maxLength={2000}
                          className="resize-none bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600"
                        />
                        <p className="text-xs text-gray-400 dark:text-gray-500 text-right">{message.length}/2000</p>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Or email us directly at{" "}
                          <a
                            href="mailto:autosagex@gmail.com"
                            className="underline text-purple-500 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300"
                          >
                            autosagex@gmail.com
                          </a>
                        </p>
                        <Button
                          onClick={handleSend}
                          disabled={isSubmitting || !subject.trim() || !message.trim()}
                          className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white border-none shrink-0"
                        >
                          <SendHorizontal className="w-4 h-4 mr-2" />
                          {isSubmitting ? "Sending…" : "Send Message"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </section>
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default FaqContact;
