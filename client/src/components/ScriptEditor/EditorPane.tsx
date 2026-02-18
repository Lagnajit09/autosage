import { File } from "lucide-react";
import { Button } from "@/components/ui/button";
import Editor, { OnMount } from "@monaco-editor/react";
import { ScriptFile } from "@/utils/types";

interface EditorPaneProps {
  currentFile: ScriptFile | null;
  isDark: boolean;
  onMount: OnMount;
  onChange: (value: string | undefined) => void;
  onCreateFile: () => void;
}

export function EditorPane({
  currentFile,
  isDark,
  onMount,
  onChange,
  onCreateFile,
}: EditorPaneProps) {
  if (!currentFile) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-900/50">
        <div className="text-center">
          <File
            size={48}
            className="text-gray-300 dark:text-gray-700 mx-auto mb-3"
          />
          <p className="text-gray-500 dark:text-gray-500 text-sm mb-4">
            No file selected
          </p>
          <Button
            onClick={onCreateFile}
            variant="outline"
            className="text-gray-700 dark:text-gray-300 dark:bg-gray-950 dark:border-gray-950 dark:hover:bg-gray-950/50"
          >
            Create New Script
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      language={currentFile.language}
      value={currentFile.content}
      onChange={onChange}
      theme={isDark ? "vs-dark" : "vs-light"}
      onMount={onMount}
      options={{
        minimap: { enabled: true },
        fontSize: 14,
        lineHeight: 1.6,
        fontFamily: "'Monaco', 'Menlo', 'Consolas', 'monospace'",
        lineNumbers: "on",
        roundedSelection: false,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
        wordWrap: "on",
        formatOnPaste: true,
        formatOnType: true,
        padding: { top: 16, bottom: 16 },
      }}
    />
  );
}
