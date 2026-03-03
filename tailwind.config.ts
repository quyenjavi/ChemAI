import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2C7BE5',
          dark: '#1B4F9C'
        }
      }
    },
  },
  plugins: [],
} satisfies Config
