import { useState, useEffect } from "react";
import {
  Save,
  File,
  X,
  Braces,
  Code,
  Terminal,
  SquareTerminal,
} from "lucide-react";
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
import { toast } from "sonner";
import { useAuth } from "@clerk/clerk-react";
import { scriptService, mapScriptToScriptFile } from "@/lib/api/scripts";
import { DeleteConfirmationModal } from "@/components/DeleteConfirmationModal";
import { useParams, useNavigate } from "react-router-dom";

const CodeEditor = () => {
  const { name } = useParams();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { toast: clientToast } = useToast();
  const { getToken, isSignedIn } = useAuth();
  const [token, setToken] = useState<string | null>(null);

  const [currentFile, setCurrentFile] = useState<ScriptFile | null>(null);
  const [files, setFiles] = useState<ScriptFile[]>([]);
  const [openTabs, setOpenTabs] = useState<ScriptFile[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isAISidebarOpen, setIsAISidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Inline File Operation State
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);

  // Delete Confirmation State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [scriptToDeleteId, setScriptToDeleteId] = useState<string | null>(null);

  // Get token on auth change
  useEffect(() => {
    if (isSignedIn) {
      const fetchToken = async () => {
        try {
          const t = await getToken();
          setToken(t);
        } catch (e) {
          console.error("Failed to get token", e);
        }
      };
      fetchToken();
    }
  }, [isSignedIn, getToken]);

  const fetchFiles = async () => {
    setIsLoading(true);
    toast.loading("Fetching scripts...");
    try {
      const clerkToken = await getToken();
      const scripts = await scriptService.getAll(clerkToken);
      const scriptFiles = scripts.map((s) => mapScriptToScriptFile(s));
      setFiles(scriptFiles);

      // Restore open tabs by ID only (content will be fetched on select)
      const savedOpenTabIds = localStorage.getItem("openTabs");
      if (savedOpenTabIds) {
        try {
          const tabIds = JSON.parse(savedOpenTabIds);
          const tabs = scriptFiles.filter((f) => tabIds.includes(f.id));
          setOpenTabs(tabs);
        } catch (e) {
          console.error("Error parsing open tabs", e);
        }
      }
    } catch (error) {
      console.error("Failed to fetch scripts:", error);
      clientToast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load scripts.",
      });
    } finally {
      setIsLoading(false);
      toast.dismiss();
    }
  };

  // Load files when token is available
  useEffect(() => {
    if (token) {
      fetchFiles();
    }
  }, [token]);

  // Open File Fetched By Name
  useEffect(() => {
    if (name) {
      const script = files.find((f) => f.name === name);
      if (script) {
        selectFile(script);
      }
    }
  }, [name, files]);

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

  const getLanguageInfo = (
    type: string,
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
        return <Braces className={cn(iconClass, "text-blue-500")} />;
      case "js":
        return <Code className={cn(iconClass, "text-yellow-500")} />;
      case "sh":
        return <Terminal className={cn(iconClass, "text-green-500")} />;
      case "ps1":
        return <SquareTerminal className={cn(iconClass, "text-orange-500")} />;
      default:
        return <File className={cn(iconClass, "text-gray-500")} />;
    }
  };

  const handleGeneratedScript = async (script: string, filename: string) => {
    if (!token) {
      clientToast({
        variant: "destructive",
        title: "Authentication Error",
        description: "You must be signed in to save scripts.",
      });
      return;
    }

    try {
      const language = getLanguageFromExtension(filename);
      const basename = filename.split(".")[0];

      const createdScript = await scriptService.create(
        basename,
        language,
        script,
        token,
      );

      const newFile = mapScriptToScriptFile(createdScript, script);

      setFiles((prev) => [...prev, newFile]);
      navigate(`/script-editor/${newFile.name}`);

      setOpenTabs((prev) => {
        if (!prev.find((t) => t.id === newFile.id)) {
          const newTabs = [...prev, newFile];
          localStorage.setItem(
            "openTabs",
            JSON.stringify(newTabs.map((t) => t.id)),
          );
          return newTabs;
        }
        return prev;
      });

      setHasUnsavedChanges(false);
      setIsAISidebarOpen(false);

      clientToast({
        title: "Success",
        description: "Script generated and saved successfully.",
      });
    } catch (error: any) {
      console.error("Failed to save generated script:", error);
      clientToast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save generated script.",
      });
    }
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
              },
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
              },
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
              },
            );
          }

          return { suggestions };
        },
      },
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

  const saveFile = async () => {
    setIsLoading(true);
    if (!currentFile) return;

    toast.loading("Saving file...");

    try {
      const clerkToken = await getToken();

      const updatedScript = await scriptService.update(
        currentFile.id,
        currentFile.content,
        clerkToken,
      );

      const updatedFile = {
        ...currentFile,
        lastModified: new Date(updatedScript.updated_at),
      };

      setFiles((prev) =>
        prev.map((f) => (f.id === currentFile.id ? updatedFile : f)),
      );
      setOpenTabs((prev) =>
        prev.map((f) => (f.id === currentFile.id ? updatedFile : f)),
      );
      setCurrentFile(updatedFile);
      setHasUnsavedChanges(false);

      clientToast({
        title: "Saved",
        description: "Script saved successfully.",
      });
    } catch (error: any) {
      console.error("Failed to save file:", error);
      clientToast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message || "Failed to save script.",
      });
    } finally {
      setIsLoading(false);
      toast.dismiss();
    }
  };

  const confirmDeleteScript = async () => {
    if (!scriptToDeleteId) return;

    setIsLoading(true);
    toast.loading("Deleting file...");
    try {
      const clerkToken = await getToken();

      await scriptService.delete(scriptToDeleteId, clerkToken);

      const updatedFiles = files.filter((f) => f.id !== scriptToDeleteId);
      setFiles(updatedFiles);

      const updatedTabs = openTabs.filter((tab) => tab.id !== scriptToDeleteId);
      setOpenTabs(updatedTabs);
      localStorage.setItem(
        "openTabs",
        JSON.stringify(updatedTabs.map((t) => t.id)),
      );

      if (currentFile?.id === scriptToDeleteId) {
        if (updatedTabs.length > 0) {
          navigate(`/script-editor/${updatedTabs[0].name}`);
        } else {
          setCurrentFile(null);
          navigate("/script-editor");
        }
        setHasUnsavedChanges(false);
      }

      clientToast({
        title: "Deleted",
        description: "Script deleted successfully.",
      });
    } catch (error: any) {
      console.error("Failed to delete file:", error);
      clientToast({
        variant: "destructive",
        title: "Delete Failed",
        description: error.message || "Failed to delete script.",
      });
    } finally {
      setIsLoading(false);
      toast.dismiss();
      setDeleteModalOpen(false);
      setScriptToDeleteId(null);
    }
  };

  const handleDeleteScriptClick = (fileId: string) => {
    setScriptToDeleteId(fileId);
    setTimeout(() => setDeleteModalOpen(true), 0);
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

  const handleCreateSubmit = async (name: string) => {
    setIsLoading(true);
    const trimmedName = name.trim();
    toast.loading(`Creating file: ${trimmedName}...`);

    if (!trimmedName) {
      clientToast({
        variant: "destructive",
        title: "Invalid Filename",
        description: "Filename cannot be empty.",
      });
      return;
    }

    const ext = trimmedName.split(".").pop()?.toLowerCase();
    const validExtensions = ["py", "js", "sh", "ps1"];

    if (!ext || !validExtensions.includes(ext)) {
      clientToast({
        variant: "destructive",
        title: "Invalid Extension",
        description: "Supported extensions: .py, .js, .sh, .ps1",
      });
      return;
    }

    if (files.some((f) => f.name.toLowerCase() === trimmedName.toLowerCase())) {
      clientToast({
        variant: "destructive",
        title: "Duplicate Filename",
        description: "A file with this name already exists.",
      });
      return;
    }

    try {
      const language = getLanguageFromExtension(trimmedName);
      const langInfo = getLanguageInfo(language);

      const basename = trimmedName.replace(/\.[^/.]+$/, "");

      const clerkToken = await getToken();

      const createdScript = await scriptService.create(
        basename,
        language,
        langInfo.template,
        clerkToken,
      );

      const newFile = mapScriptToScriptFile(createdScript, langInfo.template);

      setFiles((prev) => [...prev, newFile]);
      navigate(`/script-editor/${newFile.name}`);

      setOpenTabs((prev) => {
        const newTabs = [...prev, newFile];
        localStorage.setItem(
          "openTabs",
          JSON.stringify(newTabs.map((t) => t.id)),
        );
        return newTabs;
      });

      setHasUnsavedChanges(false);
      setIsCreatingFile(false);

      clientToast({
        title: "Created",
        description: "Script created successfully.",
      });
    } catch (error: any) {
      console.error("Failed to create file:", error);
      clientToast({
        variant: "destructive",
        title: "Create Failed",
        description: error.message || "Failed to create script.",
      });
    } finally {
      setIsLoading(false);
      toast.dismiss();
    }
  };

  const handleRenameSubmit = async (id: string, name: string) => {
    setIsLoading(true);
    const trimmedName = name.trim();

    toast.loading(`Renaming file: ${trimmedName}...`);

    if (!trimmedName) {
      clientToast({
        variant: "destructive",
        title: "Invalid Filename",
        description: "Filename cannot be empty.",
      });
      return;
    }

    const ext = trimmedName.split(".").pop()?.toLowerCase();
    const validExtensions = ["py", "js", "sh", "ps1"];

    if (!ext || !validExtensions.includes(ext)) {
      clientToast({
        variant: "destructive",
        title: "Invalid Extension",
        description: "Supported extensions: .py, .js, .sh, .ps1",
      });
      return;
    }

    if (
      files.some(
        (f) =>
          f.id !== id && f.name.toLowerCase() === trimmedName.toLowerCase(),
      )
    ) {
      clientToast({
        variant: "destructive",
        title: "Duplicate Filename",
        description: "A file with this name already exists.",
      });
      return;
    }

    try {
      const clerkToken = await getToken();

      const basename = trimmedName.replace(/\.[^/.]+$/, "");
      await scriptService.rename(id, basename, clerkToken);

      // Update local state
      const updatedFiles = files.map((f) =>
        f.id === id ? { ...f, name: trimmedName } : f,
      );
      setFiles(updatedFiles);

      const updatedTabs = openTabs.map((tab) =>
        tab.id === id ? { ...tab, name: trimmedName } : tab,
      );
      setOpenTabs(updatedTabs);

      if (currentFile?.id === id) {
        navigate(`/script-editor/${trimmedName}`);
      }

      setRenamingFileId(null);

      clientToast({
        title: "Renamed",
        description: "Script renamed successfully.",
      });
    } catch (error: any) {
      console.error("Failed to rename file:", error);
      clientToast({
        variant: "destructive",
        title: "Rename Failed",
        description: error.message || "Failed to rename script.",
      });
    } finally {
      setIsLoading(false);
      toast.dismiss();
    }
  };

  const selectFile = async (file: ScriptFile) => {
    let fileToSet = file;

    if (!file.content) {
      setIsLoading(true);
      try {
        const clerkToken = await getToken();

        const scriptContent = await scriptService.getContent(
          file.id,
          clerkToken,
        );
        fileToSet = { ...file, content: scriptContent.content };

        // Update files state cache with content
        setFiles((prev) => prev.map((f) => (f.id === file.id ? fileToSet : f)));
        // Update tabs
        setOpenTabs((prev) =>
          prev.map((f) => (f.id === file.id ? fileToSet : f)),
        );
      } catch (error) {
        console.error("Failed to load content", error);
        clientToast({
          variant: "destructive",
          title: "Load Failed",
          description: "Failed to load script content.",
        });
      } finally {
        setIsLoading(false);
      }
    }

    setCurrentFile(fileToSet);

    // Add to tabs if not already open
    if (!openTabs.find((tab) => tab.id === file.id)) {
      setOpenTabs((prev) => {
        const newTabs = [...prev, fileToSet];
        localStorage.setItem(
          "openTabs",
          JSON.stringify(newTabs.map((t) => t.id)),
        );
        return newTabs;
      });
    }

    setHasUnsavedChanges(false);
  };

  const closeTab = (fileId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();

    const updatedTabs = openTabs.filter((tab) => tab.id !== fileId);
    setOpenTabs(updatedTabs);
    localStorage.setItem(
      "openTabs",
      JSON.stringify(updatedTabs.map((t) => t.id)),
    );

    if (currentFile?.id === fileId) {
      if (updatedTabs.length > 0) {
        const currentIndex = openTabs.findIndex((tab) => tab.id === fileId);
        const newActiveTab = updatedTabs[Math.max(0, currentIndex - 1)];
        navigate(`/script-editor/${newActiveTab.name}`);
      } else {
        setCurrentFile(null);
        navigate("/script-editor");
      }
      setHasUnsavedChanges(false);
    }
  };

  const duplicateFile = async (file: ScriptFile) => {
    setIsLoading(true);
    toast.loading(`Creating file: ${file.name}_copy...`);
    // Read content -> Create new
    const newNameBase = `${file.name.replace(/\.[^/.]+$/, "")}_copy`;
    const originalExt = file.name.split(".").pop();
    const newName = `${newNameBase}.${originalExt}`;

    try {
      const clerkToken = await getToken();

      // ensure content is available
      let content = file.content;
      if (!content) {
        const data = await scriptService.getContent(file.id, clerkToken);
        content = data.content;
      }

      const created = await scriptService.create(
        newNameBase,
        file.language,
        content,
        clerkToken,
      );

      const newFile = mapScriptToScriptFile(created, content);
      setFiles((prev) => [...prev, newFile]);

      clientToast({
        title: "Duplicated",
        description: "Script duplicated successfully.",
      });
    } catch (e: any) {
      console.error("Duplicate failed", e);
      clientToast({
        variant: "destructive",
        title: "Error",
        description: e.message || "Failed to duplicate script.",
      });
    } finally {
      setIsLoading(false);
      toast.dismiss();
    }
  };

  const downloadFile = (file: ScriptFile) => {
    toast.loading(`Downloading file: ${file.name}...`);
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    toast.dismiss();
  };

  return (
    <SidebarProvider>
      <div className="flex w-full h-screen bg-gray-200 dark:bg-workflow-void/90 overflow-hidden">
        <LeftNav />

        <FileExplorerSidebar
          files={files}
          isLoadingScripts={isLoading}
          currentFile={currentFile}
          onSelectFile={(file) => {
            navigate(`/script-editor/${file.name}`);
          }}
          onCreateFile={startCreateFile}
          onDeleteFile={handleDeleteScriptClick}
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
                      Script Editor
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
                        : "text-gray-700 dark:text-gray-300",
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
                    onClick={() => navigate(`/script-editor/${tab.name}`)}
                    className={cn(
                      "flex items-center space-x-2 px-4 py-2.5 border-r border-gray-200 dark:border-gray-800 transition-colors min-w-[120px] max-w-[200px] group relative",
                      currentFile?.id === tab.id
                        ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white border-t-2 border-t-purple-500"
                        : "bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800",
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
            scriptType={"python"}
            onGeneratedScript={handleGeneratedScript}
            isOpen={isAISidebarOpen}
            onToggle={() => setIsAISidebarOpen(!isAISidebarOpen)}
          />
        </SidebarInset>
        <DeleteConfirmationModal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={confirmDeleteScript}
          title="Delete Script?"
          description="Are you sure you want to delete this script? This action cannot be undone."
          isLoading={isLoading}
        />
      </div>
    </SidebarProvider>
  );
};

export default CodeEditor;
