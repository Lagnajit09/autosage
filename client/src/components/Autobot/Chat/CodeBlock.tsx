import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { Copy, Check } from "lucide-react";
import { useTheme } from "@/contexts/theme/theme-context";
import { getDarkTheme, getLightTheme } from "@/utils/getCodeTheme";

export const CodeBlock = ({
  code,
  language,
}: {
  code: string;
  language: string;
}) => {
  const [copied, setCopied] = useState(false);
  const { isDark } = useTheme();
  const theme = isDark ? getDarkTheme() : getLightTheme();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  const surfaceBg = isDark ? "#171923" : "#f3f4f6";
  const surfaceText = isDark ? "#e2e8f0" : "#1f2937";

  return (
    <div
      className="relative w-full my-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden thin-scrollbar"
      style={{ backgroundColor: surfaceBg }}
    >
      {/* Header strip: language label (left) + copy button (right). Stays
       * compact and matches the body bg so it reads as one surface. */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[11px] font-mono uppercase tracking-wide text-gray-500 dark:text-gray-400 select-none">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-600 dark:text-emerald-400">
                Copied
              </span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <SyntaxHighlighter
        style={theme}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: "0.75rem 1rem",
          background: "transparent",
          backgroundColor: surfaceBg,
          color: surfaceText,
          fontSize: "0.85rem",
          lineHeight: "1.5",
          // The Prism theme injects its own background on <pre>. Override
          // so our wrapper's color wins consistently.
          border: "none",
          borderRadius: 0,
        }}
        codeTagProps={{
          style: {
            background: "transparent",
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
          },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};
