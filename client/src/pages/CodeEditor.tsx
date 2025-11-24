import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Save, File, X, Menu, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScriptFile, ScriptLanguage } from "@/utils/types";
import Editor, { OnMount } from "@monaco-editor/react";
import GenieButton from "@/components/GenieButton";
import LeftNav from "@/components/LeftNav";
import { useTheme } from "@/provider/theme-provider";
import { cn } from "@/lib/utils";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { FileExplorerSidebar } from "@/components/CodeEditor/FileExplorerSidebar";
import { AIScriptGeneratorSidebar } from "@/components/CodeEditor/AIScriptGeneratorSidebar";
import { useToast } from "@/hooks/use-toast";

const CodeEditor = () => {
  const [searchParams] = useSearchParams();
  const scriptType = searchParams.get("type") || "python";
  const { isDark } = useTheme();
  const { toast } = useToast();

  const [currentFile, setCurrentFile] = useState<ScriptFile | null>(null);
  const [files, setFiles] = useState<ScriptFile[]>([]);
  const [openTabs, setOpenTabs] = useState<ScriptFile[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isAISidebarOpen, setIsAISidebarOpen] = useState(false);

  // Inline File Operation State
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);

  const getLanguageInfo = (
    type: string
  ): { language: ScriptLanguage; extension: string; template: string } => {
    switch (type.toLowerCase()) {
      case "python":
        return {
          language: "python",
          extension: "py",
          template:
            '#!/usr/bin/env python3\n\n# Python Script\n\ndef main():\n    print("Hello, World!")\n\nif __name__ == "__main__":\n    main()\n',
        };
      case "powershell":
        return {
          language: "powershell",
          extension: "ps1",
          template: '# PowerShell Script\n\nWrite-Host "Hello, World!"\n',
        };
      case "shell":
        return {
          language: "shell",
          extension: "sh",
          template: '#!/bin/bash\n\n# Shell Script\n\necho "Hello, World!"\n',
        };
      default:
        return {
          language: "javascript",
          extension: "js",
          template: '// JavaScript\n\nconsole.log("Hello, World!");\n',
        };
    }
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const iconClass = "w-4 h-4";
    switch (ext) {
      case "py":
        return <File className={cn(iconClass, "text-blue-500")} />;
      case "js":
        return <File className={cn(iconClass, "text-yellow-500")} />;
      case "sh":
        return <File className={cn(iconClass, "text-green-500")} />;
      case "ps1":
        return <File className={cn(iconClass, "text-cyan-500")} />;
      default:
        return <File className={cn(iconClass, "text-gray-500")} />;
    }
  };

  useEffect(() => {
    // Load saved files from localStorage
    const savedFiles = localStorage.getItem("scriptFiles");
    let loadedFiles: ScriptFile[] = [];
    if (savedFiles) {
      loadedFiles = JSON.parse(savedFiles).map(
        (
          file: Omit<ScriptFile, "lastModified"> & { lastModified: string }
        ) => ({
          ...file,
          lastModified: new Date(file.lastModified),
        })
      );
      setFiles(loadedFiles);
    }

    // Load open tabs and current file
    const savedOpenTabs = localStorage.getItem("openTabs");
    const savedCurrentFileId = localStorage.getItem("currentFileId");

    if (savedOpenTabs) {
      const tabIds = JSON.parse(savedOpenTabs);
      const tabs = loadedFiles.filter((f) => tabIds.includes(f.id));
      setOpenTabs(tabs);

      if (savedCurrentFileId) {
        const activeFile = tabs.find((f) => f.id === savedCurrentFileId);
        if (activeFile) {
          setCurrentFile(activeFile);
        }
      }
    }
  }, []);

  const handleGeneratedScript = (script: string, filename: string) => {
    const newFile: ScriptFile = {
      id: `${Date.now()}-${Math.random()}`,
      name: filename,
      content: script,
      language: getLanguageFromExtension(filename),
      lastModified: new Date(),
      source: "editor",
    };

    const updatedFiles = [...files, newFile];
    setFiles(updatedFiles);
    setCurrentFile(newFile);

    // Add to open tabs if not already open
    let updatedTabs = openTabs;
    if (!openTabs.find((tab) => tab.id === newFile.id)) {
      updatedTabs = [...openTabs, newFile];
      setOpenTabs(updatedTabs);
    }

    localStorage.setItem("scriptFiles", JSON.stringify(updatedFiles));
    localStorage.setItem(
      "openTabs",
      JSON.stringify(updatedTabs.map((t) => t.id))
    );
    localStorage.setItem("currentFileId", newFile.id);

    setHasUnsavedChanges(false);
    setIsAISidebarOpen(false);
  };

  const configureMonacoEditor: OnMount = (editor, monaco) => {
    // Enable IntelliSense and autocomplete
    monaco.languages.registerCompletionItemProvider(
      currentFile?.language || "javascript",
      {
        provideCompletionItems: () => {
          const suggestions = [];

          if (currentFile?.language === "python") {
            suggestions.push(
              {
                label: "print",
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: "print(${1})",
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "Print function",
              },
              {
                label: "def",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: "def ${1:function_name}(${2}):\n    ${3:pass}",
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "Define a function",
              },
              {
                label: "if",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: "if ${1:condition}:\n    ${2:pass}",
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "If statement",
              },
              {
                label: "for",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: "for ${1:item} in ${2:iterable}:\n    ${3:pass}",
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "For loop",
              }
            );
          } else if (currentFile?.language === "javascript") {
            suggestions.push(
              {
                label: "console.log",
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: "console.log(${1});",
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "Console log function",
              },
              {
                label: "function",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: "function ${1:functionName}(${2}) {\n    ${3}\n}",
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "Function declaration",
              },
              {
                label: "const",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: "const ${1:variable} = ${2};",
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "Const declaration",
              }
            );
          } else if (currentFile?.language === "powershell") {
            suggestions.push(
              {
                label: "Write-Host",
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: 'Write-Host "${1}"',
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "Write output to console",
              },
              {
                label: "function",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: "function ${1:FunctionName} {\n    ${2}\n}",
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "Function declaration",
              }
            );
          }

          return { suggestions };
        },
      }
    );

    // Configure editor settings
    editor.updateOptions({
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: "on",
      tabCompletion: "on",
      wordBasedSuggestions: "matchingDocuments",
      parameterHints: { enabled: true },
      autoClosingBrackets: "always",
      autoClosingQuotes: "always",
      autoIndent: "advanced",
      formatOnPaste: true,
      formatOnType: true,
    });
  };

  const saveFile = () => {
    if (!currentFile) return;

    const updatedFile = {
      ...currentFile,
      lastModified: new Date(),
    };

    const updatedFiles = files.some((f) => f.id === currentFile.id)
      ? files.map((f) => (f.id === currentFile.id ? updatedFile : f))
      : [...files, updatedFile];

    const updatedTabs = openTabs.map((tab) =>
      tab.id === currentFile.id ? updatedFile : tab
    );

    setFiles(updatedFiles);
    setCurrentFile(updatedFile);
    setOpenTabs(updatedTabs);
    localStorage.setItem("scriptFiles", JSON.stringify(updatedFiles));
    setHasUnsavedChanges(false);
  };

  const deleteScript = (fileId: string) => {
    const updatedFiles = files.filter((f) => f.id !== fileId);
    setFiles(updatedFiles);
    localStorage.setItem("scriptFiles", JSON.stringify(updatedFiles));

    // Remove from tabs if open
    const updatedTabs = openTabs.filter((tab) => tab.id !== fileId);
    setOpenTabs(updatedTabs);
    localStorage.setItem(
      "openTabs",
      JSON.stringify(updatedTabs.map((t) => t.id))
    );

    if (currentFile?.id === fileId) {
      const newActiveTab = updatedTabs.length > 0 ? updatedTabs[0] : null;
      setCurrentFile(newActiveTab);
      localStorage.setItem(
        "currentFileId",
        newActiveTab ? newActiveTab.id : ""
      );
      setHasUnsavedChanges(false);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (currentFile && value !== undefined) {
      setCurrentFile({ ...currentFile, content: value });
      setHasUnsavedChanges(true);
    }
  };

  const startCreateFile = () => {
    setIsCreatingFile(true);
  };

  const handleCreateSubmit = (name: string) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      toast({
        variant: "destructive",
        title: "Invalid Filename",
        description: "Filename cannot be empty.",
      });
      return;
    }

    const ext = trimmedName.split(".").pop()?.toLowerCase();
    const validExtensions = ["py", "js", "sh", "ps1"];

    if (!ext || !validExtensions.includes(ext)) {
      toast({
        variant: "destructive",
        title: "Invalid Extension",
        description: "Supported extensions: .py, .js, .sh, .ps1",
      });
      return;
    }

    if (files.some((f) => f.name.toLowerCase() === trimmedName.toLowerCase())) {
      toast({
        variant: "destructive",
        title: "Duplicate Filename",
        description: "A file with this name already exists.",
      });
      return;
    }

    // Validation passed, create file
    const langInfo = getLanguageInfo(getLanguageFromExtension(trimmedName));
    const newFile: ScriptFile = {
      id: `${Date.now()}-${Math.random()}`,
      name: trimmedName,
      content: langInfo.template,
      language: langInfo.language,
      lastModified: new Date(),
      source: "editor",
    };

    const updatedFiles = [...files, newFile];
    setFiles(updatedFiles);
    setCurrentFile(newFile);

    // Add to tabs
    let updatedTabs = openTabs;
    if (!openTabs.find((tab) => tab.id === newFile.id)) {
      updatedTabs = [...openTabs, newFile];
      setOpenTabs(updatedTabs);
    }

    localStorage.setItem("scriptFiles", JSON.stringify(updatedFiles));
    localStorage.setItem(
      "openTabs",
      JSON.stringify(updatedTabs.map((t) => t.id))
    );
    localStorage.setItem("currentFileId", newFile.id);

    setHasUnsavedChanges(true);
    setIsCreatingFile(false);
  };

  const handleRenameSubmit = (id: string, name: string) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      toast({
        variant: "destructive",
        title: "Invalid Filename",
        description: "Filename cannot be empty.",
      });
      return;
    }

    const ext = trimmedName.split(".").pop()?.toLowerCase();
    const validExtensions = ["py", "js", "sh", "ps1"];

    if (!ext || !validExtensions.includes(ext)) {
      toast({
        variant: "destructive",
        title: "Invalid Extension",
        description: "Supported extensions: .py, .js, .sh, .ps1",
      });
      return;
    }

    if (
      files.some(
        (f) => f.id !== id && f.name.toLowerCase() === trimmedName.toLowerCase()
      )
    ) {
      toast({
        variant: "destructive",
        title: "Duplicate Filename",
        description: "A file with this name already exists.",
      });
      return;
    }

    const updatedFiles = files.map((f) =>
      f.id === id ? { ...f, name: trimmedName } : f
    );
    setFiles(updatedFiles);
    localStorage.setItem("scriptFiles", JSON.stringify(updatedFiles));

    const updatedTabs = openTabs.map((tab) =>
      tab.id === id ? { ...tab, name: trimmedName } : tab
    );
    setOpenTabs(updatedTabs);

    if (currentFile?.id === id) {
      setCurrentFile({ ...currentFile, name: trimmedName });
    }

    setRenamingFileId(null);
  };

  const getLanguageFromExtension = (filename: string): ScriptLanguage => {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    switch (ext) {
      case "py":
        return "python";
      case "ps1":
        return "powershell";
      case "sh":
        return "shell";
      case "js":
        return "javascript";
      default:
        return "javascript";
    }
  };

  const selectFile = (file: ScriptFile) => {
    const language = getLanguageFromExtension(file.name);
    const fileWithLanguage = { ...file, language };
    setCurrentFile(fileWithLanguage);

    // Add to tabs if not already open
    let updatedTabs = openTabs;
    if (!openTabs.find((tab) => tab.id === file.id)) {
      updatedTabs = [...openTabs, fileWithLanguage];
      setOpenTabs(updatedTabs);
    }

    localStorage.setItem(
      "openTabs",
      JSON.stringify(updatedTabs.map((t) => t.id))
    );
    localStorage.setItem("currentFileId", file.id);

    setHasUnsavedChanges(false);
  };

  const closeTab = (fileId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();

    const updatedTabs = openTabs.filter((tab) => tab.id !== fileId);
    setOpenTabs(updatedTabs);
    localStorage.setItem(
      "openTabs",
      JSON.stringify(updatedTabs.map((t) => t.id))
    );

    if (currentFile?.id === fileId) {
      const currentIndex = openTabs.findIndex((tab) => tab.id === fileId);
      const newActiveTab =
        updatedTabs.length > 0
          ? updatedTabs[Math.max(0, currentIndex - 1)]
          : null;
      setCurrentFile(newActiveTab);
      localStorage.setItem(
        "currentFileId",
        newActiveTab ? newActiveTab.id : ""
      );
      setHasUnsavedChanges(false);
    }
  };

  const duplicateFile = (file: ScriptFile) => {
    const newFile: ScriptFile = {
      ...file,
      id: `${Date.now()}-${Math.random()}`,
      name: `${file.name.replace(/\.[^/.]+$/, "")}_copy.${file.name
        .split(".")
        .pop()}`,
      lastModified: new Date(),
    };
    const updatedFiles = [...files, newFile];
    setFiles(updatedFiles);
    localStorage.setItem("scriptFiles", JSON.stringify(updatedFiles));
  };

  const downloadFile = (file: ScriptFile) => {
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SidebarProvider>
      <div className="flex w-full h-screen bg-gray-200 dark:bg-workflow-void/90 overflow-hidden">
        <LeftNav />

        <FileExplorerSidebar
          files={files}
          currentFile={currentFile}
          onSelectFile={selectFile}
          onCreateFile={startCreateFile}
          onDeleteFile={deleteScript}
          onRenameFile={(file) => setRenamingFileId(file.id)}
          onDuplicateFile={duplicateFile}
          onDownloadFile={downloadFile}
          getFileIcon={getFileIcon}
          isCreatingFile={isCreatingFile}
          renamingFileId={renamingFileId}
          onCreateSubmit={handleCreateSubmit}
          onRenameSubmit={handleRenameSubmit}
          onCancelCreate={() => setIsCreatingFile(false)}
          onCancelRename={() => setRenamingFileId(null)}
        />

        <SidebarInset className="flex flex-row overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-black/90">
            {/* Page Header */}
            <div className="bg-gray-50 dark:bg-black/10 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <SidebarTrigger className="md:hidden" />
                  <div>
                    <h1 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
                      Code Editor
                    </h1>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={saveFile}
                    disabled={!hasUnsavedChanges}
                    className={cn(
                      "flex items-center space-x-1",
                      hasUnsavedChanges
                        ? "text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-gray-700/10 dark:hover:bg-gray-500/20"
                        : "text-gray-700 dark:text-gray-300"
                    )}
                  >
                    <Save size={16} />
                    <span className="hidden sm:inline">Save</span>
                  </Button>
                  <GenieButton
                    onClick={() => setIsAISidebarOpen(!isAISidebarOpen)}
                  />
                </div>
              </div>
            </div>

            {/* Tabs */}
            {openTabs.length > 0 && (
              <div className="flex items-center bg-gray-50 dark:bg-black/10 border-b border-gray-200 dark:border-gray-800 overflow-x-auto no-scrollbar">
                {openTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => selectFile(tab)}
                    className={cn(
                      "flex items-center space-x-2 px-4 py-2.5 border-r border-gray-200 dark:border-gray-800 transition-colors min-w-[120px] max-w-[200px] group relative",
                      currentFile?.id === tab.id
                        ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white border-t-2 border-t-purple-500"
                        : "bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    )}
                  >
                    {getFileIcon(tab.name)}
                    <span className="text-xs font-medium truncate flex-1 text-left">
                      {tab.name}
                    </span>
                    <div
                      onClick={(e) => closeTab(tab.id, e)}
                      className="opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded p-0.5 transition-opacity"
                    >
                      <X size={14} />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Monaco Editor */}
            <div className="flex-1 relative">
              {currentFile ? (
                <Editor
                  height="100%"
                  language={currentFile.language}
                  value={currentFile.content}
                  onChange={handleEditorChange}
                  theme={isDark ? "vs-dark" : "vs-light"}
                  onMount={configureMonacoEditor}
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
              ) : (
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
                      onClick={startCreateFile}
                      variant="outline"
                      className="text-gray-700 dark:text-gray-300 dark:bg-gray-950 dark:border-gray-950 dark:hover:bg-gray-950/50"
                    >
                      Create New Script
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <AIScriptGeneratorSidebar
            scriptType={scriptType}
            onGeneratedScript={handleGeneratedScript}
            isOpen={isAISidebarOpen}
            onToggle={() => setIsAISidebarOpen(!isAISidebarOpen)}
          />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default CodeEditor;
