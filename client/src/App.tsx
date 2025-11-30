import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Workflow from "./pages/Workflow";
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

const queryClient = new QueryClient();

localStorage.setItem("authToken", "1234567890");

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LoadingProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Protected Routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/workflow" element={<Workflow />} />
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
              </Route>

              {/* Public Routes */}
              <Route path="/signup" element={<SignUp />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/" element={<Landing />} />

              {/* Catch-all Route */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </LoadingProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
