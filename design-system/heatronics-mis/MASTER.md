# Heatronics MIS — Design System (MASTER, v1 — aligned with Ops UX v2)

Source of truth for every page in `mis.heatronics.in`. It is **the same system as Heatronics Ops**
(`heatronics-ops/design-system/heatronics-ops/MASTER.md`, built with the ui-ux-pro-max skill): same tokens, type,
sidebar, palette and page template, so moving between the two tools feels like one product. Page overrides live in
`design-system/heatronics-mis/pages/<page>.md`; if none exists, these rules apply. When Ops' MASTER changes a shared
rule, change it here too.

## Pattern
- **Product type:** internal finance / MIS console (desk; the founder and the accounts team, sometimes on a phone).
  Data-dense, zero marketing chrome.
- **Style:** modern SaaS analytics console: a dark navy sidebar, cool slate content area, white cards with slate
  borders and a barely-there shadow, crisp type, tabular figures, one cool accent (indigo) for data and active state,
  heat-orange only for the brand mark and the one primary action.
- **Anti-patterns (hard no):** emoji as icons; gradients as decoration (old `bg-brand-gradient`, `brand-soft`,
  `surface` gradients are now flat token fills); raw hex in components (charts use `rgb(var(--token))`); body text
  under 12px; icon-only buttons without `aria-label`; removing focus rings; colour as the only status signal; banners
  stacked above a page's content.

## Colour: tokens, not hex
All colour is CSS variables in `client/src/index.css` (copied from Ops' `app/globals.css`), exposed through
`client/tailwind.config.js`. Components use Tailwind names; the variables decide the value per theme.

| Tailwind name | Token | Use |
|---|---|---|
| `slate-*` / `gray-*` / `stone-*` | `--n-*` | the neutral scale: `50` page bg, `100` sub-surfaces, `200/300` borders, `500` labels (AA), `600/700` body, `900` headings |
| `white` / `surface` | `--surface` | cards, tables, inputs (navy `#111A2B` in dark) |
| `brand-*` / `accent-*` / `indigo-*` | `--accent-*` | **active state & data**: selected tab / segment, links, focus ring, chart series, selected rows (`#4F46E5`, dark `#818CF8`) |
| `heat-*` | `--heat-*` | the brand mark only |
| `cta` / `cta-hover` / `on-cta` | `--cta` … | **the one primary action per screen**: `bg-cta text-on-cta hover:bg-cta-hover` (old `.btn-brand` = the same) |
| `emerald` (`green`, `teal`) · `amber` (`yellow`) · `red` (`rose`, `pink`) · `blue` (`sky`, `cyan`) · `violet` (`purple`) | mirrored scales | ok · caution · error · info · secondary data. Old names are aliases so every page follows the theme. |
| `nav-*` | `--nav-*` | sidebar only (dark in both themes) |
| `scrim` | fixed | modal / drawer backdrop (`bg-scrim/50`) — never `bg-slate-900/x`, which flips light in dark mode |

- **Theme:** Light by default (founder, 2 Nov 2026: not dark-only). The sidebar theme button cycles Light → Dark → System
  (`localStorage mis.theme`, applied before React renders in `main.tsx`). Dark scales mirror (50 ↔ 950). The sidebar is navy
  in both themes, as in Ops.
- Channel colours (`channel-*`) stay fixed hex: they are categorical data, identical in both themes.
- Status always pairs colour with a label, icon or ▲/▼.

## Typography
- **Inter Variable** (self-hosted `@fontsource-variable/inter`, no Google Fonts call) with `cv11 ss01 ss03`;
  **JetBrains Mono Variable** for codes (ledger codes, GSTIN, HSN, ASIN, SKU, voucher numbers). `font-display` is Inter.
- Tabular numerals everywhere (`body`).
- Scale: page title 26/32 semibold −0.02em (22/28 on phones) · section title 16/24 semibold · body 14/20 · table 13/20 ·
  label 11/16 semibold uppercase · KPI figure 26 semibold.

## Shape, elevation, density
- Radius: inputs & buttons 8px, cards 12px, chips 6px. Cards `shadow-card` (`--shadow-card`); overlays `shadow-2xl`.
- Spacing 4 · 8 · 12 · 16 · 24 · 32. Tables: sticky header, hover tint, right-aligned tabular numbers.
- The sidebar's Compact switch (`html[data-density]`, `hooks/useDensity`) tightens rows and folds secondary sections.

## Layout & navigation
- **One source of truth:** `client/src/nav/config.ts` (sections → pages, palette words, old addresses). Never hard-code a
  menu in a component. `server/test/nav.test.ts` fails when a page route is missing from the menu or a menu page has no
  route.
- **Sidebar** (`components/shell/AppNav.tsx`, port of Ops' AppNav): dark, 248px, collapsible to a 64px icon rail
  (remembered). **Two levels only — section → page, kept small (≤ 12 pages, test)**: Reporting (Live MIS, Month-end close,
  AI insights, Send report) · Accounts (Book an invoice, Tally health, Accounts Handbook) · Planning (5-year plan, Round
  planner, Amazon price floors), and Admin at the bottom (Data sources, Data rulebook) with the Claude status pill,
  Compact and Theme. Everything else (Data issues, Tools, Tasks, People & reminders, old pages) is in ⌘K under "More". "Search or jump to… ⌘K"
  at the top, **Pinned** pages under it (pin from any page title). Active page: `nav-active` fill + 3px indigo bar.
  Keyboard: ↑ ↓ Home End.
- **Phones / tablets (< 1024 px):** light top bar (Menu, brand, Claude, Search) + the same list in a modal drawer.
  `--app-top` (3.5rem / 0 on desktop) is the height of that bar for sticky page headers.
- **Home** = Live MIS (`HOME` in nav/config). Old pages (MIS deck, Month close) are out of the sidebar, reachable from
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
- `SegmentedControl`: toggle buttons (`aria-pressed`); selected segment surface with indigo text.
- Overlays (`components/ui/overlays.tsx` Drawer / Modal / Popover, shell `useOverlay`): Esc closes, focus trapped and
  returned, scroll locked, z-index above the sidebar (`z-[100]`), backdrop `bg-scrim`.

## Interaction & accessibility
- Touch targets ≥ 44×44 on phones (sidebar rows 38px on desktop only).
- Visible focus ring everywhere: `focus-visible:ring-2 ring-accent-500` (`ring-nav-accent` in the sidebar).
- Skip link → focusable `<main id="main">`; document title = "<Page> · Heatronics MIS".
- Motion 150ms ease-out; `prefers-reduced-motion` disables it.
- AA contrast in both themes. Screenshot light / dark at 1440 and 390 before shipping nav or token changes.
