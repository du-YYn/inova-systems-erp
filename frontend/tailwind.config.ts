import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    // Section component dark mode variants (FunilTab)
    'bg-blue-50/50',   'dark:bg-blue-900/30',   'border-blue-100',   'dark:border-blue-700/50',   'text-blue-700',   'dark:text-blue-300',
    'bg-purple-50/50', 'dark:bg-purple-900/30', 'border-purple-100', 'dark:border-purple-700/50', 'text-purple-700', 'dark:text-purple-300',
    'bg-amber-50/50',  'dark:bg-amber-900/30',  'border-amber-100',  'dark:border-amber-700/50',  'text-amber-700',  'dark:text-amber-300',
    'bg-green-50/50',  'dark:bg-green-900/30',  'border-green-100',  'dark:border-green-700/50',  'text-green-700',  'dark:text-green-300',
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary':          '#FFFFFF',
        'bg-secondary':        '#FAFAFA',
        'text-primary':        '#0A0A0A',
        'text-secondary':      '#444444',
        'accent-gold':         '#A6864A',
        'accent-gold-light':   '#C4A67C',
        'accent-gold-dark':    '#8B6F3D',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        'grid-light': 'linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)',
        'grid-dark':  'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
      },
      boxShadow: {
        'card':        '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.07)',
        'card-hover':  '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
        'card-deep':   '0 20px 60px rgba(0,0,0,0.18)',
        'modal':       '0 30px 70px rgba(0,0,0,0.22)',
        'topbar':      '0 1px 0 rgba(0,0,0,0.06)',
        'sidebar':     '4px 0 32px rgba(0,0,0,0.18)',
        'glow-gold':   '0 0 20px rgba(166,134,74,0.35)',
        'inner-sm':    'inset 0 1px 2px rgba(0,0,0,0.06)',
      },
      animation: {
        'shimmer':    'shimmer 1.6s linear infinite',
        'modal-in':   'modal-in 0.22s ease-out',
        'fade-in':    'fade-in 0.2s ease-out',
        'slide-right':'slide-right 240ms cubic-bezier(0.16,1,0.3,1)',
        'scale-in':   'scale-in 180ms cubic-bezier(0.34,1.56,0.64,1)',
        'count-in':   'count-in 0.5s cubic-bezier(0.16,1,0.3,1)',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        'modal-in': {
          '0%':   { opacity: '0', transform: 'scale(0.96) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-right': {
          '0%':   { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.94) translateY(-4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'count-in': {
          '0%':   { opacity: '0', transform: 'translateY(6px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
