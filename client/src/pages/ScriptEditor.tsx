import LeftNav from "@/components/LeftNav";
import { useTheme } from "@/contexts/theme/theme-context";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { FileExplorerSidebar } from "@/components/ScriptEditor/FileExplorerSidebar";
import { AIScriptGeneratorSidebar } from "@/components/ScriptEditor/AIScriptGeneratorSidebar";
import { DeleteConfirmationModal } from "@/components/DeleteConfirmationModal";
import { MobileRestrictedMessage } from "@/components/workflow/MobileRestrictedMessage";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";

import { useScriptEditor } from "../components/ScriptEditor/useScriptEditor";
import { EditorHeader } from "../components/ScriptEditor/EditorHeader";
import { EditorTabs } from "../components/ScriptEditor/EditorTabs";
import { EditorPane } from "../components/ScriptEditor/EditorPane";
import { useScriptExecution } from "../components/ScriptEditor/useScriptExecution";
import { ScriptExecutionDrawer } from "../components/ScriptEditor/ScriptExecutionDrawer";
import { ExecutionHistoryModal } from "../components/ScriptEditor/ExecutionHistoryModal";
import { LibraryScriptsModal } from "../components/ScriptEditor/LibraryScriptsModal";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { scriptService } from "@/lib/api/scripts";
import { ScriptParameter } from "@/utils/types";
import {
  extractScriptVariables,
  mergeScriptParams,
} from "@/utils/scriptParams";

// Mobile gate lives in this thin wrapper so the inner component's
// hooks (useScriptEditor, useScriptExecution, Monaco mount) never run on
// small screens. Same shape as WorkflowBuilder / WorkflowBuilderContent.
const ScriptEditor = () => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <MobileRestrictedMessage
        description="The Script Editor uses a code editor that's hard to use on small screens. Please open this page on a desktop or tablet to create, edit, and run scripts."
      />
    );
  }
  return <ScriptEditorContent />;
};

const ScriptEditorContent = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();

  const {
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
    saveFile,
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
  } = useScriptEditor();

  const [isExecutionOpen, setIsExecutionOpen] = useState(false);
  const [isExecutionsHistoryOpen, setIsExecutionsHistoryOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const {
    servers,
    credentials,
    selectedServerId,
    setSelectedServerId,
    selectedCredentialId,
    setSelectedCredentialId,
    executeScript,
    stopCurrentExecution,
    refreshData,
    clearLogs,
    isExecuting,
    isStopping,
    isLoadingData,
    logs,
  } = useScriptExecution();

  const { getToken } = useAuth();

  // ── Parameterized execution state ─────────────────────────────────────────
  // Persisted metadata (type/default/secret) for the open script. The variable
  // *set* is derived from the body's {{VAR}} markers; metadata just enriches it.
  const [paramMeta, setParamMeta] = useState<ScriptParameter[]>([]);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [isSavingParamMeta, setIsSavingParamMeta] = useState(false);

  // Seed metadata from the file whenever a different script is opened.
  useEffect(() => {
    setParamMeta(currentFile?.parameters ?? []);
  }, [currentFile?.id, currentFile?.parameters]);

  // Reset entered values when switching scripts (keep them across body edits).
  useEffect(() => {
    setParamValues({});
  }, [currentFile?.id]);

  // Merge detected {{vars}} with metadata into the render list.
  const params = useMemo(
    () =>
      mergeScriptParams(
        extractScriptVariables(currentFile?.content ?? ""),
        paramMeta,
      ),
    [currentFile?.content, paramMeta],
  );

  // paramValues holds only user-entered overrides; the display/run value falls
  // back to each param's default. No prefill effect (which could clobber typing).
  const setParamValue = useCallback((name: string, value: string) => {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleRunScript = useCallback(() => {
    if (!currentFile) return;
    // Send every detected variable, falling back to its default when blank.
    const inputs: Record<string, string> = {};
    for (const p of params) {
      inputs[p.name] = paramValues[p.name] ?? p.default ?? "";
    }
    executeScript(currentFile, inputs);
  }, [currentFile, params, paramValues, executeScript]);

  const handleSaveParamMeta = useCallback(
    async (meta: ScriptParameter[]) => {
      if (!currentFile?.id) return;
      setIsSavingParamMeta(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");
        const updated = await scriptService.updateParameters(
          currentFile.id,
          meta,
          token,
        );
        setParamMeta(updated.parameters ?? meta);
        toast.success("Parameters saved");
      } catch (error) {
        console.error("Failed to save parameters:", error);
        toast.error((error as Error).message || "Failed to save parameters");
      } finally {
        setIsSavingParamMeta(false);
      }
    },
    [currentFile?.id, getToken],
  );

  // Clear logs when script changes to improve user experience
  useEffect(() => {
    if (currentFile?.id) {
      clearLogs();
    }
  }, [currentFile?.id, clearLogs]);

  return (
    <SidebarProvider>
      <div className="flex w-full h-screen bg-gray-200 dark:bg-workflow-void/90 overflow-hidden">
        <LeftNav />

        <FileExplorerSidebar
          files={files}
          isLoadingScripts={isLoading}
          currentFile={currentFile}
          onSelectFile={(file) => navigate(`/script-editor/${file.name}`)}
          onCreateFile={startCreateFile}
          onDeleteFile={handleDeleteScriptClick}
          onRenameFile={(file) => setRenamingFileId(file.id)}
          onDuplicateFile={duplicateFile}
          onDownloadFile={downloadFile}
          getFileIcon={getFileIcon}
          isCreatingFile={isCreatingFile}
          renamingFileId={renamingFileId}
          onCreateSubmit={handleCreateSubmit}
          onUploadFile={handleFileUpload}
          onRenameSubmit={handleRenameSubmit}
          onCancelCreate={() => setIsCreatingFile(false)}
          onCancelRename={() => setRenamingFileId(null)}
        />

        <SidebarInset className="flex flex-row overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-black/90">
            <EditorHeader
              hasUnsavedChanges={hasUnsavedChanges}
              isAISidebarOpen={isAISidebarOpen}
              onSave={saveFile}
              onToggleAI={() => setIsAISidebarOpen(!isAISidebarOpen)}
              onToggleTerminal={() => setIsExecutionOpen(!isExecutionOpen)}
              onToggleExecutions={() => setIsExecutionsHistoryOpen(true)}
              onOpenLibrary={() => setIsLibraryOpen(true)}
            />

            <EditorTabs
              openTabs={openTabs}
              currentFile={currentFile}
              getFileIcon={getFileIcon}
              onSelectTab={(tab) => navigate(`/script-editor/${tab.name}`)}
              onCloseTab={closeTab}
            />

            <div className="flex-1 relative">
              <EditorPane
                currentFile={currentFile}
                isDark={isDark}
                onMount={configureMonacoEditor}
                onChange={handleEditorChange}
                onCreateFile={startCreateFile}
                onUploadFile={handleFileUpload}
              />
              <ScriptExecutionDrawer
                isOpen={isExecutionOpen}
                onClose={() => setIsExecutionOpen(false)}
                scriptName={currentFile?.name}
                servers={servers}
                credentials={credentials}
                selectedServerId={selectedServerId}
                setSelectedServerId={setSelectedServerId}
                selectedCredentialId={selectedCredentialId}
                setSelectedCredentialId={setSelectedCredentialId}
                onExecute={handleRunScript}
                onStop={stopCurrentExecution}
                onRefresh={() => {
                  refreshData();
                  clearLogs();
                }}
                onClearLogs={clearLogs}
                isExecuting={isExecuting}
                isStopping={isStopping}
                isLoadingData={isLoadingData}
                logs={logs}
                params={params}
                paramValues={paramValues}
                onParamValueChange={setParamValue}
                onSaveParamMeta={handleSaveParamMeta}
                isSavingParamMeta={isSavingParamMeta}
              />
              <ExecutionHistoryModal
                isOpen={isExecutionsHistoryOpen}
                onClose={() => setIsExecutionsHistoryOpen(false)}
              />
            </div>
          </div>

          {/* Inline Script Generator panel — runs autobot directly.
           * Passes the currently-open script (if any) as context so the
           * LLM can default to updating it without re-prompting the user
           * for a target. */}
          <AIScriptGeneratorSidebar
            openScript={
              currentFile
                ? {
                    id: currentFile.id,
                    name: currentFile.name,
                    language: currentFile.language,
                  }
                : null
            }
            onScriptCreated={handleScriptCreated}
            onScriptUpdated={handleScriptUpdated}
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

        <LibraryScriptsModal
          open={isLibraryOpen}
          onClose={() => setIsLibraryOpen(false)}
          onForked={handleScriptCreated}
        />
      </div>
    </SidebarProvider>
  );
};

export default ScriptEditor;
