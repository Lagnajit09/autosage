import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { Copy, Check } from "lucide-react";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
const oneDarkTheme = oneDark as Record<string, React.CSSProperties>;

export const CodeBlock = ({
  code,
  language,
}: {
  code: string;
  language: string;
}) => {
  const [copied, setCopied] = useState(false);

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
    <div className="relative w-full my-4 rounded-lg overflow-hidden thin-scrollbar group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 p-2 rounded-md bg-gray-800/80 hover:bg-gray-700/90 transition-all duration-200 opacity-0 group-hover:opacity-100 border border-gray-700/50 hover:border-gray-600"
        aria-label="Copy code"
      >
        {copied ? (
          <Check className="w-4 h-4 text-green-400" />
        ) : (
          <Copy className="w-4 h-4 text-gray-300" />
        )}
      </button>
      <SyntaxHighlighter
        style={oneDarkTheme}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: "0.5rem",
          backgroundColor: "#1e293b",
          lineHeight: "1.1",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};
