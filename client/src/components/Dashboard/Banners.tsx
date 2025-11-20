import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Crown } from "lucide-react";

// --- Banners ---
export const ProBanner = () => {
  return (
    <Card className="bg-gradient-to-br from-purple-600 to-blue-600 border-none text-white overflow-hidden relative mb-6">
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <Crown size={120} />
      </div>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown size={20} className="text-yellow-300" />
          Upgrade to Pro
        </CardTitle>
        <CardDescription className="text-purple-100">
          Unlock advanced AI models, unlimited executions, and priority support.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="secondary" className="w-full font-semibold text-purple-700 hover:bg-white/90">
          Get Pro Access
        </Button>
      </CardContent>
    </Card>
  );
};

export const AutobotBanner = () => {
  return (
    <Card className="bg-gray-900 dark:bg-black border-gray-800 relative overflow-hidden group">
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]" />
      <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl group-hover:bg-blue-500/30 transition-all duration-500" />
      
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Sparkles size={20} className="text-blue-400" />
          Meet Autobot
        </CardTitle>
        <CardDescription className="text-gray-400">
          Your personal AI agent for complex automation tasks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="p-3 bg-gray-800/50 rounded-lg text-sm text-gray-300 border border-gray-700/50">
            "Hey! I can help you debug that script or optimize your workflow."
          </div>
          <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white">
            Chat with Autobot
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};