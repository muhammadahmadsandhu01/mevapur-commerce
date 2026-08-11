/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef1f8',
          100: '#d5dce9',
          200: '#aab8d3',
          300: '#8094bd',
          400: '#566fa7',
          500: '#2c4b91',
          600: '#1f376f',
          700: '#15274f',
          800: '#0B132B',
          900: '#060a16',
        },
        secondary: {
          500: '#FF8A00',
          600: '#e67d00',
          700: '#cc7000',
        },
        brand: {
          primary: '#0B132B',
          accent: '#FF8A00',
          surface: '#F7F7F5',
          muted: '#6B7280',
        },
        sidebar: {
          light: '#ffffff',
          dark: '#0f172a',
          active: '#0B132B'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config;
