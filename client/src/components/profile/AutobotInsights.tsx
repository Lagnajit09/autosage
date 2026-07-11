import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Zap,
  BookOpen,
  ArrowRight,
  Star,
} from "lucide-react";
import type {
  UserSettings,
  DashboardBucket,
  LLMConfig,
  AutobotProvider,
} from "@/lib/api/autobot";

const PROVIDER_COLORS: Record<AutobotProvider | string, string> = {
  openai: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  anthropic: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400",
  gemini: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  groq: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
  openrouter: "bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300",
  azure_openai: "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400",
  custom: "bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300",
};

interface AutobotInsightsProps {
  settings: UserSettings | null;
  llmConfigs: LLMConfig[];
  todayStats: DashboardBucket | null;
  isLoading?: boolean;
}

const TONE_LABELS: Record<string, string> = {
  concise: "Concise",
  balanced: "Balanced",
  detailed: "Detailed",
};

const EXPERTISE_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  expert: "Expert",
};

export const AutobotInsights = ({
  settings,
  llmConfigs,
  todayStats,
  isLoading = false,
}: AutobotInsightsProps) => {
  const navigate = useNavigate();

  const hasModels = llmConfigs.length > 0;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <img
          src="/autobot-dark.svg"
          alt="Autobot Icon"
          className="w-10 h-10 bg-purple-500 p-2 rounded-full"
        />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Autobot Copilot
        </h2>
      </div>
      <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 shadow-sm">
        <CardContent className="p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
              {[1, 2].map((i) => (
                <div key={i} className="space-y-3">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                  <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-6">
              {/* Settings summary */}
              <div className="flex-1 space-y-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  Your Settings
                </h4>
                {!hasModels ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No AI model configured yet.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("/ai/autobot")}
                      className="dark:border-gray-700 dark:text-gray-300"
                    >
                      Set up AI model
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Model tiles — up to 3 */}
                    <div className="grid grid-cols-1 gap-2">
                      {llmConfigs.slice(0, 3).map((cfg) => {
                        const isDefault =
                          cfg.id === settings?.default_llm_config ||
                          cfg.is_default;
                        return (
                          <div
                            key={cfg.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {cfg.model_name}
                              </span>
                              {isDefault && (
                                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />
                              )}
                            </div>
                            <Badge
                              variant="secondary"
                              className={`text-xs shrink-0 border-0 ${PROVIDER_COLORS[cfg.provider] ?? PROVIDER_COLORS.custom}`}
                            >
                              {cfg.provider.replace("_", " ")}
                            </Badge>
                          </div>
                        );
                      })}
                      {llmConfigs.length > 3 && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 pl-1">
                          +{llmConfigs.length - 3} more configured
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-sm text-gray-500 dark:text-gray-400 w-24 shrink-0">
                        Response style
                      </span>
                      <Badge
                        variant="secondary"
                        className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800"
                      >
                        {TONE_LABELS[settings?.tone ?? "balanced"]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500 dark:text-gray-400 w-24 shrink-0">
                        Expertise
                      </span>
                      <Badge
                        variant="secondary"
                        className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800"
                      >
                        {EXPERTISE_LABELS[settings?.expertise ?? "intermediate"]}
                      </Badge>
                    </div>
                    {settings?.language && settings.language !== "en" && (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500 dark:text-gray-400 w-24 shrink-0">
                          Language
                        </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white uppercase">
                          {settings.language}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Today's usage */}
              <div className="flex-1 space-y-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  Today's Usage
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg p-3 flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">
                        {todayStats?.requests ?? 0}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Requests
                      </p>
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg p-3 flex items-start gap-2">
                    <Zap className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">
                        {(todayStats?.total_tokens ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Tokens
                      </p>
                    </div>
                  </div>
                </div>
                {(todayStats?.model_usage?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>
                      Model:{" "}
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {todayStats!.model_usage[0].model}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/ai/autobot")}
              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
            >
              Open Autobot
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};
