/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          900: '#05070c',
          800: '#080c14',
          700: '#0b1018',
          600: '#0f1520',
        },
        mint: '#4ef2b8',
        ice: '#38e1ff',
        iris: '#9d8bff',
      },
    },
  },
  plugins: [],
}
