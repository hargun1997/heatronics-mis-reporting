# Heatronics "Ember": the design system for every *.heatronics.in portal

Founder-approved on 11 Nov 2026 ("i love it, follow the scheme across the board, across tools").
Reference picture: `/home/claude/ember/htx-portal.png`. Reference CSS: `/home/claude/ember/reference-mockup.css`.
Ember replaces the earlier navy/indigo look (Ops MASTER v7) and the warm stone/beige look.

## Idea
The obsidian brand shell, a calm light work area and ONE accent: heat orange. It should read like the brand
(obsidian + warm orange, DM Sans) and still be plain enough for a team at 12th-pass reading level.

## Colour tokens (light)
| Role | Value | Use |
|---|---|---|
| Sidebar / shell | `#0C0D0E` (obsidian); hover `#17181A`; active fill `#222326` | left nav, both themes |
| Sidebar text | `#A9ABAD`; active / strong `#F4F4F4`; group labels `#7C7E81` (11px uppercase 600, tracking .06em) | |
| Page canvas | `#F4F4F3` | page background |
| Surface | `#FFFFFF` | cards, tables, inputs |
| Sunk | `#F0F0EF` | table heads, chips, sub-surfaces |
| Lines | `#E6E6E4`; strong / input border `#D6D6D3` | 1px borders |
| Ink | `#141516` headings + figures · `#4A4C4F` body · `#6B6D70` labels/captions (must stay ≥ 4.5:1 on canvas + sunk) | |
| **Heat (brand accent)** | `#F36B21` | active nav notch (3px bar) + active nav icon, current portal underline (2px) in the shared top bar, current tab underline, selected segment, focus ring, the ONE highlighted series/bar in a chart, icon tiles (orange glyph on obsidian) |
| Heat text | `#C2410C` | links and accent text on white (AA) |
| Heat soft | `#FFF1E8` | tint behind a selected row / heat pill |
| **CTA (one primary button per screen)** | fill `#C2410C`, hover `#9A3412`, text white (5.2:1). Brand orange `#F36B21` is NOT used as a button fill with white text (fails AA). | |
| Dark button (secondary emphasis) | `#0C0D0E` fill, white text | |
| Status ok | `#15803D` on `#E8F6ED` | ▲ good, running, done |
| Status warn | `#B45309` on `#FDF3E2` | stale, watch |
| Status bad | `#B91C1C` on `#FDECEC` | error, late, ▼ bad |
| Charts | obsidian `#141516` series / bars, comparison grey `#B5B6B8`, ONE heat `#F36B21` highlight (today, the one that matters). No rainbow; categorical extras use obsidian tints. | |

**No indigo anywhere.** Old `accent-*` (indigo) tokens point at the heat ramp instead. Blue may stay only for
neutral info chips (FC codes) if a page already has them.

## Dark theme (keep each repo's existing System / Light / Dark switch)
canvas `#0C0D0E` · surface `#161719` · sunk `#1D1E21` · lines `#2A2B2F` / `#3A3B40` · ink `#F2F2F2` / `#C9CACC` / `#9C9EA1`
· sidebar `#070808` · heat `#F7843F` (accent) · heat text `#FB923C` · CTA fill `#F36B21` with text `#1A0F07` (dark text on orange,
AA) · ok `#4ADE80` on `#0F2A1A` · warn `#FBBF24` on `#2E2108` · bad `#F87171` on `#2E1111`.

## Type
- **DM Sans** (brand font) for everything, self-hosted via `@fontsource-variable/dm-sans` (no runtime Google Fonts; no
  next/font/google fetch at build). Monospace (JetBrains Mono, already installed where used) only for codes: AWB, ASIN, SKU, order IDs.
- Tabular numerals on body. Scale: page title 22/28 650 tracking −0.015em · section/card title 14–16 600 · body 14/20 ·
  table 13/20 · label 11–12 · KPI figure 26/30 650 tracking −0.02em.

## Shape and depth
Radius: buttons/inputs 10px, cards 14px, pills 999px, nav rows 6px. Cards = 1px line + no/very faint shadow. Popovers/drawers
get a real shadow. Nothing decorative: no gradients, no glows, no beige.

## Components (map onto what each repo already has; restyle, don't rebuild)
- **Sidebar:** obsidian, "Heatronics" + portal name in heat as a TEXT wordmark (no invented logo), group labels, rows 34–44px
  with lucide/own icons, active = `#222326` fill + 3px heat bar on the left edge + heat icon + white 600 text; counts as small
  pills (heat fill for "needs you"). Collapsible rail / mobile drawer behaviour stays as is.
- **Shared top bar** (`portal.heatronics.in/shell/header.js`, used by every portal): white bar, portal quick links in grey,
  the current one ink 600 with a 2px heat underline, greyed (no access) ones `#B5B6B8`, More ▾ on the right side of the links.
- **Page header:** title + one-line subtitle, actions right, max one CTA.
- **KPI tile:** white card, label 12px grey, figure 26px, delta pill (▲/▼ + words, ok/bad tone) + "vs last week".
- **Pills:** glyph + word, tones ok / warn / bad / heat / mute.
- **Tables:** sunk header row, 11px uppercase grey headers, 44px rows, right-aligned tabular numbers, hover = sunk.
- **Numbered steps ("Do this"):** 32px obsidian circle with white number (green when done, line struck), 15px 600 title, 12.5px
  grey sub line. Use where the repo already has step/directive cards (Production DoCard, Packing flow, Warranty).
- **Tabs:** underline tabs, current = ink 600 + 2px heat underline. Segmented: selected = white thumb on sunk track, ink text.

## Rules that do not change
44px touch targets, visible focus ring (heat), never colour alone, reduced motion respected, no emoji icons, no em dashes in UI
text, simple English for team pages. Keep all data, logic, APIs and tests untouched: this is a look change.

## Extra shared patterns (from the six mockups)
- **Bell** in the top-right of the portal bar: icon + small heat count badge; opens the existing alerts popup (no banners).
- **Compact step** (side cards): 28px number circle, 14px title, no action column.
- **Horizontal flow stepper** (Packing, weekly steps): numbered circles in a row, done = green tick, now = heat circle + "Doing now", next = grey.
- **Tabs** beside or under the title: current = ink 600 + 2px heat underline.
- **Two-line table cell**: bold primary line + grey 12px second line (name + order ID).
- **Grouped table**: group cell spanning its rows, stronger rule between groups.
- **Big counter** (warehouse screens): large "62 / 186", label, obsidian progress bar.
- **Big scan field**: 56px input with icon, high contrast.
- **Horizontal bars** (made vs capacity): label, value / cap, obsidian fill, heat for the one that needs attention.

## Mockups (look at the one for your portal before you start)
`/home/claude/ember/mockups/htx-<portal>.png` (portal, ops, production, warranty, packing; mis when ready).
They are page-level targets for the look, not exact layouts: keep each portal's existing pages, navigation and content.
