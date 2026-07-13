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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Bug, CheckCircle2, Menu } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { reportBug } from "@/lib/api/support";
import Logo from "@/components/Logo";

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low — Minor inconvenience" },
  { value: "medium", label: "Medium — Affects workflow" },
  { value: "high", label: "High — Major feature broken" },
  { value: "critical", label: "Critical — App unusable / data loss" },
];

const ReportBug = () => {
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<
    "low" | "medium" | "high" | "critical"
  >("medium");
  const [pageUrl, setPageUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      toast({
        title: "Missing fields",
        description: "Please provide a title and description.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await reportBug(
        {
          title: title.trim(),
          description: description.trim(),
          severity,
          page_url: pageUrl.trim(),
        },
        token,
      );
      if (res.success) {
        setSubmitted(true);
      } else {
        toast({
          title: "Submission failed",
          description: res.message || "Please try again later.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Submission failed",
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
                <SheetContent
                  side="left"
                  className="w-64 bg-white dark:bg-gray-900 dark:border-gray-800"
                >
                  <SheetHeader>
                    <Logo />
                  </SheetHeader>
                  <NavItems mobile />
                </SheetContent>
              </Sheet>
              <Logo />
            </div>

            <div className="flex items-center gap-3 mb-2">
              <Bug className="w-6 h-6 text-red-500" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Report a Bug
              </h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Found something broken? Let us know and we'll get it fixed.
            </p>
            <Separator className="mb-8 bg-gray-200 dark:bg-gray-800" />

            <div className="flex justify-center">
              <div className="w-full max-w-2xl">
                {submitted ? (
                  <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm">
                    <CardHeader className="space-y-1 items-center text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-2">
                        <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                      </div>
                      <CardTitle className="text-xl font-bold text-gray-900 dark:text-white">
                        Bug report submitted!
                      </CardTitle>
                      <CardDescription className="text-gray-500 dark:text-gray-400">
                        Thank you for taking the time to report this. We'll
                        investigate and follow up if we need more details.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <Button
                        onClick={() => {
                          setSubmitted(false);
                          setTitle("");
                          setDescription("");
                          setSeverity("medium");
                          setPageUrl("");
                        }}
                        variant="outline"
                        className="w-full border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900"
                      >
                        Submit another report
                      </Button>
                      <Button
                        onClick={() => navigate("/dashboard")}
                        className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white border-none"
                      >
                        Back to Dashboard
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-lg text-gray-900 dark:text-white">
                        Bug details
                      </CardTitle>
                      <CardDescription className="text-gray-500 dark:text-gray-400">
                        Be as specific as possible — steps to reproduce help us
                        fix things faster.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-5">
                      <div className="space-y-2">
                        <Label
                          htmlFor="bug-title"
                          className="text-gray-700 dark:text-gray-300"
                        >
                          Title <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="bug-title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="e.g. Workflow execution hangs on step 3"
                          maxLength={200}
                          className="bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="bug-severity"
                          className="text-gray-700 dark:text-gray-300"
                        >
                          Severity
                        </Label>
                        <Select
                          value={severity}
                          onValueChange={(v) =>
                            setSeverity(v as typeof severity)
                          }
                        >
                          <SelectTrigger
                            id="bug-severity"
                            className="bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                            {SEVERITY_OPTIONS.map((opt) => (
                              <SelectItem
                                key={opt.value}
                                value={opt.value}
                                className="text-gray-900 dark:text-gray-100 focus:bg-gray-100 dark:focus:bg-gray-800"
                              >
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="bug-description"
                          className="text-gray-700 dark:text-gray-300"
                        >
                          Description <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                          id="bug-description"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Describe what happened, what you expected, and steps to reproduce…"
                          rows={6}
                          maxLength={2000}
                          className="resize-none bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600"
                        />
                        <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
                          {description.length}/2000
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="bug-url"
                          className="text-gray-700 dark:text-gray-300"
                        >
                          Page URL{" "}
                          <span className="font-normal text-gray-400 dark:text-gray-500">
                            (optional)
                          </span>
                        </Label>
                        <Input
                          id="bug-url"
                          value={pageUrl}
                          onChange={(e) => setPageUrl(e.target.value)}
                          placeholder="e.g. /workflow/abc123"
                          maxLength={500}
                          className="bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600"
                        />
                      </div>

                      <Button
                        onClick={handleSubmit}
                        disabled={
                          isSubmitting || !title.trim() || !description.trim()
                        }
                        className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white border-none"
                      >
                        {isSubmitting ? "Submitting…" : "Submit Bug Report"}
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ReportBug;
