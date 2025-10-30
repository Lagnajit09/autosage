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
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			workflow: {
  				void: '#000000',
  				midnight: '#150050',
  				deep: '#3F0071',
  				royal: '#610094',
  				nebula: '#B373E7',
  				aurora: '#D0A8F0',
  				whisper: '#ECDCF9'
  			},
  			bg: {
  				primary: '#150050',
  				secondary: '#3F0071',
  				tertiary: '#610094',
  				card: '#000000',
  				panel: '#393939',
  				modal: '#150050',
  				hover: '#B373E7',
  				active: '#D0A8F0',
  				disabled: '#393939',
  				success: '#22c55e',
  				warning: '#f59e0b',
  				error: '#ef4444'
  			},
  			text: {
  				primary: '#ECDCF9',
  				secondary: '#D0A8F0',
  				tertiary: '#B373E7',
  				accent: '#610094',
  				muted: '#A3A3A3',
  				disabled: '#818181',
  				inverse: '#000000',
  				success: '#22c55e',
  				warning: '#f59e0b',
  				error: '#ef4444',
  				link: '#B373E7',
  				'link-hover': '#D0A8F0'
  			},
  			borders: {
  				primary: '#610094',
  				secondary: '#3F0071',
  				tertiary: '#B373E7',
  				subtle: '#393939',
  				muted: '#818181',
  				focus: '#D0A8F0',
  				hover: '#B373E7',
  				active: '#ECDCF9',
  				disabled: '#393939',
  				success: '#22c55e',
  				warning: '#f59e0b',
  				error: '#ef4444',
  				divider: '#393939'
  			},
  			neutral: {
  				void: '#000000',
  				charcoal: '#393939',
  				slate: '#818181',
  				silver: '#A3A3A3',
  				ghost: '#E6E6E6',
  				smoke: '#F5F5F5',
  				pure: '#ffffff'
  			},
  			node: {
  				trigger: '#2C6935',
  				trigger_border: '#008314',
  				action: '#0F1F70',
  				action_border: '#25399A',
  				decision: '#998715',
  				decision_border: '#CDB200',
  				success: '#22c55e',
  				warning: '#f59e0b',
  				error: '#ef4444'
  			},
  			connection: {
  				active: '#B373E7',
  				inactive: '#393939',
  				hover: '#D0A8F0'
  			},
  			status: {
  				online: '#22c55e',
  				offline: '#6b7280',
  				pending: '#f59e0b',
  				error: '#ef4444'
  			},
  			ai: {
  				primary: '#610094',
  				secondary: '#B373E7',
  				accent: '#D0A8F0',
  				glow: '#ECDCF9'
  			},
  			light: {
  				primary: '#F9FAFB',
  				secondary: '#FFFFFF',
  				tertiary: '#F3F4F6',
  				sidebar: '#F1F5F9',
  				active: '#E0E7FF',
  				disabled: '#E5E7EB'
  			},
  			'text-light': {
  				primary: '#111827',
  				secondary: '#4B5563',
  				muted: '#9CA3AF',
  				inverse: '#FFFFFF',
  				accent: '#7C3AED',
  				'accent-blue': '#2563EB',
  				disabled: '#9CA3AF'
  			},
  			'border-light': {
  				default: '#E5E7EB',
  				strong: '#D1D5DB',
  				focus: '#3B82F6'
  			},
  			'node-light': {
  				trigger: '#DFF6E1',
  				'trigger-border': '#34C759',
  				'trigger-text': '#14532D',
  				action: '#E5EBFA',
  				'action-border': '#3B82F6',
  				'action-text': '#1E3A8A',
  				decision: '#FFF8E1',
  				'decision-border': '#FACC15',
  				'decision-text': '#78350F'
  			},
  			'semantic-light': {
  				'success-bg': '#ECFDF5',
  				'success-border': '#10B981',
  				'success-text': '#065F46',
  				'warning-bg': '#FFFBEB',
  				'warning-border': '#F59E0B',
  				'warning-text': '#78350F',
  				'error-bg': '#FEF2F2',
  				'error-border': '#EF4444',
  				'error-text': '#991B1B'
  			},
  			'button-light': {
  				'primary-bg': '#4F46E5',
  				'primary-hover': '#4338CA',
  				'primary-active': '#3730A3',
  				'primary-text': '#FFFFFF',
  				'secondary-bg': '#E0E7FF',
  				'secondary-hover': '#C7D2FE',
  				'secondary-border': '#4F46E5',
  				'secondary-text': '#1E3A8A',
  				'tertiary-hover': '#F3F4F6',
  				'tertiary-text': '#374151',
  				'disabled-bg': '#E5E7EB',
  				'disabled-text': '#9CA3AF'
  			},
  			'accent-light': {
  				primary: '#8B5CF6',
  				secondary: '#6366F1',
  				tertiary: '#7C3AED',
  				hover: '#C4B5FD',
  				active: '#DDD6FE'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'fade-in': {
  				'0%': {
  					opacity: '0',
  					transform: 'translateY(10px)'
  				},
  				'100%': {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			'slide-in-right': {
  				'0%': {
  					transform: 'translateX(100%)',
  					opacity: '0'
  				},
  				'100%': {
  					transform: 'translateX(0)',
  					opacity: '1'
  				}
  			},
  			'pulse-glow': {
  				'0%, 100%': {
  					boxShadow: '0 0 5px rgba(179, 115, 231, 0.5)'
  				},
  				'50%': {
  					boxShadow: '0 0 20px rgba(179, 115, 231, 0.8)'
  				}
  			},
  			'flow-animation': {
  				'0%': {
  					transform: 'translateX(-100%)'
  				},
  				'100%': {
  					transform: 'translateX(100%)'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'fade-in': 'fade-in 0.3s ease-out',
  			'slide-in-right': 'slide-in-right 0.3s ease-out',
  			'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
  			'flow-animation': 'flow-animation 2s linear infinite'
  		},
  		backgroundImage: {
  			'workflow-gradient': 'linear-gradient(135deg, #150050 0%, #3F0071 100%)',
  			'ai-gradient': 'linear-gradient(135deg, #610094 0%, #B373E7 100%)',
  			'node-gradient': 'linear-gradient(135deg, #3F0071 0%, #610094 100%)',
  			'connection-gradient': 'linear-gradient(90deg, #B373E7 0%, #D0A8F0 100%)'
  		}
  	}
  },
  plugins: [animatePlugin],
} satisfies Config;
