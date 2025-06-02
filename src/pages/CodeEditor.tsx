import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Play,
  File,
  Folder,
  Trash2,
  Pencil,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import Editor from "@monaco-editor/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface ScriptFile {
  id: string;
  name: string;
  content: string;
  language: string;
  lastModified: Date;
  source: "upload" | "editor";
}

const CodeEditor = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scriptType = searchParams.get("type") || "python";
  //   const nodeId = searchParams.get("nodeId");

  const [currentFile, setCurrentFile] = useState<ScriptFile | null>(null);
  const [files, setFiles] = useState<ScriptFile[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");

  const getLanguageInfo = (type: string) => {
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

  useEffect(() => {
    // Load saved files from localStorage
    const savedFiles = localStorage.getItem("scriptFiles");
    if (savedFiles) {
      const parsedFiles = JSON.parse(savedFiles).map(
        (
          file: Omit<ScriptFile, "lastModified"> & { lastModified: string }
        ) => ({
          ...file,
          lastModified: new Date(file.lastModified),
        })
      );
      setFiles(parsedFiles);
    }

    // Create or load current file
    const langInfo = getLanguageInfo(scriptType);
    const defaultFileName = `script.${langInfo.extension}`;

    const existingFile = files.find((f) => f.language === langInfo.language);
    if (existingFile) {
      setCurrentFile(existingFile);
    } else {
      const newFile: ScriptFile = {
        id: `${Date.now()}-${Math.random()}`,
        name: defaultFileName,
        content: langInfo.template,
        language: langInfo.language,
        lastModified: new Date(),
        source: "editor",
      };
      setCurrentFile(newFile);
    }
  }, [scriptType]);

  const saveFile = () => {
    if (!currentFile) return;

    const updatedFile = {
      ...currentFile,
      lastModified: new Date(),
    };

    const updatedFiles = files.some((f) => f.id === currentFile.id)
      ? files.map((f) => (f.id === currentFile.id ? updatedFile : f))
      : [...files, updatedFile];

    setFiles(updatedFiles);
    setCurrentFile(updatedFile);
    localStorage.setItem("scriptFiles", JSON.stringify(updatedFiles));
    setHasUnsavedChanges(false);

    console.log("File saved:", updatedFile);
  };

  const deleteScript = (fileId: string) => {
    const updatedFiles = files.filter((f) => f.id !== fileId);
    setFiles(updatedFiles);
    localStorage.setItem("scriptFiles", JSON.stringify(updatedFiles));

    if (currentFile?.id === fileId) {
      setCurrentFile(null);
      setHasUnsavedChanges(false);
    }
  };

  const runScript = (file: ScriptFile) => {
    console.log(`Running script: ${file.name}`);
    console.log("Script content:", file.content);
    // Here you could implement actual script execution logic
  };

  const startRename = (file: ScriptFile) => {
    setRenamingFileId(file.id);
    setNewFileName(file.name);
  };

  const confirmRename = (fileId: string) => {
    if (!newFileName.trim()) return;

    const updatedFiles = files.map((f) =>
      f.id === fileId ? { ...f, name: newFileName.trim() } : f
    );
    setFiles(updatedFiles);
    localStorage.setItem("scriptFiles", JSON.stringify(updatedFiles));

    if (currentFile?.id === fileId) {
      setCurrentFile({ ...currentFile, name: newFileName.trim() });
    }

    setRenamingFileId(null);
    setNewFileName("");
  };

  const cancelRename = () => {
    setRenamingFileId(null);
    setNewFileName("");
  };

  const handleEditorChange = (value: string | undefined) => {
    if (currentFile && value !== undefined) {
      setCurrentFile({ ...currentFile, content: value });
      setHasUnsavedChanges(true);
    }
  };

  const createNewFile = () => {
    const langInfo = getLanguageInfo(scriptType);
    const newFile: ScriptFile = {
      id: `${Date.now()}-${Math.random()}`,
      name: `new-script.${langInfo.extension}`,
      content: langInfo.template,
      language: langInfo.language,
      lastModified: new Date(),
      source: "editor",
    };
    setCurrentFile(newFile);
    setHasUnsavedChanges(true);
  };

  const selectFile = (file: ScriptFile) => {
    setCurrentFile(file);
    setHasUnsavedChanges(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <div className="h-12 bg-slate-800/80 backdrop-blur-sm border-b border-slate-700/50 flex items-center justify-between px-4">
        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/workflow")}
            className="text-slate-400 hover:text-gray-800"
          >
            <ArrowLeft size={16} className="mr-1" />
            Back to Workflow
          </Button>
          <div className="w-px h-5 bg-slate-600"></div>
          <div className="flex items-center space-x-2">
            <File size={16} className="text-blue-400" />
            <span className="text-sm font-medium">
              {currentFile?.name || "Untitled"}
            </span>
            {hasUnsavedChanges && (
              <div className="w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={createNewFile}
            className="text-slate-400 hover:text-gray-800"
          >
            <File size={14} className="mr-1" />
            New
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={saveFile}
            className={`${
              hasUnsavedChanges
                ? "text-blue-400 hover:text-blue-800"
                : "text-slate-400 hover:text-gray-800"
            }`}
          >
            <Save size={14} className="mr-1" />
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-green-400 hover:text-green-800"
          >
            <Play size={14} className="mr-1" />
            Run
          </Button>
        </div>
      </div>

      <div className="h-[calc(100vh-3rem)] flex">
        {/* File Explorer */}
        <div className="w-56 bg-slate-800/60 backdrop-blur-xl border-r border-slate-700/50 p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-300 flex items-center">
              <Folder size={12} className="mr-1" />
              Scripts
            </h3>
          </div>

          <div className="space-y-1">
            {files.map((file) => (
              <ContextMenu key={file.id}>
                <ContextMenuTrigger asChild>
                  {renamingFileId === file.id ? (
                    <div className="px-2 py-1.5 text-xs rounded-md bg-slate-700/50">
                      <input
                        type="text"
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        onBlur={() => confirmRename(file.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmRename(file.id);
                          if (e.key === "Escape") cancelRename();
                        }}
                        className="w-full bg-transparent border-none outline-none text-white"
                        autoFocus
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => selectFile(file)}
                      className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors duration-200 flex items-center space-x-2 ${
                        currentFile?.id === file.id
                          ? "bg-blue-600/30 text-blue-300 border border-blue-500/30"
                          : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                      }`}
                    >
                      <File size={12} />
                      <span className="truncate">{file.name}</span>
                      {/* <span className="text-xs text-slate-500">
                        {file.source === "upload" ? "↑" : "✏️"}
                      </span> */}
                    </button>
                  )}
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  <ContextMenuItem
                    onClick={() => runScript(file)}
                    className="flex items-center space-x-2"
                  >
                    <Play size={14} />
                    <span>Run Script</span>
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => startRename(file)}
                    className="flex items-center space-x-2"
                  >
                    <Pencil size={14} />
                    <span>Rename</span>
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() => deleteScript(file.id)}
                    className="flex items-center space-x-2 text-red-400 focus:text-red-300"
                  >
                    <Trash2 size={14} />
                    <span>Delete Script</span>
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}

            {files.length === 0 && (
              <div className="text-xs text-slate-500 text-center py-4">
                No scripts yet
              </div>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 relative">
          {currentFile ? (
            <Editor
              height="100%"
              language={currentFile.language}
              value={currentFile.content}
              onChange={handleEditorChange}
              theme="vs-dark"
              options={{
                minimap: { enabled: true },
                fontSize: 13,
                lineNumbers: "on",
                roundedSelection: false,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                insertSpaces: true,
                wordWrap: "on",
                formatOnPaste: true,
                formatOnType: true,
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <File size={48} className="text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm mb-2">No file selected</p>
                <Button onClick={createNewFile} variant="outline" size="sm">
                  Create New Script
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;
