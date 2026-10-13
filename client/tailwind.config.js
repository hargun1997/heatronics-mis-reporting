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
        // Categorical data palette — one hue per channel, distinct in hue AND
        // lightness, deliberately kept off brand orange (reserved for actions).
        channel: {
          oem:     '#2563EB',
          d2c:     '#0E7490',
          amazon:  '#D97706',
          offline: '#7C3AED',
          blinkit: '#475569',
        },
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
        'card': '0 1px 2px rgba(15,23,42,0.04), 0 6px 16px -8px rgba(15, 23, 42, 0.12)',
        'card-lg': '0 1px 2px rgba(15,23,42,0.05), 0 14px 34px -14px rgba(15, 23, 42, 0.22)',
        'drawer': '-24px 0 60px -24px rgba(15, 23, 42, 0.35)',
        'drawer-left': '24px 0 60px -24px rgba(15, 23, 42, 0.35)',
        'overlay': '0 30px 70px -20px rgba(15, 23, 42, 0.5)',
        'popover': '0 20px 50px -16px rgba(15, 23, 42, 0.4)',
      },
      backgroundImage: {
        // Signature Heatronics gradient — used on primary actions, the logo
        // tile and accents. Warm, directional, built off the logo orange.
        'brand-gradient': 'linear-gradient(135deg, #ff6c38 0%, #fe4705 55%, #e13a00 100%)',
        'brand-soft': 'linear-gradient(135deg, #fff5ef 0%, #ffffff 68%)',
        // Raised card surface — a barely-there top-down sheen so white cards
        // read as objects, not flat paint.
        'surface': 'linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)',
        'surface-tint': 'linear-gradient(180deg, #f7f9fc 0%, #ffffff 70%)',
        // Dark contrast panel for hero/stat bands that break up the white.
        'ink-panel': 'linear-gradient(135deg, #243244 0%, #0f172a 100%)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': { from: { opacity: '0', transform: 'translateY(6px) scale(.98)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
        'drawer-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'drawer-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'pop-in': { from: { opacity: '0', transform: 'translateY(-4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out',
        'scale-in': 'scale-in .2s cubic-bezier(.4,0,.2,1)',
        'drawer-in-right': 'drawer-in-right .28s cubic-bezier(.4,0,.2,1)',
        'drawer-in-left': 'drawer-in-left .28s cubic-bezier(.4,0,.2,1)',
        'pop-in': 'pop-in .14s ease-out',
      },
    },
  },
  plugins: [],
}
