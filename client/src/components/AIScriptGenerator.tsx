import React, { useState } from "react";
import { sanitizeInput } from "@/sanitizers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wand2, Loader2, Copy, Plus, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "./ui/scroll-area";

interface AIScriptGeneratorProps {
  scriptType: string;
  onGeneratedScript?: (script: string, filename: string) => void;
}

interface GenerateScriptResponse {
  success: boolean;
  script: string;
  filename: string;
  language: string;
  message: string;
  fallback?: boolean;
}

const AIScriptGenerator: React.FC<AIScriptGeneratorProps> = ({
  scriptType,
  onGeneratedScript,
}) => {
  const [prompt, setPrompt] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState(
    scriptType.toLowerCase(),
  );
  const [selectedScriptType, setSelectedScriptType] = useState("automation");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedScript, setGeneratedScript] = useState("");
  const [generatedFilename, setGeneratedFilename] = useState("");
  const [error, setError] = useState("");
  const [isFallback, setIsFallback] = useState(false);

  const languages = [
    { value: "python", label: "Python" },
    { value: "powershell", label: "PowerShell" },
    { value: "shell", label: "Shell/Bash" },
    { value: "javascript", label: "JavaScript" },
  ];

  const scriptTypes = [
    { value: "automation", label: "Automation" },
    { value: "utility", label: "Utility" },
    { value: "data-processing", label: "Data Processing" },
    { value: "web-scraping", label: "Web Scraping" },
    { value: "file-management", label: "File Management" },
    { value: "system-admin", label: "System Administration" },
    { value: "custom", label: "Custom" },
  ];

  const API_BASE_URL = "http://localhost:3001";

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError("");
    setIsFallback(false);

    try {
      const sanitizedPayload = sanitizeInput({
        prompt: prompt.trim(),
        scriptType: selectedScriptType,
        language: selectedLanguage,
      });

      const response = await fetch(`${API_BASE_URL}/api/generate-script`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sanitizedPayload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: GenerateScriptResponse = await response.json();

      if (data.success) {
        setGeneratedScript(data.script);
        setGeneratedFilename(data.filename);
        setIsFallback(data.fallback || false);
      } else {
        throw new Error(data.message || "Failed to generate script");
      }
    } catch (err) {
      console.error("Error generating script:", err);
      setError(
        err instanceof Error ? err.message : "Failed to generate script",
      );

      // Generate a basic fallback script locally as last resort
      const fallbackResult = generateLocalFallback();
      setGeneratedScript(fallbackResult.script);
      setGeneratedFilename(fallbackResult.filename);
      setIsFallback(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateLocalFallback = () => {
    const timestamp = Date.now();
    const templates = {
      python: `#!/usr/bin/env python3
"""
Script generated for: ${prompt}
Type: ${selectedScriptType}
Generated: ${new Date().toISOString()}
"""

def main():
    """Main function"""
    print("Script for: ${prompt}")
    # TODO: Implement your logic here
    pass

if __name__ == "__main__":
    main()
`,
      powershell: `# Script generated for: ${prompt}
# Type: ${selectedScriptType}
# Generated: ${new Date().toISOString()}

Write-Host "Script for: ${prompt}"
# TODO: Implement your logic here
`,
      shell: `#!/bin/bash
# Script generated for: ${prompt}
# Type: ${selectedScriptType}
# Generated: ${new Date().toISOString()}

echo "Script for: ${prompt}"
# TODO: Implement your logic here
`,
      javascript: `/**
 * Script generated for: ${prompt}
 * Type: ${selectedScriptType}
 * Generated: ${new Date().toISOString()}
 */

console.log("Script for: ${prompt}");
// TODO: Implement your logic here
`,
    };

    const extensions = {
      python: "py",
      powershell: "ps1",
      shell: "sh",
      javascript: "js",
    };

    return {
      script:
        templates[selectedLanguage as keyof typeof templates] ||
        templates.python,
      filename: `fallback_${timestamp}.${
        extensions[selectedLanguage as keyof typeof extensions] || "txt"
      }`,
    };
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(generatedScript);
    } catch (err) {
      console.error("Failed to copy script:", err);
    }
  };

  const handleAddToEditor = () => {
    if (onGeneratedScript && generatedScript) {
      onGeneratedScript(generatedScript, generatedFilename);
    }
  };

  return (
    <ScrollArea className="h-full flex flex-col space-y-4 px-4">
      <div className="flex items-center space-x-2 mb-4">
        <Wand2 size={20} className="text-purple-500 dark:text-purple-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          AI Script Generator
        </h3>
      </div>

      {error && (
        <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50">
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <AlertDescription className="text-red-700 dark:text-red-300">
            {error}
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-gray-700 dark:text-gray-300">
            Configure your script
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label
                htmlFor="language"
                className="text-xs text-gray-600 dark:text-gray-400 mb-2 block"
              >
                Language
              </Label>
              <Select
                value={selectedLanguage}
                onValueChange={setSelectedLanguage}
                disabled={isGenerating}
              >
                <SelectTrigger className="bg-white dark:bg-gray-700/50 border-gray-200 dark:border-gray-600/50 text-gray-900 dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  {languages.map((lang) => (
                    <SelectItem
                      key={lang.value}
                      value={lang.value}
                      className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label
                htmlFor="scriptType"
                className="text-xs text-gray-600 dark:text-gray-400 mb-2 block"
              >
                Script Type
              </Label>
              <Select
                value={selectedScriptType}
                onValueChange={setSelectedScriptType}
                disabled={isGenerating}
              >
                <SelectTrigger className="bg-white dark:bg-gray-700/50 border-gray-200 dark:border-gray-600/50 text-gray-900 dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  {scriptTypes.map((type) => (
                    <SelectItem
                      key={type.value}
                      value={type.value}
                      className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label
              htmlFor="prompt"
              className="text-xs text-gray-600 dark:text-gray-400 mb-2 block"
            >
              Describe what you want your script to do
            </Label>
            <Textarea
              id="prompt"
              placeholder={`e.g., "Create a script that backs up files from one directory to another and logs the operation"`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="bg-white dark:bg-gray-700/50 border-gray-200 dark:border-gray-600/50 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-500 min-h-[120px] resize-none"
              disabled={isGenerating}
              maxLength={1000}
            />
            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              {prompt.length}/1000 characters
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="w-full bg-[#a768d0] hover:bg-[#9556bf] text-white shadow-md shadow-purple-500/20 transition-all hover:shadow-purple-500/40"
          >
            {isGenerating ? (
              <>
                <Loader2 size={14} className="mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 size={14} className="mr-2" />
                Generate Script
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {generatedScript && (
        <Card className="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 flex-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-gray-700 dark:text-gray-300">
                Generated Script
                {isFallback && (
                  <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400">
                    (Fallback)
                  </span>
                )}
              </CardTitle>
              <div className="flex space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyScript}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white h-8 w-8 p-0"
                  title="Copy to clipboard"
                >
                  <Copy size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddToEditor}
                  className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 h-8 w-8 p-0"
                  title="Add to editor"
                >
                  <Plus size={14} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-white dark:bg-gray-900/50 rounded-md p-3 max-h-[300px] overflow-y-auto border border-gray-200 dark:border-gray-700/50">
              <pre className="text-xs text-gray-800 dark:text-gray-300 whitespace-pre-wrap font-mono">
                {generatedScript}
              </pre>
            </div>
            <div className="mt-3 flex justify-between items-center">
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Filename:{" "}
                <span className="text-gray-700 dark:text-gray-400">
                  {generatedFilename}
                </span>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Language:{" "}
                <span className="text-gray-700 dark:text-gray-400 capitalize">
                  {selectedLanguage}
                </span>
              </p>
            </div>
            {isFallback && (
              <Alert className="mt-3 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/50">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <AlertDescription className="text-yellow-700 dark:text-yellow-300 text-xs">
                  This is a basic template. AI generation was unavailable.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-gray-500 dark:text-gray-500 mt-4">
        <p>
          💡 Tip: Be specific about inputs, outputs, and edge cases for better
          AI-generated scripts.
        </p>
      </div>
    </ScrollArea>
  );
};

export default AIScriptGenerator;
