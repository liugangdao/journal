/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--c-bg)',
        card: 'var(--c-card)',
        border: 'var(--c-border)',
        accent: 'var(--c-accent)',
        green: 'var(--c-green)',
        red: 'var(--c-red)',
        gold: 'var(--c-gold)',
        purple: 'var(--c-purple)',
        text: 'var(--c-text)',
        muted: 'var(--c-muted)',
        input: 'var(--c-input)',
        hover: 'var(--c-hover)',
        'header-bg': 'var(--c-header-bg)',
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    }
  },
  plugins: []
}
