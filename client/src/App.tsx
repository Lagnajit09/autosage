import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Workflow from "./pages/Workflow";
import WorkflowExecution from "./pages/WorkflowExecution";
import NotFound from "./pages/NotFound";
import SignUp from "./pages/SignUp";
import SignIn from "./pages/SignIn";
import CodeEditor from "./pages/CodeEditor";
import ScriptViewer from "./pages/ScriptViewer";
import Landing from "./pages/Landing";
import { LoadingProvider } from "./contexts/LoadingContext";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import "./App.css";
import { ThemeProvider } from "./provider/theme-provider";
import AutobotChat from "./pages/AutobotChat";
import Workflows from "./pages/Workflows";
import Templates from "./pages/Templates";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Plans from "./pages/Plans";
import Billing from "./pages/Billing";
import { SSOCallback } from "./components/auth/SSOCallback";
import { ClerkProvider } from "@clerk/clerk-react";
import PublicRoute from "./components/auth/PublicRoute";

const queryClient = new QueryClient();

const ServerErrorListener = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleServerError = () => {
      navigate("/server-error");
    };

    window.addEventListener("server-error", handleServerError);
    return () => {
      window.removeEventListener("server-error", handleServerError);
    };
  }, [navigate]);

  return null;
};

const App = () => {
  const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  if (!PUBLISHABLE_KEY) {
    throw new Error("Missing Publishable Key");
  }

  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LoadingProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <ServerErrorListener />
                <Routes>
                  {/* Protected Routes */}
                  <Route element={<ProtectedRoute />}>
                    <Route path="/workflow/new" element={<Workflow />} />
                    <Route path="/workflow/:id" element={<Workflow />} />
                    <Route
                      path="/workflow/execution/:id"
                      element={<WorkflowExecution />}
                    />
                    <Route path="/workflows" element={<Workflows />} />
                    <Route path="/templates" element={<Templates />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/code-editor" element={<CodeEditor />} />
                    <Route path="/raw/:id" element={<ScriptViewer />} />
                    <Route path="/ai/autobot" element={<AutobotChat />} />
                    <Route path="/ai/autobot/:id" element={<AutobotChat />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/plans" element={<Plans />} />
                    <Route path="/billing" element={<Billing />} />
                  </Route>

                  {/* Public Routes - redirect to dashboard if authenticated */}
                  <Route element={<PublicRoute />}>
                    <Route path="/signup" element={<SignUp />} />
                    <Route path="/signin" element={<SignIn />} />
                    <Route path="/" element={<Landing />} />
                  </Route>

                  {/* SSO Callback - no redirect needed */}
                  <Route path="/sso-callback" element={<SSOCallback />} />

                  {/* Server Error Route */}
                  <Route
                    path="/server-error"
                    element={
                      <NotFound
                        header="Server Issue"
                        userMessage="Our servers are currently experiencing difficulties or are down for maintenance. Please try again in a few moments."
                        errorCode="500"
                      />
                    }
                  />

                  {/* Catch-all Route */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </LoadingProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
};

export default App;
