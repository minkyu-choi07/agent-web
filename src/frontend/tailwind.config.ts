import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        hud: {
          bg: 'var(--clr-bg)',
          surface: 'var(--clr-surface)',
          'surface-2': 'var(--clr-surface-2)',
          border: 'var(--clr-border)',
          'border-accent': 'var(--clr-border-accent)',
          text: 'var(--clr-text)',
          'text-dim': 'var(--clr-text-dim)',
          accent: 'var(--clr-accent)',
          'accent-dim': 'var(--clr-accent-dim)',
          warning: 'var(--clr-warning)',
          'warning-dim': 'var(--clr-warning-dim)',
          blue: 'var(--clr-blue)',
          'blue-dim': 'var(--clr-blue-dim)',
          purple: 'var(--clr-purple)',
          'purple-dim': 'var(--clr-purple-dim)',
        },
      },
      fontFamily: {
        display: [
          'var(--font-display)',
          'sans-serif',
        ],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        'glow-accent':
          '0 0 12px rgba(0, 229, 160, 0.25)',
        'glow-accent-sm':
          '0 0 6px rgba(0, 229, 160, 0.15)',
        'glow-warning':
          '0 0 12px rgba(255, 107, 61, 0.25)',
        'glow-blue':
          '0 0 12px rgba(77, 142, 255, 0.25)',
      },
      animation: {
        'pulse-glow':
          'pulseGlow 2s ease-in-out infinite',
        scanline: 'scanline 8s linear infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': {
            opacity: '0',
            transform: 'scale(1)',
          },
          '50%': {
            opacity: '0.4',
            transform: 'scale(1.5)',
          },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
