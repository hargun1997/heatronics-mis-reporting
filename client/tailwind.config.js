/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Heatronics primary face (website, everything) and display face.
        sans: ['Archivo', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['"Archivo Expanded"', 'Archivo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        'mis-green': '#10B981',
        'mis-yellow': '#F59E0B',
        'mis-red': '#EF4444',
        'mis-blue': '#3B82F6',
        // Heatronics brand orange — anchored on the logo's #FE4705.
        brand: {
          50:  '#fff3ed',
          100: '#ffe3d4',
          200: '#ffc4a9',
          300: '#ff9d72',
          400: '#ff6c38',
          500: '#fe4705',
          600: '#e13a00',
          700: '#ba2f06',
          800: '#93270c',
          900: '#79230d',
        },
      },
      boxShadow: {
        'soft': '0 1px 3px 0 rgba(15, 23, 42, 0.06), 0 1px 2px 0 rgba(15, 23, 42, 0.04)',
        'card': '0 2px 8px -2px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
}
