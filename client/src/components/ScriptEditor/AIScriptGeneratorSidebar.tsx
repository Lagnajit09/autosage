import React from "react";
import AIScriptGenerator from "@/components/ScriptEditor/AIScriptGenerator";
import type { ScriptLanguage } from "@/utils/types";

interface OpenScriptShape {
  id: string;
  name: string;
  language: ScriptLanguage;
}

interface AIScriptGeneratorSidebarProps {
  /** The script currently open in the editor pane, or null if none. */
  openScript: OpenScriptShape | null;
  /** Fired with the new Script.id when the bot calls `create_script`. */
  onScriptCreated: (scriptId: string, scriptName: string) => void;
  /** Fired with the Script.id when the bot calls `update_script`. */
  onScriptUpdated: (scriptId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Right-side sidebar wrapper for the inline Script Generator.
 *
 * Stays mounted across open/close cycles.
 *
 * WHY we hide via CSS instead of `return null`: every unmount tears
 * down `AIScriptGenerator`'s internal state, including the lazily-
 * created autobot thread id. So if a user closed and reopened the
 * panel between prompts, the next prompt would mint a NEW thread →
 * one tiny archived thread per open. Hiding via `display:none` keeps
 * the component alive, the thread persists, and the conversation
 * continues seamlessly. A stream that was in-flight when the user
 * closes the panel also gets to finish (the create_script /
 * update_script callbacks still fire), so the editor receives the
 * result even though the user isn't watching the chat.
 */
export const AIScriptGeneratorSidebar: React.FC<
  AIScriptGeneratorSidebarProps
> = ({ openScript, onScriptCreated, onScriptUpdated, isOpen, onToggle }) => {
  return (
    <div
      className={`w-80 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 h-full flex flex-col transition-all duration-300 ${
        isOpen ? "" : "hidden"
      }`}
      aria-hidden={!isOpen}
    >
      <AIScriptGenerator
        openScript={openScript}
        onScriptCreated={onScriptCreated}
        onScriptUpdated={onScriptUpdated}
        onClose={onToggle}
      />
    </div>
  );
};
