import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { Copy, Check } from "lucide-react";
import { useTheme } from "@/provider/theme-provider";
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
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  return (
    <div
      className={`relative w-full my-4 rounded-lg overflow-hidden thin-scrollbar group border ${
        isDark
          ? "border-gray-700/50 bg-[#1e293b]"
          : "border-gray-200 bg-[#f8fafc]"
      }`}
    >
      <button
        onClick={handleCopy}
        className={`absolute top-2 right-2 z-10 p-2 rounded-md transition-all duration-200 opacity-0 group-hover:opacity-100 border ${
          isDark
            ? "bg-gray-800/80 hover:bg-gray-700/90 border-gray-700/50 hover:border-gray-600"
            : "bg-gray-100/90 hover:bg-gray-200 border-gray-300/50 hover:border-gray-400"
        }`}
        aria-label="Copy code"
      >
        {copied ? (
          <Check
            className={
              isDark ? "w-4 h-4 text-green-400" : "w-4 h-4 text-green-600"
            }
          />
        ) : (
          <Copy
            className={
              isDark
                ? "w-4 h-4 text-gray-300"
                : "w-4 h-4 text-gray-700 bg-[#ececec]"
            }
          />
        )}
      </button>
      <SyntaxHighlighter
        style={theme}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: "0.5rem",
          backgroundColor: isDark ? "#1e293b" : "#ececec",
          color: isDark ? "#e2e8f0" : "#030712",
          lineHeight: "1.1",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};
