import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Wand2, Loader2, Copy, Plus } from "lucide-react";

interface AIScriptGeneratorProps {
  scriptType: string;
  onGeneratedScript?: (script: string, filename: string) => void;
}

const AIScriptGenerator: React.FC<AIScriptGeneratorProps> = ({
  scriptType,
  onGeneratedScript,
}) => {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedScript, setGeneratedScript] = useState("");
  const [generatedFilename, setGeneratedFilename] = useState("");

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);

    // TODO: Replace with actual API call
    setTimeout(() => {
      const mockScript = generateMockScript(scriptType, prompt);
      const mockFilename = generateMockFilename(scriptType);

      setGeneratedScript(mockScript);
      setGeneratedFilename(mockFilename);
      setIsGenerating(false);
    }, 2000);
  };

  const generateMockScript = (type: string, userPrompt: string) => {
    switch (type.toLowerCase()) {
      case "python":
        return `#!/usr/bin/env python3
# Generated script based on: ${userPrompt}

def main():
    """
    ${userPrompt}
    """
    print("Script generated for: ${userPrompt}")
    # TODO: Implement functionality

if __name__ == "__main__":
    main()
`;
      case "powershell":
        return `# Generated PowerShell script based on: ${userPrompt}

Write-Host "Script generated for: ${userPrompt}"
# TODO: Implement functionality
`;
      case "shell":
        return `#!/bin/bash
# Generated shell script based on: ${userPrompt}

echo "Script generated for: ${userPrompt}"
# TODO: Implement functionality
`;
      default:
        return `// Generated JavaScript based on: ${userPrompt}

console.log("Script generated for: ${userPrompt}");
// TODO: Implement functionality
`;
    }
  };

  const generateMockFilename = (type: string) => {
    const timestamp = Date.now();
    switch (type.toLowerCase()) {
      case "python":
        return `ai_generated_${timestamp}.py`;
      case "powershell":
        return `ai_generated_${timestamp}.ps1`;
      case "shell":
        return `ai_generated_${timestamp}.sh`;
      default:
        return `ai_generated_${timestamp}.js`;
    }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(generatedScript);
  };

  const handleAddToEditor = () => {
    if (onGeneratedScript && generatedScript) {
      onGeneratedScript(generatedScript, generatedFilename);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 p-4">
      <div className="flex items-center space-x-2 mb-4">
        <Wand2 size={20} className="text-purple-400" />
        <h3 className="text-lg font-semibold text-white">Genie Script</h3>
      </div>

      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-slate-300">
            Describe your script
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label
              htmlFor="prompt"
              className="text-xs text-slate-400 mb-2 block"
            >
              What do you want your {scriptType} script to do?
            </Label>
            <Textarea
              id="prompt"
              placeholder={`e.g., "Create a script that backs up files from one directory to another"`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="bg-slate-700/50 border-slate-600/50 text-white placeholder:text-slate-500 min-h-[100px] resize-none"
              disabled={isGenerating}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
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
        <Card className="bg-slate-800/60 border-slate-700/50 flex-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-slate-300">
                Generated Script
              </CardTitle>
              <div className="flex space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyScript}
                  className="text-slate-400 hover:text-white h-8 w-8 p-0"
                >
                  <Copy size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddToEditor}
                  className="text-green-400 hover:text-green-300 h-8 w-8 p-0"
                >
                  <Plus size={14} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-900/50 rounded-md p-3 max-h-[300px] overflow-y-auto">
              <pre className="text-xs text-slate-300 whitespace-pre-wrap">
                {generatedScript}
              </pre>
            </div>
            <div className="mt-3">
              <p className="text-xs text-slate-500">
                Filename:{" "}
                <span className="text-slate-400">{generatedFilename}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-slate-500 mt-auto">
        <p>
          💡 Tip: Be specific about what you want the script to accomplish for
          better results.
        </p>
      </div>
    </div>
  );
};

export default AIScriptGenerator;
