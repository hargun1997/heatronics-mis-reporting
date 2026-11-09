/** @type {import('tailwindcss').Config} */
// Colours are CSS-variable tokens (src/index.css, design-system/heatronics-mis/MASTER.md), the same set as
// Heatronics Ops: light / dark switch without touching components.
//   slate / gray / stone = the neutral scale (n-*), white = the card surface,
//   brand = accent (indigo: active state, links, focus, data), heat = the brand mark,
//   cta / on-cta = the one primary action per screen.
// Old colour names (indigo, purple, green, yellow, rose, pink, sky, cyan, teal) map onto the token scales so
// they follow the theme too.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const scale = (p) => Object.fromEntries(SHADES.map((s) => [s, v(`${p}-${s}`)]));
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Inter Variable'", 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ["'Inter Variable'", 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ["'JetBrains Mono Variable'", 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        white: v('surface'),
        scrim: 'rgb(2 6 23 / <alpha-value>)',
        surface: v('surface'),
        slate: scale('n'), gray: scale('n'), stone: scale('n'), zinc: scale('n'), neutral: scale('n'),
        heat: scale('heat'),
        cta: { DEFAULT: v('cta'), hover: v('cta-hover') },
        'on-cta': v('on-cta'),
        accent: { ...scale('accent'), DEFAULT: v('accent-600') },
        brand: scale('accent'), indigo: scale('accent'),
        red: scale('red'), rose: scale('red'), pink: scale('red'),
        amber: scale('amber'), yellow: scale('amber'),
        emerald: scale('emerald'), green: scale('emerald'), teal: scale('emerald'),
        blue: scale('blue'), sky: scale('blue'), cyan: scale('blue'),
        violet: scale('violet'), purple: scale('violet'), fuchsia: scale('violet'),
        orange: scale('orange'),
        nav: { bg: v('nav-bg'), hover: v('nav-hover'), active: v('nav-active'), border: v('nav-border'), fg: v('nav-fg'), muted: v('nav-fg-muted'), strong: v('nav-fg-strong'), accent: v('nav-accent') },
        'mis-green': v('emerald-500'),
        'mis-yellow': v('amber-500'),
        'mis-red': v('red-500'),
        'mis-blue': v('blue-500'),
        // Categorical data palette — one hue per channel (charts, chips).
        channel: {
          oem:     '#2563EB',
          d2c:     '#0E7490',
          amazon:  '#D97706',
          offline: '#7C3AED',
          blinkit: '#64748B',
        },
      },
      // Muted text (text-slate-400 / gray / stone) gets its own AA token: the n-400 colour stays for borders,
      // icons and fills, but as text it was 2.6:1 (light) / 2.4:1 (dark). Accessibility pass, Nov 2026.
      // Same idea for status text: emerald / amber / orange 500–600 are 2.5–3.8:1 on white, so as TEXT they use the
      // 700 shade (AA in light; the dark scale mirrors, so 700 is the lighter, readable one there too).
      textColor: {
        ...Object.fromEntries(['slate', 'gray', 'stone', 'zinc', 'neutral'].map((n) => [n, { ...scale('n'), 400: v('n-400-text') }])),
        ...Object.fromEntries([['emerald', 'emerald'], ['green', 'emerald'], ['teal', 'emerald'], ['amber', 'amber'], ['yellow', 'amber'], ['orange', 'orange']]
          .map(([n, t]) => [n, { ...scale(t), 500: v(`${t}-700`), 600: v(`${t}-700`) }])),
      },
      boxShadow: {
        soft: 'var(--shadow-card)',
        card: 'var(--shadow-card)',
        'card-lg': '0 1px 2px rgb(15 23 42 / 0.05), 0 8px 24px -12px rgb(15 23 42 / 0.18)',
        drawer: '-24px 0 60px -24px rgb(2 6 23 / 0.35)',
        'drawer-left': '24px 0 60px -24px rgb(2 6 23 / 0.35)',
        overlay: '0 30px 70px -20px rgb(2 6 23 / 0.5)',
        popover: '0 20px 50px -16px rgb(2 6 23 / 0.4)',
      },
      backgroundImage: {
        // Kept as names so old classes still render; flat token fills now (no gradients, MASTER.md).
        'brand-gradient': 'linear-gradient(rgb(var(--cta)), rgb(var(--cta)))',
        'brand-soft': 'none',
        surface: 'none',
        'surface-tint': 'none',
        'ink-panel': 'linear-gradient(rgb(var(--n-900)), rgb(var(--n-900)))',
      },
      transitionDuration: { DEFAULT: '150ms' },
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
