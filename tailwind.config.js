/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'mis-green': '#10B981',
        'mis-yellow': '#F59E0B',
        'mis-red': '#EF4444',
        'mis-blue': '#3B82F6',
      }
    },
  },
  plugins: [],
}
