/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'Noto Sans Devanagari', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        obsidian: {
          DEFAULT: '#0B0F17',
          surface: '#111622',
          card: '#141A28',
          hover: '#1A2234',
          border: 'rgba(255, 255, 255, 0.07)',
          bg: '#070A10',
        },
        bull: {
          DEFAULT: '#10B981',
          subtle: 'rgba(16, 185, 129, 0.12)',
        },
        bear: {
          DEFAULT: '#F43F5E',
          subtle: 'rgba(244, 63, 94, 0.12)',
        }
      }
    },
  },
  plugins: [],
}
