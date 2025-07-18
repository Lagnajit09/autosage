import type { Config } from "tailwindcss";
import animatePlugin from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // Core theme colors using your palette
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",

        // Primary brand colors - Deep purples for main actions
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },

        // Custom color palette for your automation app
        workflow: {
          // Deep backgrounds and surfaces
          void: "#000000", // Pure black for deepest backgrounds
          midnight: "#150050", // Dark navy for main backgrounds
          deep: "#3F0071", // Deep purple for elevated surfaces

          // Mid-range colors for components
          royal: "#610094", // Royal purple for primary actions

          // Lighter accent colors
          nebula: "#B373E7", // Light purple for highlights
          aurora: "#D0A8F0", // Pale purple for soft accents
          whisper: "#ECDCF9", // Very light purple for subtle elements
        },

        // Background color variations
        bg: {
          primary: "#150050", // Main app background
          secondary: "#3F0071", // Elevated surfaces
          tertiary: "#610094", // Component backgrounds
          card: "#000000", // Card backgrounds
          panel: "#393939", // Side panels
          modal: "#150050", // Modal backgrounds
          hover: "#B373E7", // Hover states
          active: "#D0A8F0", // Active states
          disabled: "#393939", // Disabled states
          success: "#22c55e", // Success backgrounds
          warning: "#f59e0b", // Warning backgrounds
          error: "#ef4444", // Error backgrounds
        },

        // Text color variations
        text: {
          primary: "#ECDCF9", // Primary text (very light purple)
          secondary: "#D0A8F0", // Secondary text (pale purple)
          tertiary: "#B373E7", // Tertiary text (light purple)
          accent: "#610094", // Accent text (royal purple)
          muted: "#A3A3A3", // Muted text (light gray)
          disabled: "#818181", // Disabled text (medium gray)
          inverse: "#000000", // Inverse text (black on light backgrounds)
          success: "#22c55e", // Success text
          warning: "#f59e0b", // Warning text
          error: "#ef4444", // Error text
          link: "#B373E7", // Link text
          "link-hover": "#D0A8F0", // Link hover text
        },

        // Border color variations
        borders: {
          primary: "#610094", // Primary borders (royal purple)
          secondary: "#3F0071", // Secondary borders (deep purple)
          tertiary: "#B373E7", // Tertiary borders (light purple)
          subtle: "#393939", // Subtle borders (dark gray)
          muted: "#818181", // Muted borders (medium gray)
          focus: "#D0A8F0", // Focus borders (pale purple)
          hover: "#B373E7", // Hover borders (light purple)
          active: "#ECDCF9", // Active borders (very light purple)
          disabled: "#393939", // Disabled borders
          success: "#22c55e", // Success borders
          warning: "#f59e0b", // Warning borders
          error: "#ef4444", // Error borders
          divider: "#393939", // Divider lines
        },

        // Neutral grays for text and borders
        neutral: {
          void: "#000000", // Pure black
          charcoal: "#393939", // Dark gray for text
          slate: "#818181", // Medium gray for secondary text
          silver: "#A3A3A3", // Light gray for disabled states
          ghost: "#E6E6E6", // Very light gray for borders
          smoke: "#F5F5F5", // Off-white for light backgrounds
          pure: "#ffffff", // Pure white
        },

        // Semantic colors for workflow components
        node: {
          trigger: "#610094", // Royal purple for trigger nodes
          action: "#3F0071", // Deep purple for action nodes
          decision: "#B373E7", // Nebula for decision nodes
          success: "#22c55e", // Green for success states
          warning: "#f59e0b", // Amber for warnings
          error: "#ef4444", // Red for errors
        },

        // Connection and flow colors
        connection: {
          active: "#B373E7", // Nebula for active connections
          inactive: "#393939", // Charcoal for inactive connections
          hover: "#D0A8F0", // Aurora for hover states
        },

        // Status indicators
        status: {
          online: "#22c55e", // Green for online/running
          offline: "#6b7280", // Gray for offline/stopped
          pending: "#f59e0b", // Amber for pending
          error: "#ef4444", // Red for errors
        },

        // AI-specific colors
        ai: {
          primary: "#610094", // Royal purple for AI features
          secondary: "#B373E7", // Nebula for AI highlights
          accent: "#D0A8F0", // Aurora for AI accents
          glow: "#ECDCF9", // Whisper for AI glow effects
        },
      },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "fade-in": {
          "0%": {
            opacity: "0",
            transform: "translateY(10px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        "slide-in-right": {
          "0%": {
            transform: "translateX(100%)",
            opacity: "0",
          },
          "100%": {
            transform: "translateX(0)",
            opacity: "1",
          },
        },
        "pulse-glow": {
          "0%, 100%": {
            boxShadow: "0 0 5px rgba(179, 115, 231, 0.5)",
          },
          "50%": {
            boxShadow: "0 0 20px rgba(179, 115, 231, 0.8)",
          },
        },
        "flow-animation": {
          "0%": {
            transform: "translateX(-100%)",
          },
          "100%": {
            transform: "translateX(100%)",
          },
        },
      },

      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "flow-animation": "flow-animation 2s linear infinite",
      },

      // Custom gradients for your workflow app
      backgroundImage: {
        "workflow-gradient":
          "linear-gradient(135deg, #150050 0%, #3F0071 100%)",
        "ai-gradient": "linear-gradient(135deg, #610094 0%, #B373E7 100%)",
        "node-gradient": "linear-gradient(135deg, #3F0071 0%, #610094 100%)",
        "connection-gradient":
          "linear-gradient(90deg, #B373E7 0%, #D0A8F0 100%)",
      },
    },
  },
  plugins: [animatePlugin],
} satisfies Config;
