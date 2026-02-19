import LeftNav from "@/components/LeftNav";
import { useTheme } from "@/provider/theme-provider";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { FileExplorerSidebar } from "@/components/ScriptEditor/FileExplorerSidebar";
import { AIScriptGeneratorSidebar } from "@/components/ScriptEditor/AIScriptGeneratorSidebar";
import { DeleteConfirmationModal } from "@/components/DeleteConfirmationModal";
import { useNavigate } from "react-router-dom";

import { useScriptEditor } from "../components/ScriptEditor/useScriptEditor";
import { EditorHeader } from "../components/ScriptEditor/EditorHeader";
import { EditorTabs } from "../components/ScriptEditor/EditorTabs";
import { EditorPane } from "../components/ScriptEditor/EditorPane";
import { useScriptExecution } from "../components/ScriptEditor/useScriptExecution";
import { ScriptExecutionDrawer } from "../components/ScriptEditor/ScriptExecutionDrawer";
import { useState } from "react";

const ScriptEditor = () => {
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
    handleRenameSubmit,
    handleDeleteScriptClick,
    confirmDeleteScript,
    handleEditorChange,
    handleGeneratedScript,
    duplicateFile,
    downloadFile,
    configureMonacoEditor,
    getFileIcon,
  } = useScriptEditor();

  const [isExecutionOpen, setIsExecutionOpen] = useState(false);

  const {
    servers,
    credentials,
    selectedServerId,
    setSelectedServerId,
    selectedCredentialId,
    setSelectedCredentialId,
    executeScript,
    isExecuting,
    logs,
  } = useScriptExecution();

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
                onExecute={() => currentFile && executeScript(currentFile.id)}
                isExecuting={isExecuting}
                logs={logs}
              />
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

export default ScriptEditor;
