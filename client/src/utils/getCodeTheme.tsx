import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "@/contexts/theme/theme-context";

const oneDarkTheme = oneDark as Record<string, React.CSSProperties>;
const oneLightTheme = oneLight as Record<string, React.CSSProperties>;

// Override oneLight theme for proper light mode colors
export const getLightTheme = () => {
  const lightTheme = { ...oneLightTheme };

  // Override all possible code and pre selectors
  const codeSelectors = [
    'code[class*="language-"]',
    "code",
    'pre[class*="language-"]',
    "pre",
    "pre code",
    'pre code[class*="language-"]',
  ];

  codeSelectors.forEach((selector) => {
    if (lightTheme[selector]) {
      lightTheme[selector] = {
        ...lightTheme[selector],
        background: "transparent",
        color: "#030712", // gray-950
      };
    } else {
      lightTheme[selector] = {
        background: "transparent",
        color: "#030712", // gray-950
      };
    }
  });

  // Override all token colors to ensure dark text in light mode
  const tokenSelectors = [
    ".token",
    ".token.punctuation",
    ".token.keyword",
    ".token.operator",
    ".token.string",
    ".token.number",
    ".token.comment",
    ".token.function",
    ".token.variable",
    ".token.property",
    ".token.class-name",
    ".token.attr-name",
    ".token.tag",
    ".token.boolean",
    ".token.constant",
    ".token.entity",
    ".token.url",
    ".token.selector",
    ".token.attr-value",
    ".token.atrule",
  ];

  tokenSelectors.forEach((selector) => {
    const existing = lightTheme[selector] || {};
    // Only override if the color is too light (white/light colors)
    const currentColor = existing.color;
    if (
      !currentColor ||
      currentColor === "#fff" ||
      currentColor === "#ffffff" ||
      currentColor.includes("255, 255, 255")
    ) {
      lightTheme[selector] = {
        ...existing,
        color: selector.includes("comment") ? "#6b7280" : "#030712", // gray-500 for comments, gray-950 for others
      };
    }
  });

  return lightTheme;
};

// Override oneDark theme for proper dark mode colors
export const getDarkTheme = () => {
  const darkTheme = { ...oneDarkTheme };

  // Override all possible code and pre selectors
  const codeSelectors = [
    'code[class*="language-"]',
    "code",
    'pre[class*="language-"]',
    "pre",
    "pre code",
    'pre code[class*="language-"]',
  ];

  codeSelectors.forEach((selector) => {
    if (darkTheme[selector]) {
      darkTheme[selector] = {
        ...darkTheme[selector],
        background: "transparent",
        color: "#e2e8f0", // slate-200
      };
    } else {
      darkTheme[selector] = {
        background: "transparent",
        color: "#e2e8f0", // slate-200
      };
    }
  });

  return darkTheme;
};
