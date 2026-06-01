import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { OnMount } from "@monaco-editor/react";
import { Braces, Code, Terminal, SquareTerminal, File } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { toast } from "sonner";
import { scriptService, mapScriptToScriptFile } from "@/lib/api/scripts";
import { ScriptFile, ScriptLanguage } from "@/utils/types";

export function useScriptEditor() {
  const { name } = useParams();
  const navigate = useNavigate();
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

  // ── Auth ────────────────────────────────────────────────────────────────────

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

  // ── File fetching ────────────────────────────────────────────────────────────

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    toast.loading("Fetching scripts...");
    try {
      const clerkToken = await getToken();
      const scripts = await scriptService.getAll(clerkToken);
      const scriptFiles = scripts.map((s) => mapScriptToScriptFile(s));
      setFiles(scriptFiles);

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
  }, [getToken, clientToast]);

  useEffect(() => {
    if (token) fetchFiles();
  }, [token, fetchFiles]);

  // Open file fetched by URL param
  useEffect(() => {
    if (name) {
      const script = files.find((f) => f.name === name);
      if (script) selectFile(script);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, files]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const getLanguageFromExtension = (filename: string): ScriptLanguage => {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    switch (ext) {
      case "py":
        return "python";
      case "ps1":
        return "powershell";
      case "sh":
        return "shell";
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
          template: `#!/usr/bin/env python3

# Python Script

# def main():
#     print("Hello, World!")

# if __name__ == "__main__":
#     main()

# --- INSTRUCTIONS ---
# You can mention template variables / parameters in your script using the {{PARAMETER_NAME}} syntax.
# To use it, simply place {{PARAMETER_NAME}} wherever you need the parameter value to be injected.
# The parameter matching is case insensitive, but the spelling must match exactly.
# There are different types of parameters available, such as string, number, boolean, and password.
#
# SPECIAL INSTRUCTION ON PASSWORD TYPE PARAMETERS:
# Password type parameters should NOT be used with the {{}} syntax.
# Instead, password parameters are securely passed as environment variables.
# They should be read from the env (e.g., os.getenv("PARAM_NAME")).
# --------------------
`,
        };
      case "powershell":
        return {
          language: "powershell",
          extension: "ps1",
          template: `# PowerShell Script

# Write-Host "Hello, World!"

# --- INSTRUCTIONS ---
# You can mention template variables / parameters in your script using the {{PARAMETER_NAME}} syntax.
# To use it, simply place {{PARAMETER_NAME}} wherever you need the parameter value to be injected.
# The parameter matching is case insensitive, but the spelling must match exactly.
# There are different types of parameters available, such as string, number, boolean, and password.
#
# SPECIAL INSTRUCTION ON PASSWORD TYPE PARAMETERS:
# Password type parameters should NOT be used with the {{}} syntax.
# Instead, password parameters are securely passed as environment variables.
# They should be read from the env (e.g., $env:PARAM_NAME).
# --------------------
`,
        };
      case "shell":
        return {
          language: "shell",
          extension: "sh",
          template: `#!/bin/bash

# Shell Script

# echo "Hello, World!"

# --- INSTRUCTIONS ---
# You can mention template variables / parameters in your script using the {{PARAMETER_NAME}} syntax.
# To use it, simply place {{PARAMETER_NAME}} wherever you need the parameter value to be injected.
# The parameter matching is case insensitive, but the spelling must match exactly.
# There are different types of parameters available, such as string, number, boolean, and password.
#
# SPECIAL INSTRUCTION ON PASSWORD TYPE PARAMETERS:
# Password type parameters should NOT be used with the {{}} syntax.
# Instead, password parameters are securely passed as environment variables.
# They should be read from the env (e.g., $PARAM_NAME).
# --------------------
`,
        };
      default:
        return {
          language: "javascript",
          extension: "js",
          template: `// JavaScript

// console.log("Hello, World!");

// --- INSTRUCTIONS ---
// You can mention template variables / parameters in your script using the {{PARAMETER_NAME}} syntax.
// To use it, simply place {{PARAMETER_NAME}} wherever you need the parameter value to be injected.
// The parameter matching is case insensitive, but the spelling must match exactly.
// There are different types of parameters available, such as string, number, boolean, and password.
//
// SPECIAL INSTRUCTION ON PASSWORD TYPE PARAMETERS:
// Password type parameters should NOT be used with the {{}} syntax.
// Instead, password parameters are securely passed as environment variables.
// They should be read from the env (e.g., process.env.PARAM_NAME).
// --------------------
`,
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

  // ── Monaco setup ─────────────────────────────────────────────────────────────

  const configureMonacoEditor: OnMount = (editor, monaco) => {
    monaco.languages.registerCompletionItemProvider(
      currentFile?.language || "javascript",
      {
        provideCompletionItems: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const suggestions: any[] = [];

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

  // ── CRUD operations ───────────────────────────────────────────────────────────

  const handleEditorChange = (value: string | undefined) => {
    if (currentFile && value !== undefined) {
      setCurrentFile({ ...currentFile, content: value });
      setHasUnsavedChanges(true);
    }
  };

  const saveFile = async () => {
    if (!currentFile) return;
    setIsLoading(true);
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
    } catch (error: unknown) {
      console.error("Failed to save file:", error);
      clientToast({
        variant: "destructive",
        title: "Save Failed",
        description: (error as Error).message || "Failed to save script.",
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

        setFiles((prev) => prev.map((f) => (f.id === file.id ? fileToSet : f)));
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

  const startCreateFile = () => setIsCreatingFile(true);

  const handleCreateSubmit = async (name: string) => {
    setIsLoading(true);
    const trimmedName = name.trim();

    if (!trimmedName) {
      clientToast({
        variant: "destructive",
        title: "Invalid Filename",
        description: "Filename cannot be empty.",
      });
      setIsCreatingFile(false);
      return;
    }

    const ext = trimmedName.split(".").pop()?.toLowerCase();
    const validExtensions = ["ps1", "sh"];

    if (!ext || !validExtensions.includes(ext)) {
      clientToast({
        variant: "destructive",
        title: "Invalid Extension",
        description: "Supported extensions: .ps1, .sh",
      });
      setIsCreatingFile(false);
      return;
    }

    if (files.some((f) => f.name.toLowerCase() === trimmedName.toLowerCase())) {
      clientToast({
        variant: "destructive",
        title: "Duplicate Filename",
        description: "A file with this name already exists.",
      });
      setIsCreatingFile(false);
      return;
    }

    toast.loading(`Creating file: ${trimmedName}...`);

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
    } catch (error: unknown) {
      console.error("Failed to create file:", error);
      clientToast({
        variant: "destructive",
        title: "Create Failed",
        description: (error as Error).message || "Failed to create script.",
      });
    } finally {
      setIsLoading(false);
      toast.dismiss();
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Clear the input value so the same file can be uploaded again if needed
    event.target.value = "";

    const fileName = file.name;
    const ext = fileName.split(".").pop()?.toLowerCase();

    if (ext !== "ps1" && ext !== "sh") {
      clientToast({
        variant: "destructive",
        title: "Invalid Extension",
        description: "Only .ps1 and .sh files are allowed for upload.",
      });
      return;
    }

    let basename = fileName.replace(/\.[^/.]+$/, "");
    let finalFileName = fileName;

    if (files.some((f) => f.name.toLowerCase() === fileName.toLowerCase())) {
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      basename = `${basename}_${randomSuffix}`;
      finalFileName = `${basename}.${ext}`;
    }

    setIsLoading(true);
    toast.loading(`Uploading script: ${finalFileName}...`);

    try {
      const content = await file.text();
      const language = getLanguageFromExtension(finalFileName);
      const clerkToken = await getToken();

      const createdScript = await scriptService.create(
        basename,
        language,
        content,
        clerkToken,
      );

      const newFile = mapScriptToScriptFile(createdScript, content);
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

      clientToast({
        title: "Uploaded",
        description: "Script uploaded successfully.",
      });
    } catch (error: unknown) {
      console.error("Failed to upload file:", error);
      clientToast({
        variant: "destructive",
        title: "Upload Failed",
        description: (error as Error).message || "Failed to upload script.",
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
    } catch (error: unknown) {
      console.error("Failed to rename file:", error);
      clientToast({
        variant: "destructive",
        title: "Rename Failed",
        description: (error as Error).message || "Failed to rename script.",
      });
    } finally {
      setIsLoading(false);
      toast.dismiss();
    }
  };

  const handleDeleteScriptClick = (fileId: string) => {
    setScriptToDeleteId(fileId);
    setTimeout(() => setDeleteModalOpen(true), 0);
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
    } catch (error: unknown) {
      console.error("Failed to delete file:", error);
      clientToast({
        variant: "destructive",
        title: "Delete Failed",
        description: (error as Error).message || "Failed to delete script.",
      });
    } finally {
      setIsLoading(false);
      toast.dismiss();
      setDeleteModalOpen(false);
      setScriptToDeleteId(null);
    }
  };

  // Autobot owns the create_script/update_script tool calls. These
  // callbacks just refetch and sync local state — the tool result lacks
  // the full ScriptFile shape (content + pathname + blob_url).

  const handleScriptCreated = useCallback(
    async (scriptId: string, _scriptName: string) => {
      void _scriptName;
      // Same toast id throughout — bridges the ~500ms gap between
      // "done" and the editor actually showing the new script.
      const toastId = toast.loading("Loading new script into editor…");
      try {
        const clerkToken = await getToken();
        if (!clerkToken) throw new Error("Not signed in.");

        // Refetch the full list so the new script appears in the file
        // explorer immediately. Then locate the new row by id and open it.
        const scripts = await scriptService.getAll(clerkToken);
        const all = scripts.map((s) => mapScriptToScriptFile(s));
        setFiles(all);

        const newFile = all.find((f) => f.id === scriptId);
        if (!newFile) {
          // Stale ids (server-side race) — surface a generic refresh
          // hint rather than failing silently.
          toast.warning(
            "Script created — couldn't locate it in the file list. Try refreshing.",
            { id: toastId },
          );
          return;
        }

        // Open the new file in the editor pane via URL — the existing
        // name-driven useEffect handles the rest.
        navigate(`/script-editor/${newFile.name}`);
        setOpenTabs((prev) => {
          if (prev.find((t) => t.id === newFile.id)) return prev;
          const next = [...prev, newFile];
          localStorage.setItem(
            "openTabs",
            JSON.stringify(next.map((t) => t.id)),
          );
          return next;
        });

        toast.success(`${newFile.name} is open in the editor.`, {
          id: toastId,
        });
      } catch (error) {
        console.error("handleScriptCreated failed:", error);
        toast.error(
          (error as Error).message ||
            "Script was created but the editor couldn't refresh.",
          { id: toastId },
        );
      }
    },
    [getToken, navigate],
  );

  const handleScriptUpdated = useCallback(
    async (scriptId: string) => {
      const toastId = toast.loading("Reloading script…");
      try {
        const clerkToken = await getToken();
        if (!clerkToken) throw new Error("Not signed in.");

        // Refetch THIS script's metadata + content. The list itself
        // doesn't need refetching — name/version on other rows didn't
        // change — but the open editor pane needs the new body.
        const [allScripts, scriptContent] = await Promise.all([
          scriptService.getAll(clerkToken),
          scriptService.getContent(scriptId, clerkToken),
        ]);
        const fresh = allScripts.find(
          (s) => s.id.toString() === scriptId,
        );
        if (!fresh) {
          toast.warning("Script updated but couldn't refetch its content.", {
            id: toastId,
          });
          return;
        }

        const updatedFile = mapScriptToScriptFile(fresh, scriptContent.content);

        setFiles((prev) =>
          prev.map((f) => (f.id === scriptId ? updatedFile : f)),
        );
        setOpenTabs((prev) =>
          prev.map((f) => (f.id === scriptId ? updatedFile : f)),
        );
        // Reflect the new content in the editor pane IF this is the
        // currently-open file. Otherwise leave currentFile alone — the
        // user might be on a different tab.
        setCurrentFile((cur) => (cur && cur.id === scriptId ? updatedFile : cur));
        setHasUnsavedChanges(false);

        toast.success(`${updatedFile.name} reloaded.`, { id: toastId });
      } catch (error) {
        console.error("handleScriptUpdated failed:", error);
        toast.error(
          (error as Error).message ||
            "Script was updated but the editor couldn't refresh.",
          { id: toastId },
        );
      }
    },
    [getToken],
  );

  const duplicateFile = async (file: ScriptFile) => {
    setIsLoading(true);
    toast.loading(`Creating file: ${file.name}_copy...`);
    const newNameBase = `${file.name.replace(/\.[^/.]+$/, "")}_copy`;
    const originalExt = file.name.split(".").pop();
    const newName = `${newNameBase}.${originalExt}`;

    try {
      const clerkToken = await getToken();

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
    } catch (e: unknown) {
      console.error("Duplicate failed", e);
      clientToast({
        variant: "destructive",
        title: "Error",
        description: (e as Error).message || "Failed to duplicate script.",
      });
    } finally {
      setIsLoading(false);
      toast.dismiss();
    }
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

  return {
    // State
    currentFile,
    files,
    openTabs,
    hasUnsavedChanges,
    isAISidebarOpen,
    setIsAISidebarOpen,
    isLoading,
    isCreatingFile,
    setIsCreatingFile,
    renamingFileId,
    setRenamingFileId,
    deleteModalOpen,
    setDeleteModalOpen,
    // Actions
    saveFile,
    selectFile,
    closeTab,
    startCreateFile,
    handleCreateSubmit,
    handleFileUpload,
    handleRenameSubmit,
    handleDeleteScriptClick,
    confirmDeleteScript,
    handleEditorChange,
    handleScriptCreated,
    handleScriptUpdated,
    duplicateFile,
    downloadFile,
    configureMonacoEditor,
    getFileIcon,
  };
}
