/** @type {import('tailwindcss').Config} */
// Colours are CSS-variable tokens (src/index.css; spec design-system/EMBER.md, rules design-system/heatronics-mis/MASTER.md):
// the Heatronics "Ember" set shared by every *.heatronics.in portal; light / dark switch without touching components.
//   slate / gray / stone = the neutral scale (n-*), white = the card surface,
//   brand / accent / indigo = the heat ramp (active state, links, focus, the one chart highlight), heat = same ramp,
//   cta / on-cta = the one primary action per screen, chart.* = obsidian series + grey comparison + one heat.
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
  // a regex in utils/sellerCentralFees.ts (`/[-:.TZ]/g`) reads as an arbitrary property; never a class.
  blocklist: ['[-:.TZ]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'DM Sans Variable'", "'DM Sans'", 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ["'DM Sans Variable'", "'DM Sans'", 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ["'JetBrains Mono Variable'", 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        white: v('surface'),
        scrim: 'rgb(12 13 14 / <alpha-value>)',
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
        // GUIDE.md "Colour": no blue, violet, purple, pink or indigo. Info is grey; orange used as a warning is amber.
        // The old names stay mapped so a missed class renders with the right meaning (the design check stops new ones).
        blue: scale('n'), sky: scale('n'), cyan: scale('n'),
        violet: scale('n'), purple: scale('n'), fuchsia: scale('n'),
        orange: scale('amber'),
        nav: { bg: v('nav-bg'), hover: v('nav-hover'), active: v('nav-active'), border: v('nav-border'), fg: v('nav-fg'), muted: v('nav-fg-muted'), strong: v('nav-fg-strong'), accent: v('nav-accent'), brand: v('nav-brand'), hot: v('nav-hot'), onhot: v('nav-on-hot') },
        'mis-green': v('emerald-500'),
        'mis-yellow': v('amber-500'),
        'mis-red': v('red-500'),
        'mis-blue': v('n-500'),
        // Charts (Ember): obsidian series, grey comparison, ONE heat highlight; extra categories = obsidian tints.
        chart: { ink: v('chart-ink'), 2: v('chart-2'), 3: v('chart-3'), 4: v('chart-4'), 5: v('chart-5'), cmp: v('chart-cmp'), heat: v('chart-heat') },
        channel: {
          oem:     v('chart-2'),
          d2c:     v('chart-ink'),
          amazon:  v('chart-heat'),
          offline: v('chart-3'),
          blinkit: v('chart-4'),
        },
      },
      // Muted text (text-slate-400 / gray / stone) gets its own AA token: the n-400 colour stays for borders,
      // icons and fills, but as text it was 2.6:1 (light) / 2.4:1 (dark). Accessibility pass, Nov 2026.
      // Same idea for status text: emerald / amber / orange 500–600 are 2.5–3.8:1 on white, so as TEXT they use the
      // 700 shade (AA in light; the dark scale mirrors, so 700 is the lighter, readable one there too).
      textColor: {
        ...Object.fromEntries(['slate', 'gray', 'stone', 'zinc', 'neutral'].map((n) => [n, { ...scale('n'), 400: v('n-400-text') }])),
        ...Object.fromEntries([['emerald', 'emerald'], ['green', 'emerald'], ['teal', 'emerald'], ['amber', 'amber'], ['yellow', 'amber'], ['orange', 'amber']]
          .map(([n, t]) => [n, { ...scale(t), 500: v(`${t}-700`), 600: v(`${t}-700`) }])),
      },
      // GUIDE.md "Depth": cards are flat (1px line, no shadow); only floating parts get the ONE pop shadow.
      boxShadow: {
        pop: 'var(--shadow-pop)',
        soft: 'none',
        card: 'none',
        'card-lg': 'none',
        sm: 'none',
        md: 'var(--shadow-pop)',
        lg: 'var(--shadow-pop)',
        xl: 'var(--shadow-pop)',
        '2xl': 'var(--shadow-pop)',
        drawer: 'var(--shadow-pop)',
        'drawer-left': 'var(--shadow-pop)',
        overlay: 'var(--shadow-pop)',
        popover: 'var(--shadow-pop)',
      },
      // GUIDE.md "Type": eight sizes only. Hero 44 · Number 28 · Title 24 · Panel title 18 · Section 16 · Text 14 ·
      // Label 13 · Small 12. Tailwind's own names point at the nearest guide size so old classes stay on the scale.
      fontSize: {
        xs: ['12px', '16px'], small: ['12px', '16px'],
        label: ['13px', '18px'],
        sm: ['14px', '20px'], text: ['14px', '20px'],
        base: ['16px', '22px'], section: ['16px', '22px'],
        lg: ['18px', '24px'], xl: ['18px', '24px'], panel: ['18px', '24px'],
        '2xl': ['24px', '30px'], title: ['24px', '30px'],
        '3xl': ['28px', '34px'], '4xl': ['28px', '34px'], number: ['28px', '34px'],
        '5xl': ['44px', '48px'], '6xl': ['44px', '48px'], hero: ['44px', '48px'],
      },
      // GUIDE.md "Depth and layers": the only levels. z-10 / z-20 stay for stacking inside one card.
      zIndex: { sticky: '40', shell: '50', scrim: '80', drawer: '90', modal: '100', pop: '110', toast: '130' },
      backgroundImage: {
        // Kept as names so old classes still render; flat token fills now (no gradients, MASTER.md).
        'brand-gradient': 'linear-gradient(rgb(var(--cta)), rgb(var(--cta)))',
        'brand-soft': 'none',
        surface: 'none',
        'surface-tint': 'none',
        'ink-panel': 'linear-gradient(rgb(var(--n-900)), rgb(var(--n-900)))',
      },
      // Ember shape: buttons / inputs 10px (rounded-lg), cards 14px (rounded-xl), nav rows 6px (rounded-md), pills full.
      // GUIDE.md "Space": the page fills the space up to 1440, then centres.
      maxWidth: { page: '1440px' },
      borderRadius: { lg: '10px', xl: '14px', '2xl': '14px', '3xl': '14px' },
      transitionDuration: { DEFAULT: '150ms' },
      transitionTimingFunction: { settle: 'cubic-bezier(.2,.8,.2,1)' },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': { from: { opacity: '0', transform: 'translateY(6px) scale(.98)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
        'drawer-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'drawer-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'pop-in': { from: { opacity: '0', transform: 'translateY(-4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'sheet-in': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
      },
      animation: {
        // GUIDE.md "Motion": modal / popover 200 to 280 ms, drawer 380 ms, toast 300 ms, curve "settle".
        'fade-in': 'fade-in .2s cubic-bezier(.2,.8,.2,1)',
        'scale-in': 'scale-in .24s cubic-bezier(.2,.8,.2,1)',
        'drawer-in-right': 'drawer-in-right .38s cubic-bezier(.2,.8,.2,1)',
        'drawer-in-left': 'drawer-in-left .38s cubic-bezier(.2,.8,.2,1)',
        'sheet-in': 'sheet-in .38s cubic-bezier(.2,.8,.2,1)',
        'toast-in': 'sheet-in .3s cubic-bezier(.2,.8,.2,1)',
        'pop-in': 'pop-in .2s cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [],
}
