# Heatronics MIS — Design System (MASTER, v2 — Ember)

Source of truth for every page in `mis.heatronics.in`. Since 11 Nov 2026 the MIS follows **Heatronics "Ember"**, the
founder-approved system for every *.heatronics.in portal: spec `design-system/EMBER.md` (copied from the shared Ember
spec; it wins on any conflict), target mockup `htx-mis.png`. Ember replaces the navy / indigo look this file used to
share with Ops MASTER v7. Page overrides live in `design-system/heatronics-mis/pages/<page>.md`; if none exists, these
rules apply. When EMBER.md changes a shared rule, change it here too.

## Pattern
- **Product type:** internal finance / MIS console (desk; the founder and the accounts team, sometimes on a phone).
  Data-dense, zero marketing chrome.
- **Style:** Ember: an obsidian sidebar (`#0C0D0E`), a calm neutral work area (canvas `#F4F4F3`, white cards with a
  1px `#E6E6E4` line and no / very faint shadow), DM Sans, tabular figures, and ONE accent: heat orange (`#F36B21`)
  for the active state, focus, selected tab / segment and the one highlighted chart series. No indigo anywhere.
- **Anti-patterns (hard no):** emoji as icons; gradients as decoration (old `bg-brand-gradient`, `brand-soft`,
  `surface` gradients are now flat token fills); raw hex in components (charts use `rgb(var(--token))`); body text
  under 12px; icon-only buttons without `aria-label`; removing focus rings; colour as the only status signal; banners
  stacked above a page's content.

## Colour: tokens, not hex
All colour is CSS variables in `client/src/index.css` (Ember values, EMBER.md), exposed through
`client/tailwind.config.js`. Components use Tailwind names; the variables decide the value per theme.

| Tailwind name | Token | Use |
|---|---|---|
| `slate-*` / `gray-*` / `stone-*` | `--n-*` | Ember neutrals: `50` canvas `#F4F4F3`, `100` sunk `#F0F0EF`, `200` line `#E6E6E4`, `300` strong / input line `#D6D6D3`, `500` labels `#6B6D70` (AA), `600` body `#4A4C4F`, `900` ink `#141516` |
| `white` / `surface` | `--surface` | cards, tables, inputs (`#FFFFFF`; `#161719` in dark) |
| `brand-*` / `accent-*` / `indigo-*` | `--accent-*` = heat ramp | **active state**: selected tab / segment, links, focus ring, selected rows. `500` = heat `#F36B21` (bars, rings, icons), `600` = heat text `#C2410C` (links, fills with white text, AA), `50` = heat soft `#FFF1E8`. Dark: `500` `#F7843F`, `600` `#FB923C` |
| `heat-*` | `--heat-*` | the same heat ramp (brand wordmark, heat pills) |
| `cta` / `cta-hover` / `on-cta` | `--cta` … | **the one primary action per screen**: `bg-cta text-on-cta hover:bg-cta-hover` (old `.btn-brand` = the same). Light `#C2410C` / `#9A3412` / white; dark `#F36B21` with text `#1A0F07`. Brand `#F36B21` never fills a button with white text |
| `emerald` (`green`, `teal`) · `amber` (`yellow`) · `red` (`rose`, `pink`) | mirrored scales | status: ok `#15803D` on `#E8F6ED` · warn `#B45309` on `#FDF3E2` · bad `#B91C1C` on `#FDECEC` (text = the 700 shade, tint = 50). Dark: `#4ADE80` / `#0F2A1A` · `#FBBF24` / `#2E2108` · `#F87171` / `#2E1111` |
| `blue` (`sky`, `cyan`) · `violet` (`purple`) | mirrored scales | neutral info chips only where a page already has them; never as an accent |
| `chart-*` (`ink`, `2`–`5`, `cmp`, `heat`) | `--chart-*` | charts: obsidian series `#141516`, obsidian tints for extra categories, comparison grey `#B5B6B8`, ONE heat `#F36B21` highlight. JS: `CHART` in `components/mis-deck/format.ts` |
| `nav-*` | `--nav-*` | sidebar only: obsidian in both themes (`#0C0D0E`, dark `#070808`), hover `#17181A`, active `#222326`, text `#A9ABAD` / `#F4F4F4`, group labels `#7C7E81`, accent heat |
| `scrim` | fixed | modal / drawer backdrop (`bg-scrim/50`) — never `bg-slate-900/x`, which flips light in dark mode |

- **Theme:** Light by default (founder, 2 Nov 2026: not dark-only). The sidebar theme button cycles Light → Dark → System
  (`localStorage mis.theme`, applied before React renders in `main.tsx`). Dark scales mirror (50 ↔ 950). The sidebar is obsidian
  in both themes.
- **Text shades are AA by construction** (accessibility pass, 9 Nov 2026): as TEXT, `text-slate-400` (gray / stone)
  uses `--n-400-text` (light #6B6D70, dark #9C9EA1) and `text-emerald|green|teal|amber|yellow|orange-500/600` use the
  700 shade (`tailwind.config.js textColor`); borders, fills and icons keep the plain scale. White text sits on the 600
  shade (`bg-brand-600`, `bg-red-600`), never 500. Wide tables scroll inside a focusable box
  (`tabIndex={0} role="region" aria-label`, `TableBox` in `components/liveMis/shared.tsx`), never the page.
  Text under 12px only from `sm:` up (`text-xs sm:text-[11px]`): phones get 12px minimum.
  A caption over a single select / input = `components/ui/LabeledField` (real `<label>`).
- Channel colours (`CHANNEL_COLORS`, `channel-*`) follow Ember: D2C obsidian, Amazon the one heat series, other channels
  obsidian tints, unknown = comparison grey. No rainbow palettes.
- Status always pairs colour with a label, icon or ▲/▼.

## Typography
- **DM Sans Variable** (brand font, self-hosted `@fontsource-variable/dm-sans`, no Google Fonts call);
  **JetBrains Mono Variable** for codes (ledger codes, GSTIN, HSN, ASIN, SKU, voucher numbers). `font-display` is DM Sans.
- Tabular numerals everywhere (`body`).
- Scale (EMBER.md): page title 22/28 650 −0.015em · section title 16/24 semibold · body 14/20 · table 13/20 ·
  label 11/16 semibold uppercase · KPI figure 26 semibold.

## Shape, elevation, density
- Radius (Ember): inputs & buttons 10px (`rounded-lg`), cards 14px (`rounded-xl`), nav rows 6px (`rounded-md`), pills full.
  Cards = 1px line + `shadow-card` (very faint); popovers / drawers get a real shadow. No gradients, glows or beige.
- Spacing 4 · 8 · 12 · 16 · 24 · 32. Tables: sticky header, hover tint, right-aligned tabular numbers.
- The sidebar's Compact switch (`html[data-density]`, `hooks/useDensity`) tightens rows and folds secondary sections.

## Layout & navigation
- **One source of truth:** `client/src/nav/config.ts` (sections → pages, palette words, old addresses). Never hard-code a
  menu in a component. `server/test/nav.test.ts` fails when a page route is missing from the menu or a menu page has no
  route.
- **Sidebar** (`components/shell/AppNav.tsx`): obsidian, 248px, text wordmark "Heatronics **MIS**" (MIS in heat, no logo mark), collapsible to a 64px icon rail
  (remembered). **Two levels only — section → page, kept small (≤ 13 pages, test)**: Reporting (Live MIS, Month-end close,
  AI insights) · Accounts (Tally health, Accounts Handbook) · Planning (5-year plan, Round planner) · Tools (Send report, Book an
  invoice, Amazon price floors, Amazon → Tranzact — every tool lives here), and Admin at the bottom (Data sources, Data rulebook)
  with the Claude status pill, Compact and Theme. Everything else (Data issues, All tools, Tasks, People & reminders, old pages)
  is in ⌘K under "More". "Search or jump to… ⌘K"
  at the top, **Pinned** pages under it (pin from any page title). Active page: `#222326` fill + 3px heat bar on the rail's left edge +
  heat icon + white 600 text. Group labels 11px uppercase 600, tracking .06em. Tasks count = heat pill when urgent.
  Keyboard: ↑ ↓ Home End.
- **Phones / tablets (< 1024 px):** light top bar (Menu, brand, Claude, Search) + the same list in a modal drawer.
  `--app-top` (3.5rem / 0 on desktop) is the height of that bar for sticky page headers.
- **Home** = Live MIS (`HOME` in nav/config). Old pages (Month close) are out of the sidebar, reachable from
  ⌘K under "More" until they are deleted.
- **Page template** (`components/ui/PageHeader`): breadcrumbs Section › Page (from the menu) · icon tile (accent-50) ·
  title + Pin · optional `status` chip · one-line purpose (≤ 80ch) · actions (one primary). Then the content in
  `max-w-7xl` (wide planners may break out).
- **⌘K palette** (`components/shell/CommandPalette.tsx`): ⌘K / Ctrl K anywhere — pages, pinned, recent, commands
  (pin this page, theme, collapse sidebar).

## Components (`components/ui/*`)
- Buttons: primary `bg-cta text-on-cta hover:bg-cta-hover` (one per screen) · secondary surface + `border-slate-200` ·
  ghost · danger (`red`). Selected chips / segments use accent, not cta.
- `KpiTile`: label caps · figure · delta (▲ / ▼ with the metric's good direction) · sparkline in accent. No decorative
  colour bar (only warning / critical tones get one).
- `SegmentedControl`: toggle buttons (`aria-pressed`, `role="group"`); selected segment = white thumb on the sunk track, ink text;
  44px tall on phones and wraps instead of running off the screen.
- `Section` (Live MIS folds): the toggle button sits in an `<h2>` so screen readers can jump between sections.
- Overlays (`components/ui/overlays.tsx` Drawer / Modal / Popover, shell `useOverlay`): Esc closes, focus trapped and
  returned, scroll locked, z-index above the sidebar (`z-[100]`), backdrop `bg-scrim`.

## Interaction & accessibility
- Touch targets ≥ 44×44 on phones (sidebar rows 38px on desktop only).
- Visible focus ring everywhere: `focus-visible:ring-2 ring-accent-500` = heat (`ring-nav-accent` in the sidebar).
- Skip link → focusable `<main id="main">`; document title = "<Page> · Heatronics MIS".
- Motion 150ms ease-out; `prefers-reduced-motion` disables it.
- AA contrast in both themes. Screenshot light / dark at 1440 and 390 before shipping nav or token changes.
