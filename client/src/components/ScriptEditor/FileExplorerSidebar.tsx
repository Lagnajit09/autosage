import React, { useState, useEffect, useRef } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  File,
  FilePlus,
  Folder,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy as CopyIcon,
  Download,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScriptFile } from "@/utils/types";

interface FileExplorerSidebarProps {
  files: ScriptFile[];
  currentFile: ScriptFile | null;
  isLoadingScripts?: boolean;
  onSelectFile: (file: ScriptFile) => void;
  onCreateFile: () => void;
  onDeleteFile: (id: string) => void;
  onRenameFile: (file: ScriptFile) => void;
  onDuplicateFile: (file: ScriptFile) => void;
  onDownloadFile: (file: ScriptFile) => void;
  getFileIcon: (filename: string) => React.ReactNode;

  // Inline editing props
  isCreatingFile: boolean;
  renamingFileId: string | null;
  onCreateSubmit: (name: string) => void;
  onRenameSubmit: (id: string, name: string) => void;
  onCancelCreate: () => void;
  onCancelRename: () => void;
}

export const FileExplorerSidebar: React.FC<FileExplorerSidebarProps> = ({
  files,
  currentFile,
  isLoadingScripts,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  onRenameFile,
  onDuplicateFile,
  onDownloadFile,
  getFileIcon,
  isCreatingFile,
  renamingFileId,
  onCreateSubmit,
  onRenameSubmit,
  onCancelCreate,
  onCancelRename,
}) => {
  const { state } = useSidebar();
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreatingFile) {
      setInputValue("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isCreatingFile]);

  useEffect(() => {
    if (renamingFileId) {
      const file = files.find((f) => f.id === renamingFileId);
      if (file) {
        setInputValue(file.name);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
  }, [renamingFileId, files]);

  const handleKeyDown = (
    e: React.KeyboardEvent,
    isCreate: boolean,
    fileId?: string,
  ) => {
    if (e.key === "Enter") {
      if (isCreate) {
        onCreateSubmit(inputValue);
      } else if (fileId) {
        onRenameSubmit(fileId, inputValue);
      }
    } else if (e.key === "Escape") {
      if (isCreate) {
        onCancelCreate();
      } else {
        onCancelRename();
      }
    }
  };

  const handleBlur = (isCreate: boolean) => {
    // Cancel operation on blur as requested
    if (isCreate) {
      onCancelCreate();
    } else {
      onCancelRename();
    }
  };

  return (
    <Sidebar
      collapsible="icon"
      className="ml-16 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50"
    >
      <SidebarHeader className="h-14 flex items-center px-2 my-auto border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 overflow-hidden">
            <SidebarTrigger className="ml-2 hover:bg-gray-200 dark:hover:bg-gray-700" />
            {state === "expanded" && (
              <span className="font-semibold text-sm truncate">Explorer</span>
            )}
          </div>
          {state === "expanded" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-gray-200 dark:hover:bg-gray-700 dark:hover:text-gray-100 mr-2"
                  onClick={onCreateFile}
                  disabled={isCreatingFile}
                >
                  <FilePlus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New File</TooltipContent>
            </Tooltip>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Files</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Creating New File Input */}
              {isCreatingFile && (
                <SidebarMenuItem>
                  <div className="flex items-center gap-2 px-2 py-1.5 w-full">
                    {isLoadingScripts ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <File className="w-4 h-4 text-gray-400" />
                    )}
                    <Input
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, true)}
                      onBlur={() => handleBlur(true)}
                      className="h-7 text-sm px-2 py-0"
                      placeholder="filename.py"
                    />
                  </div>
                </SidebarMenuItem>
              )}

              {isLoadingScripts &&
                !isCreatingFile &&
                !renamingFileId &&
                files.length === 0 && (
                  <SidebarMenuItem>
                    <div className="flex items-center gap-2 px-2 py-1.5 w-full">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Fetching scripts...</span>
                    </div>
                  </SidebarMenuItem>
                )}

              {files.map((file) => (
                <SidebarMenuItem key={file.id}>
                  {renamingFileId === file.id ? (
                    <div className="flex items-center gap-2 px-2 py-1.5 w-full">
                      {isLoadingScripts ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        getFileIcon(file.name)
                      )}
                      <Input
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, false, file.id)}
                        onBlur={() => handleBlur(false)}
                        className="h-7 text-sm px-2 py-0"
                      />
                    </div>
                  ) : (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            onClick={() => onSelectFile(file)}
                            isActive={currentFile?.id === file.id}
                            tooltip={file.name}
                            className="group/item"
                          >
                            {getFileIcon(file.name)}
                            <span>{file.name}</span>
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {file.name}
                        </TooltipContent>
                      </Tooltip>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction showOnHover>
                            <MoreHorizontal />
                            <span className="sr-only">More</span>
                          </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          className="w-48 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-800"
                          side="right"
                          align="start"
                        >
                          <DropdownMenuItem
                            className="dark:hover:bg-gray-800 dark:hover:text-gray-100"
                            onClick={() => onSelectFile(file)}
                          >
                            <ChevronRight className="mr-2 h-4 w-4" />
                            <span>Open</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="dark:hover:bg-gray-800 dark:hover:text-gray-100"
                            onClick={() => onRenameFile(file)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            <span>Rename</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="dark:hover:bg-gray-800 dark:hover:text-gray-100"
                            onClick={() => onDuplicateFile(file)}
                          >
                            <CopyIcon className="mr-2 h-4 w-4" />
                            <span>Duplicate</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="dark:hover:bg-gray-800 dark:hover:text-gray-100"
                            onClick={() => onDownloadFile(file)}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            <span>Download</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDeleteFile(file.id)}
                            className="dark:hover:bg-gray-800 text-red-600 dark:text-red-400"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </SidebarMenuItem>
              ))}

              {files.length === 0 &&
                !isLoadingScripts &&
                !isCreatingFile &&
                state === "expanded" && (
                  <div className="px-4 py-8 text-center">
                    <p className="text-xs text-muted-foreground mb-2">
                      No files found
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onCreateFile}
                      className="w-full dark:bg-gray-950 dark:border-gray-950 dark:hover:bg-gray-950/50 dark:hover:text-gray-100"
                    >
                      Create File
                    </Button>
                  </div>
                )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
};
