# Heatronics portal guide

One set of rules for all seven portals: Portal, Ops, Production, MIS, Warranty, Packing Hub and Marketing. Every page, part and word follows this guide.

Version 5, 22 Nov 2026. Look: Ember. Owner: Hargun. Live guide with examples: https://claude.ai/artifact/6E1KWPUNeJxK4wmZqkdNRP

## Principles

Six rules decide every other rule in this guide.

- **Numbers first:** Show the number and the change. Put text behind an "i" or in a side panel.
- **Two screens at most:** A page fits in two screen heights at 1440 × 900. Use tabs, not long scroll.
- **One main action:** Each screen has one orange button. Other actions are white or in a menu.
- **Each fact in one place:** A number lives on one page. Other pages link to it.
- **Simple words:** Write for a 12th-pass reader. One instruction in each sentence.
- **Same part, same look:** Use the shared kit. Never build a button, modal or tab by hand.

## Colour

Grey surfaces, one dark shell and one orange accent. Status colours only mean status.

### Surfaces and text

- Canvas: `#F4F4F3`
- Surface: `#FFFFFF`
- Sunk: `#F0F0EF`
- Line: `#E6E6E4`
- Line strong: `#D6D6D3`
- Ink: `#141516`
- Ink 2, body: `#4A4C4F`
- Ink 3, labels: `#6B6D70`
- Obsidian, shell: `#0C0D0E`

### Accent and action

- Heat, accent: `#F36B21`
- Heat soft: `#FFF1E8`
- Main button: `#C2410C`
- Main button, hover: `#9A3412`

### Status

- Good: `#15803D`
- Good soft: `#E8F6ED`
- Watch: `#B45309`
- Watch soft: `#FDF3E2`
- Act now: `#B91C1C`
- Act now soft: `#FDECEC`

- Heat marks only the active item: the selected tab, the sidebar row, the focus ring and one chart highlight.
- The main button is #C2410C with white text. Never put white text on #F36B21.
- Do not use blue, violet, purple, pink or indigo. An "info" message is grey.
- Use token names in code (canvas, ink, cta). Never write a hex value in a component.
- No gradients, no glows.

## Type

DM Sans for all text. JetBrains Mono only for codes such as SKU, AWB and order IDs.

| Name | Size / line | Weight | Use |
|---|---|---|---|
| Hero | 44 / 48 | 650 | The one number in the hero tile |
| Number | 28 / 34 | 650 | Number tiles |
| Title | 24 / 30 | 650 | Page title, once a page |
| Panel title | 18 / 24 | 650 | Modal and drawer title |
| Section | 16 / 22 | 600 | Card and section titles |
| Text | 14 / 20 | 400 or 600 | Body text, buttons, tabs |
| Label | 13 / 18 | 400 or 500 | Labels, table cells, help text |
| Small | 12 / 16 | 500 | Counts and pill text only. Never smaller. |

- Only these 8 sizes. No 11 px, 12.5 px or 13.5 px.
- Sentence case everywhere. No ALL-CAPS labels and no letter spacing on labels.
- Use tabular numbers so digits line up in columns.
- Lines of reading text stay under 80 characters.

## Space, size and shape

One spacing scale, two corner sizes and one control height.

| Thing | Value |
|---|---|
| Gap inside a card | 12 or 16 |
| Gap between blocks on a page | 16 (24 on wide screens) |
| Page padding | 24 on desktop, 16 on phones |
| Card corner | 14 |
| Control corner (button, input, view switch) | 10 |
| Sidebar row corner | 6 |
| Pill corner | Fully round |
| Control height | 40 (44 touch area). Large: 56 on floor screens. |
| Table row height | 44 |
| Page width | Fills the space up to 1440, then centres |

- Cards have a 1 px line and no shadow.
- Use only scale values. No 7 px, 13 px or 18 px gaps.

## Depth and layers

Flat pages. Only things that float above the page get a shadow.

| Layer | Level | Shadow |
|---|---|---|
| Page and cards | 0 | None, 1 px line |
| Sticky bottom bar | 40 | Line on top |
| Sidebar and shared top bar | 50 | None |
| Scrim | 80 | Ink at 38 % |
| Drawer | 90 | Pop shadow |
| Modal | 100 | Pop shadow |
| Menu, popover, tip | 110 | Pop shadow |
| Toast | 130 | Pop shadow |

- Use only these levels. No z-index of 60, 95 or 200.
- Pop shadow: 0 18 48 −12 ink at 28 %, plus 0 2 6 ink at 8 %.

## Motion

Motion only answers a click. It shows what opened, closed or changed.

| Thing | Time | Curve |
|---|---|---|
| Hover, press | 150 ms | Ease out |
| Modal, popover | 200 to 280 ms | Settle (0.2, 0.8, 0.2, 1) |
| Drawer | 380 ms | Settle |
| Toast | 300 ms in, stays 6 s | Settle |
| Number change | Rolls in 400 ms | Settle |

- No fade-in on page load. No moving decoration.
- When the user asks for reduced motion, show the end state at once.

## Icons

One icon set: Lucide, outline, stroke 1.8.

- Sizes: 16 inside text and buttons, 20 in the sidebar and tiles.
- An icon never stands alone without a visible label or a tooltip.
- No emoji anywhere, also not in alerts or emails.
- No Heroicons and no hand-drawn icon sets. One set for all portals.

## Themes

Three themes. The picker is always at the foot of the sidebar.

- Saved per portal in localStorage htx.theme.<portal>.
- Set before the first paint, so the page never flashes.
- The system dark setting is ignored. Print is always light.

## App shell

Every portal has the same frame: the shared top bar, a dark sidebar and a light work area.

- Sidebar row: icon 20, label 14. The active row has a fill, a 3 px orange bar, an orange icon and bold text.
- Sidebar order: the portal name, the pages, then Pinned. The theme picker sits at the foot.
- The Alerts bell lives in the shared top bar, not on a page.
- Phones: one top bar with Menu. Menu opens the same sidebar as a drawer.
- ⌘K or / opens search in every portal.

## Page template

Title and one sentence, the hero band, tabs, then the work. A row opens a side panel.

| Part | Rule |
|---|---|
| Title row | Title 24, the source chip, the owner chip. The one main button sits on the right. |
| Lead | One sentence, 20 words or fewer. More detail goes behind "i". |
| Hero band | One dark tile with the main number, and up to 4 quiet numbers. Each number opens its detail. |
| Tabs | Up to 6. More go into "More". |
| Work | Rows, tables or charts. "Show all N" opens a drawer. |
| Length | Two screen heights at most. |

## Tabs and views

Tabs change the page part. A view switch changes how one part shows its data.

- Only these two styles. No dark filled pills for selection.
- One row of tabs and one view switch at most. Never a third level.
- The open tab is in the URL, so a link opens the same tab.
- Breadcrumbs only on pages three levels deep.

## Buttons

A button says what it does. Verb first.

| Kind | Use |
|---|---|
| Main (orange) | The one most important action on the screen |
| White | Other actions, Cancel, Close |
| Red | Delete, Reject, Stop: only inside a confirm modal |
| Red outline | The button that opens a red confirm modal |
| Text button | Show all, Undo, links inside cards |
| Icon button | Close and tool icons. Always has a label for screen readers. |

- Height 40, touch area 44. Corner 10.
- While it works, the button shows a spinner and a word such as "Saving". It does not move or resize.
- Disabled buttons are at 50 % and show why in a tip.
- In a footer the main button is last, on the right.

## Forms

Each field has a visible label above it. Errors appear under the field that caused them.

- Labels above fields, never only a placeholder.
- Mark optional fields "(optional)". Do not mark required fields with *.
- Check a field when the user leaves it. Say what to type, not what went wrong.
- Long forms open in a drawer. Short forms open in a modal.
- Unsaved changes show a sticky bar: "3 changes not saved" with Save and Discard.

## Status and pills

Every status shows a sign and a word. Colour alone is never enough.

| Word | Sign | Meaning |
|---|---|---|
| Good / Done / Live | ✓ | No action needed |
| Watch / Due soon / Late | ! | Check it today |
| Act now / Failed / Stopped | × | Fix it first |
| Not read / Off / Draft | • | No data, or not started |

- Pills are fully round. Counts are round grey badges.
- One status word list for all portals (see the Word list).

## Number tiles

Label, number, change. A tile opens its detail when you click it.

- Label 13, number 28, change 13. One line under it at most.
- The change says what it compares with: "vs the week before", "vs last year", "vs target".
- Green means better, red means worse. For costs and returns, down is green.
- No data shows "Not read", never 0.
- A row has 4 to 6 tiles. More go behind "All numbers".

## Tables

One table part for every portal. It handles width, overflow, sorting, totals and row actions the same way everywhere.

### Anatomy

| Part | Rule |
|---|---|
| Header | Sunk grey, label 13, sentence case. Units go in the header: "Sales (₹)". Sticks to the top when the table scrolls. |
| First column | The name. It sticks to the left when the table scrolls sideways. The code sits under it in mono. |
| Columns | 7 at most on desktop. Text and status align left, numbers align right. Hide extra columns behind "Columns". |
| Rows | 44 high, a 1 px line, no stripes. Hover shows heat soft. A click opens the drawer. |
| Row actions | One "⋯" menu at the end of the row. No row of icon buttons. |
| Select | A tick box column only when bulk actions exist. A bar shows "N selected" and the actions. |
| Totals | A bold total row at the foot, when the sum means something. |
| Sort | Biggest first by the column that matters. The sorted column shows ▾ or ▴. |
| Empty cell | A grey "–" with the tip "Not read". A real zero shows 0. |
| Length | 8 to 15 rows. "Show all N" opens the full list in a drawer. Above 500 rows: pages of 50. |
| Density | Comfortable (44) is the default. Compact (36) only on tables with 30 or more rows. |

### Too wide or too long

- A wide table scrolls sideways inside its card, never the page. A soft fade at the edge shows there is more.
- The table box is 480 high at most. Only the box scrolls, with the header fixed.
- On phones the table turns into cards: the name, then 2 or 3 key numbers, then the status.

## Charts

Pick the chart by the question. Dark series, grey comparison, one orange highlight.

| Question | Chart | Not |
|---|---|---|
| How does it change over time? | Line (daily) or bars (weekly, monthly) | Area with many layers |
| Which is biggest? | Horizontal bars, biggest first | Pie, donut |
| What share of the whole? | One stacked bar, or a ranked table with % | Pie with more than 3 parts |
| Where do people drop off? | Funnel as step bars with % kept at each step | 3D funnel |
| Is this on target? | Bar or number with a target line | Gauge, speedometer |
| Where in India? | Map with one colour ramp, plus the top 10 as a table | Rainbow map |
| Small trend in a tile | Sparkline, no axes, last point in orange | Full chart in a tile |

- Heights: 160 in a tile, 240 in a card, 320 for the main chart of a page.
- Up to 3 series. Last year or the period before is a grey dashed line.
- A target is a thin dotted orange line with its label at the left end.
- Never two y-axes in one chart. Make two charts.
- Bars start at zero. A missing day is a gap, not a zero.
- Axis labels 12, ₹ in L or Cr, dates as "22 Nov". 5 grid lines at most.
- The tooltip shows the date, the value and the change, in that order.
- The card title states the finding: "Sales are 9% above last year", not "Sales chart".
- Every chart has a "Show as table" option for screen readers and for copying.

## Steps and directives

Work for the team shows as numbered jobs: verb first, one line, one button.

- Numbers only for real order. A list without order uses no numbers.
- Each job: what to do (10 words or fewer), who, when, and one button.
- Show 5, then "Show N more". Biggest money or most late first.
- "How to do it" opens in a drawer with 5 short steps at most.

## Source and owner chips

Every number says where it came from and when it last updated.

- The source chip sits next to the page title. It opens a popover with each source and its time.
- Data older than its limit shows "Old" with an amber dot.
- Notes about data live in the chip. No yellow banners on pages.
- The owner chip opens: role, people, job and how often.

## Modal and drawer

One modal and one drawer for all portals. They look and act the same everywhere.

| Part | Use | Sizes |
|---|---|---|
| Drawer | Details of a row, long forms, "Show all" | 420 or 720 wide, floats 12 from the edge |
| Modal | A decision or a short form | 400, 520 or 720 wide |
| Confirm | Before delete, reject, send or anything you cannot undo | 400 wide |
| Alert | Stops work on floor screens (wrong scan) | 460 wide, large type |

- Header: title 18, one line below it, close button (44 touch area) on the right.
- Footer: Cancel, then the main button last on the right.
- Esc closes. Clicking the scrim closes a drawer, not a modal with unsaved input.
- Focus moves in, stays in, and goes back to the button that opened it.
- One overlay at a time. A modal may open over a drawer; nothing opens over a modal.
- On phones both open from the bottom as a sheet.
- Never use the browser alert, confirm or prompt.

## Menus, tips and toasts

Small floating parts follow the same layer, shadow and close rules.

- Menu: rows 40 high, the risky item last and red, after a line.
- "i" tips explain a metric. The text comes from the glossary, never typed on the page.
- Toast: bottom centre, dark, 6 seconds. It uses the button's verb in the past: Save → "Saved".
- An undoable action shows Undo in the toast instead of a confirm modal.

## Layers of information

Show the answer first. Each click adds detail. Nothing appears twice on the way down.

1. **Glance:** Page top: the hero number and up to 4 tiles. (Is it fine?)
2. **Scan:** A tab: one chart and one table or list. (Where is the problem?)
3. **Detail:** A drawer: one row with its numbers, history and what to do. (Why, and what do I do?)
4. **Raw:** A full page or a download: every row and every column. (Show me everything.)

- Four layers at most. The raw data is never more than 3 clicks away.
- A lower layer adds detail. It never repeats the layer above.
- A number tile opens layer 2 or 3 for that number.
- Back (the browser button or Esc) always returns one layer up.
- The URL holds the layer: tab, view and open row. A copied link opens the same place.

## How much on one screen

Each view has a budget. When a view needs more, split it into a tab, a drawer or a download.

| Thing | Budget for one view |
|---|---|
| Number tiles | 4 to 6. More go behind "All numbers". |
| Charts | 1 main chart. 2 only when they compare. |
| Tables or lists | 1 table, 8 to 15 rows |
| Text | The lead sentence plus 1 line for each card. The rest goes behind "i". |
| Main buttons | 1 |
| Agent notes or suggestions | 3. Then "Show N more". |
| Colours of status | Only rows that need action are red or amber. Good rows stay quiet. |
| Page height | 2 screens at 1440 × 900 |

Do: One hero number, 4 tiles, one chart, one table of the 10 biggest rows. / Healthy rows are grey. The 2 problem rows are red.

Do not: 12 tiles, 4 charts and 3 tables on one page. / Every row has a coloured pill, so nothing stands out.

## Scrolling

One scroll for the page. Small boxes scroll only when they must, and they show that they can.

- Sticky things: the shared top bar, a table header inside its box, the save bar. Nothing else sticks.
- A box that scrolls shows a soft fade at the edge that has more.
- When the user goes back, the page returns to the same scroll place.
- No scroll jacking, no smooth scroll on page load, no infinite scroll. Use "Show all N" or pages of 50.

## Long text and long values

Text that does not fit is cut in a known way. Numbers are never cut.

| Where | Rule |
|---|---|
| Table cell | 1 line, ellipsis at the end. The full text shows in a tip and in the drawer. |
| Card title | 1 line. Card text: 2 lines, then "More". |
| Tab and button labels | 16 characters at most. Write a shorter label; never cut it. |
| Sidebar row | 1 line. If the name is long, rename the page. |
| IDs and codes | Cut in the middle. A copy button copies the full code. |
| Numbers and money | Never cut. Use ₹ L and ₹ Cr to keep them short. |
| Names of people | First name and the initial of the last name in tight places. |
| Lists of items | Show 3, then "+N". "+N" opens the full list. |

## Too many tabs or options

Tabs never scroll sideways on a desktop. Extra tabs go into More. Extra options go into a select.

| Thing | Limit | Then |
|---|---|---|
| Page tabs | 6 | "More" menu at the end of the row. The open tab is always visible. |
| View switch (pills) | 5 | A select |
| Filter chips | 1 row | "+N filters" opens the filter drawer |
| Sidebar pages | 8 in a section | Split the section or move pages into tabs |
| Buttons in a header | 1 main + 2 | The rest in "…" |

## Show and hide: drawer, modal, fold or new page

Pick the container by the job. Do not mix them for the same job.

| Job | Use | Not |
|---|---|---|
| See the detail of one row | Drawer | A fold under the row |
| Make a decision or fill a short form | Modal | A drawer |
| Fill a long form or edit settings | Drawer (720) or its own page | A modal that scrolls |
| See all items of a short list | Drawer with "Show all N" | A new page |
| Read optional extra text | "i" tip, or a fold inside a card | A modal |
| Work for a long time on one thing | Its own page | A drawer |
| Confirm a risky action | Confirm modal | The browser confirm |

### Folds (show more inside a card)

- Folds are only for optional detail. Main content is never folded.
- A closed fold shows its title and a count or a one-line summary.
- One level only. No fold inside a fold.
- A page with more than 3 blocks uses tabs or section pills, not a stack of folds.
- Open state lives in the URL when people share it, else in the browser.

## Filters, search and period

One filter bar, in the same place, in every portal.

- Order: period, search, filters, then the result count on the right.
- Period presets everywhere: Yesterday, 7 days, 30 days, 90 days, This month, Last month, Custom.
- Compare is on by default: the same length before. A switch shows "vs last year".
- Active filters show as chips with ×. "Clear all" removes them.
- Filters, search and period live in the URL and carry to the next page that uses them.
- Search starts after 2 letters and finds names, codes and IDs.

## Cards and the page grid

Every block on a page is a card with the same parts.

| Part | Rule |
|---|---|
| Head | Title 16. The explanation sits behind "i". At most 1 button and a "⋯" menu on the right. |
| Body | One thing: a chart, a table, a list or a note. |
| Foot | Only "Show all N" or the source line. |
| Grid | 12 columns, 16 gap. Tiles span 3, cards span 6 or 12. |
| Order | The most important card is top left. Problems before good news. |

## Alerts, toasts and messages

Each kind of message has one place. No banners across the top of a page.

| Kind | Where | Example |
|---|---|---|
| Blocks the page | Inline, where the content would be | "Could not load parcels. Try again." |
| Result of my action | Toast, bottom centre, with Undo | "Saved." "Claim rejected. Undo" |
| Wrong input | Under the field | "Enter ₹10,000 or less." |
| Work for me or the team | Alerts bell and the Actions page | "4 processes are open for 3 weeks" |
| Data is old or partial | Source chip next to the title | "Old: 2 days" |
| Stops work on the floor | Alert modal with sound | "Wrong item" |
| Daily summary | Email, one for each person | "3 jobs for you by Friday" |

- Counts on badges stop at 99+.
- A message never apologises and never blames the user.

## Confirm and undo

Let people undo. Ask to confirm only when undo is not possible.

| Action | Pattern |
|---|---|
| Archive, hide, move, mark done | Do it at once. The toast offers Undo for 6 seconds. |
| Delete one item | Confirm modal: name the item, red Delete button. |
| Delete many, or send money, email or a live change | Confirm modal that names the count or the amount, for example "Send 48 emails". |
| Very risky bulk delete | Type the word shown to confirm. |
| Leave with unsaved changes | Modal: "You have 3 changes not saved." Save, Discard. |

## Waiting and long jobs

People always know that the system works and how long it takes.

| Time | Show |
|---|---|
| Under 0.3 s | Nothing |
| 0.3 to 2 s | Skeleton for data. Spinner and word in the button for an action. |
| 2 to 10 s | A progress bar or the step: "Reading 3 of 9 sheets". |
| Over 10 s | Run in the background. A toast says "Started. We tell you when it is done." The bell tells when it ends. |

- Show saved changes at once and correct them if the server refuses (optimistic update).
- A save shows "Saved 10:31 am" near the save button.

## Who can see and do what

Hide what a person cannot open. Show what they cannot change, with the reason.

- Pages a person cannot open do not show in the sidebar or search.
- Actions a person cannot do are off, with a tip: "Only admins can change budgets."
- Money pages show "Not shown for your role" in place of the numbers, not 0.
- A read-only person sees no Save buttons.

## Keyboard

The same keys work the same way in every portal.

| Key | Does |
|---|---|
| ⌘K or / | Search pages, products and orders |
| Esc | Close the top overlay, or go one layer up |
| Enter | Confirm the main button in a modal |
| Tab, Shift Tab | Move between controls |
| ↑ ↓ | Move in lists, menus and search results |
| ← → | Move between tabs and view switch options |

## Hover, press, focus and other states

Every control has the same 7 states in every portal. A user can always see what is clickable and what is selected.

| State | Looks like | Rule |
|---|---|---|
| Hover | One step darker fill, or heat soft on rows | Only on things you can click. Never on plain text or tiles that do not open. |
| Pressed | Shrinks to 97 % | For 120 ms. Shows that the click landed. |
| Focus | 2 px orange ring, 2 px gap | Only for the keyboard (focus-visible). Never removed. |
| Selected | Orange underline (tabs), white thumb (views), heat soft (rows) | Stays until something else is chosen. |
| Off | 50 % strength, normal cursor | A tip says why it is off. |
| Working | Spinner and a verb: "Saving" | Same size as before. A second click does nothing. |
| Error | Red line and the message under it | Only on fields. |

- A whole tile or row that opens something shows the pointer cursor and a hover fill.
- Hover never shows information that is not reachable without a mouse. Phones have no hover.
- Tips appear after 400 ms of hover and at once on keyboard focus.

## Search

One search for the whole portal and one search box for each list. Both act the same way.

- Portal search finds pages, products, orders, cases and people. Results group by type, 5 for each type.
- The matched letters are bold. ↑ ↓ moves, Enter opens, Esc closes.
- List search filters as you type after 2 letters, with 200 ms delay. It searches names, codes and IDs.
- The search text goes into the URL as ?q=.
- Recent searches and recent pages show when the box is empty.
- A search with no result says what was searched and how to fix it.

## Filter buttons and the filter drawer

Up to 3 filters sit in the bar. More filters open in a drawer. Active filters always show as chips.

- A filter button shows its name and value: "State: Act now". An active filter has a dark outline.
- A filter menu shows each option with its count. The main button says the result: "Show 12".
- "Filters" with a count opens a drawer with every filter. The bar keeps the 3 most used.
- The count on the right always reads "12 of 48 orders".
- Filters that give zero results show the count 0 and stay selectable.
- Saved views (for example "My orders") sit before the filters as a select.

## The "i" tip

Every metric name can explain itself. The words come from the glossary, so they are the same in every portal.

- The "i" is 18 px, grey, after the label. It opens on click, on focus and on hover.
- The tip shows: name, one-line meaning, how it is counted, period, source, and what is good.
- The text comes from the glossary. Nobody types metric help on a page.
- Page help ("How this page works") opens from the "i" next to the page title.
- Only metrics and page titles get an "i". Not every label.

## Insights and agent suggestions

An insight is a card with one finding, its number, why it matters and one action. It looks the same in every portal.

- Parts in order: state, source and money; the finding as a title (10 words or fewer); why in 1 or 2 sentences with numbers; one action.
- The finding states a fact. "Sales fell 12%", not "Sales look weak".
- Correlations say "linked, not a cause".
- "See the numbers" opens a drawer with the cited data. No insight without its numbers.
- "Not now" asks for one reason: Wrong, Already done, Later, Not important.
- AI text carries a small "AI" mark. An unverified number is hidden.
- Order: money at stake, then how late. 3 on a page, then "Show N more".

## Breadcrumbs and page titles

Breadcrumbs show where a page sits. They appear only when the sidebar and tabs do not already show it.

- Show breadcrumbs from the third level down (page › tab › item).
- Each crumb except the last is a link. The last crumb is the current page, not a link.
- Crumbs use the same names as the sidebar and tabs. Never a different word.
- On phones show only the parent: "‹ Logistics".
- The browser tab title is: page, area, portal. For a row in a drawer: the row name first.

## URL paths and links

Every place in a portal has its own address. A copied link opens the same view for the next person.

| Part | Rule | Example |
|---|---|---|
| Path | Lowercase words with hyphens. Area, then page. | /d2c/logistics, /amazon/ads |
| Item | The item key after the page | /amazon/product/fg-0006, /tracking/HTR-48211 |
| Tab | ?tab= for page tabs that are not their own path | ?tab=couriers |
| View | ?v= for the view switch | ?v=map |
| Section | ?sec= for section pills | ?sec=pickup |
| Period | ?period= or ?from=&to= | ?period=30, ?from=2026-11-01&to=2026-11-21 |
| Compare | ?compare=ly or ?compare=0 | ?compare=ly |
| Search | ?q= | ?q=knee |
| Filters | One name each, comma for many values | ?channel=amazon,flipkart&state=act |
| Sort | ?sort= with a minus for biggest first | ?sort=-sales |
| Open row | ?row= opens the drawer for that row | ?row=ekart |
| Fixtures | ?fixture= only in test, never shown to users | ?fixture=empty |

- Use the same query names in every portal. Never invent ?view=, ?t= or ?panel=.
- Default values stay out of the URL. A clean link is short.
- A moved page keeps its old address as a redirect. Old links never break.
- Links to another portal open in the same tab. Links outside Heatronics open in a new tab with an arrow icon.
- The browser Back button closes a drawer and returns one layer up.

## Links, copy and share

Text links look the same everywhere. Codes copy with one click.

- Links inside text are heat-dark (#C2410C) and underline on hover.
- A link says where it goes: "Open in Setup", not "Click here".
- AWB, order IDs and SKUs show a copy button on hover and focus. After a click it says "Copied" for 2 seconds.
- "Copy link" in a page menu copies the full address, with the view and filters.

## Date picker

One date picker with the same presets in every portal.

- Presets on the left. The calendar is for Custom only.
- Days after yesterday are off, unless the page plans the future.
- The button shows the range in words: "This month (1 to 21 Nov)".
- Weeks start on Monday. All dates are India time.

## Download and print

Every table and report can leave the portal in the same way.

- Download sits in the card "⋯" menu: "Download CSV" or "Download Excel". The page header has "Download report" for the whole page.
- The file name is: portal, page, period, date. Example: ops-couriers-last-30-days-2026-11-22.xlsx.
- The file holds exactly what the table shows, with the filters, plus a first line that names them.
- A big file runs in the background. The toast says "Preparing file" and the bell says when it is ready.
- Print follows the Print and PDF rules: light theme, A4, all tabs open.

## Settings pages

Every portal has one Setup area with the same layout.

- Categories on the left. One category open at a time. The open one is in the URL.
- Each setting: name and one line on the left, the control on the right.
- Changes collect in a sticky bar: "N changes not saved", Discard, Save changes.
- Each save writes the audit log: who, what, before, after, when.
- Settings a person cannot change show as text with "Only admins can change this".

## Step-by-step flows

Work with a fixed order shows its steps at the top. People always know where they are and what is left.

- 3 to 7 steps. Each step has a number, a short name and a state: done, now, next or locked.
- A done step shows a tick. A locked step shows a lock and why it is locked.
- One line under the steps says where you are and what is left.
- Back and Next sit at the bottom. Next says the next step: "Next: Close processes".
- Leaving keeps the work. Coming back opens the same step.

## File upload

Every upload goes through the same 4 steps, in every portal.

1. **Drop:** Drag a file or choose one. The box says which files it takes.
2. **Read:** The portal names the report it found and counts the rows.
3. **Check:** Problems show as a list: missing columns, odd dates, unknown items.
4. **Save:** One button: "Save 1,204 rows". A toast confirms.

- The drop box names the accepted files and the size limit: "Excel or CSV, up to 20 MB".
- Never save a file that failed a check without the user seeing the problems first.
- Unknown columns ask the user to match them once. The portal remembers the match.
- Each upload shows who, when and how many rows in the history.

## Approvals

A change that needs a second person goes through one approval card, the same in every portal.

- The card shows: what changes, before and after, who asked, when, and the risk.
- Approve and Reject only. Reject asks for one reason.
- The person who asked cannot approve their own request.
- Each decision writes the audit log and tells the person who asked.

## Editing, saving and conflicts

Small edits save at once. Forms save with a button. Two people never overwrite each other.

| Kind of edit | How it saves |
|---|---|
| One value in a table cell | Click the cell, type, Enter saves. Esc cancels. A tick shows for 1 second. |
| A toggle | Saves at once. Toast with Undo. |
| A form or settings | Save changes button and the sticky "N changes not saved" bar. |
| Long text (notes, briefs) | Saves while you type. "Saved 10:31 am" sits under the box. |

- If someone saved first, the portal does not overwrite. It says: "Hargun changed this at 10:30 am. Load the new version."
- Leaving with unsaved changes asks: Save, Discard.
- A failed save keeps what the user typed and says why.

## People, owners and assigning

Work always has a person. People show the same way in every portal.

- A person is initials in a grey circle, then the first name and the last initial. The role is in grey.
- Work is assigned to a person or a role. Unassigned work says "No owner" in amber.
- "Assign to" lists people with access to that page, the most likely first.
- Names come from portal.heatronics.in. No portal keeps its own list of people.

## Notes and history

Every item that changes has one history list, newest first.

- Each line: who, what, before and after, when. The system writes as "System".
- Notes and changes sit in one list. A note box sits at the top.
- The history opens from the drawer of the item, tab "History".

## The alerts inbox

All work for a person sits in one inbox. The bell shows how many are open.

- Views: Mine, All. States: Open, Done, Snoozed. Grouped by area.
- Each row: status, what happened (with the number), area, age, and Done, Snooze, Assign.
- Snooze for 1 day or 7 days. A snoozed alert comes back by itself.
- An alert that comes back after Done counts as new.
- Problems with data sources are not alerts. They live in Setup and the source chip.

## Boards

Work that moves through stages shows as a board: one column for each stage.

- 4 to 7 columns. The column title shows the count.
- A card shows a title (2 lines at most), the code and one fact. A click opens the drawer.
- Each card has one main action that moves it to the next stage.
- Overdue cards show an amber or red edge with the days late.
- On phones the board shows one column at a time, chosen from a select.

## Calendars

Plans in time show as a calendar with month, week and list views.

- Views: Month, Week, List. Phones open on List.
- An entry shows the time and a short title, and opens the drawer.
- Drag moves an entry. The move shows a toast with Undo.
- Today has an orange dot. Weekends are a little darker. Holidays and events show as a top line.

## Estimates, partial data and trust

People must know how sure a number is. Every number that is not exact says so.

| Mark | Means | Example |
|---|---|---|
| est. | Worked out from a rule, not counted | COD not yet remitted |
| N of M days | Some days have no data | Sales with 3 days missing |
| Not read | The source did not answer or is not set up | Flipkart before connection |
| AI | Written or picked by an agent | CEO brief insight |
| Old | Data older than its limit | Tranzact stock 2 days old |

- The mark sits next to the number in grey. The tip explains the rule.
- A total that holds an estimate is an estimate.
- Never show an estimate in the hero tile without its mark.

## Targets and pace

A number with a target shows where it is and where it should be today.

- The bar fills to today. A thin mark shows where today should be.
- The line under it says ahead or behind, and by how much.
- Pace follows the season and the weekday, not a straight line, when the data exists.

## Maps

India maps use one colour ramp and always come with a table.

- One ramp from light grey to ink. The state that needs action is orange.
- The legend shows the ramp with numbers at both ends.
- Hover or tap shows the state name and its value.
- A table of the top 10 states sits next to the map. The map alone is never enough.

## Private data

Show only what a person needs. Hide the rest in the same way everywhere.

- Bank and card numbers show the last 4 digits only.
- Customer phone numbers and addresses do not show in reports or charts.
- Money a role cannot see shows "Not shown for your role", never 0.
- Exports follow the same rules as the screen.

## Loading, empty and error

Every data view has all three states. Each state tells the user what to do.

| State | Shows |
|---|---|
| Loading | Grey shapes at the size of the content. No spinner for page data. |
| Empty | What is empty and what fills it. A button if the user can fill it. |
| Error | What failed, in one line, and "Try again". |
| Not connected | Which source and the steps to connect it, with a link to Setup. |
| No permission | Who can open it and how to ask. |
| Partial | The numbers we have. The missing part says "Not read" in the source chip. |

## Numbers, dates and money

One way to write each kind of value in all portals.

| Value | Write | Not |
|---|---|---|
| Money | ₹18.4 L, ₹2.1 Cr, ₹8,062 | Rs 1840000, ₹18,40,000.00 |
| Percent | 9.1% | 9.13 %, 0.091 |
| Change | ▲ 12.0% vs the week before | +12%, ↑12 |
| Points | ▼ 2.3 pts | −2.3% |
| Date | 22 Nov, 22 Nov 2026 | 2026-11-22, 11/22 |
| Time | 10:30 am (India time) | 10:30, 05:00 UTC |
| Age | 6 days, 3 h ago | 144 hours |
| Missing | Not read | 0, —, NaN |
| Count | 1,284 (Indian grouping) | 1284 |

## Writing (ASD-STE100)

Simple Technical English. One instruction a sentence. Short words. Active voice.

- Sentences of 20 words or fewer. Instructions start with a verb.
- Active voice: "Shiprocket sent the file", not "The file was sent".
- No contractions: "do not", not "don't".
- No em dashes, semicolons, "e.g." or "&".
- No "please", no apologies, no "successfully".
- One word for one idea. Use the Word list.
- Error messages: what happened, then what to do. "Export did not work. Try again."
- Numbers are digits: 3 orders, not three orders.

Do: "Export did not work. Try again." / "Put the item back. Scan the correct item." / "Write one fact. Do not blame the customer."

Do not: "Failed to export the Excel file. Please try again." / "Item not in this order (or already packed)!" / "This will be saved in internal notes and included in the email."

## Word list

Use these words. Avoid the words on the right.

| Use | For | Avoid |
|---|---|---|
| Save | Keep changes | Submit, Apply, Update |
| Delete | Remove for ever | Remove, Trash, Purge |
| Close | Shut a panel | Dismiss, Exit |
| Cancel | Stop without saving | Back, Abort |
| Download / Upload | Files | Export, Import (in buttons) |
| Pull | Get data from an API now | Sync, Fetch, Refresh data |
| Refresh | Reload the page view | Reload, Re-run |
| Try again | Repeat after an error | Retry |
| Fix | Correct a problem | Resolve, Remediate |
| Task | Work with a due date | To-do, Action item |
| Not read | No data | N/A, None, 0 |
| Setup | Settings and connections | Connectors, Config, Admin |
| Lock | Freeze a month or plan | Finalise, Close the month |

## Access for everyone

Everyone can use every page with a mouse, a keyboard, a phone or a screen reader.

- Touch targets 44 × 44 at least.
- Text contrast 4.5 : 1 at least. Grey text is never lighter than Ink 3.
- A 2 px orange focus ring on every control you can reach with Tab.
- Status never uses colour alone: a sign and a word too.
- Live updates (toasts, counts) are announced to screen readers.
- Every icon button and chart has a text name.
- Pages work at 200 % zoom with no sideways scroll.

## Phones

Every page works at 390 wide. Tables turn into cards.

- Sidebar becomes a top bar with Menu.
- Number tiles stack 2 a row. The hero tile takes the full width.
- Tabs scroll sideways inside their row. The page itself never scrolls sideways.
- Tables show as cards: the name first, then 2 or 3 key numbers.
- Modals and drawers open from the bottom.
- Header buttons beyond the main one go into "…".

## Print and PDF

Reports print on A4 in the light theme.

- Print hides the sidebar, top bar, buttons and tabs.
- All tabs and folds open when printing.
- Each page shows the portal, the report name, the date and the page number.
- Labels and invoices from Packing Hub keep their own fixed layout. This guide does not change them.

## Floor screens

Packing and store screens are read from a step away. They use the large size.

- Item names 20, alert titles 28, buttons 56 high.
- The scan field always has focus. Enter answers the alert.
- Wrong scan: a red alert that stops work, with what was scanned and what is needed.
- Sound on error, if the station has speakers.

## App errors and special pages

When the portal itself has a problem, the page says what happened and gives one way out.

| Case | Shows | Way out |
|---|---|---|
| Page not found | "This page does not exist." | Go to Home |
| No access | "You cannot open this page." Who can give access. | Ask for access |
| Signed out | "Your session ended." | Sign in again (returns to the same page) |
| No internet | A grey bar: "You are offline. Changes save when you are back." | Automatic |
| New version | "A new version is ready." | Refresh |
| Server error | "Something went wrong on our side." Code for support. | Try again |

- Special pages keep the sidebar and top bar, so people are never lost.
- No jokes, no illustrations, no apologies.

## Sign-in and moving between portals

One sign-in for all seven portals. Moving between them feels like one product.

- Sign-in is at portal.heatronics.in: email, then a 6-digit code.
- The shared top bar lists every portal. The current one is underlined. Portals you cannot open are grey.
- Theme and pins are kept per portal. Period and filters carry across when the page uses them.
- Sign out is in the top bar menu and signs out of every portal.

## First use and empty pages

A new page or a new person starts with a clear first step, not an empty screen.

- A page with no data yet shows what it will show, and the one step to fill it: "Connect Shiprocket".
- A setup list with ticks shows progress: "3 of 5 sources connected".
- No product tours or pop-up tips on load.

## The AI assistant

Chat with the data looks and acts the same in every portal.

- Opens from one button at the bottom right, as a drawer. It never covers the main button of the page.
- Answers start with the number or a small table, then 3 short lines at most.
- Every answer names its source and period.
- The assistant reads only. It never changes data or sends messages.
- Suggested questions show when the chat is empty.

## Help and reading pages

Long text (SOPs, handbooks, training) uses a reading layout.

- Text column 680 wide, size 16, line 26. Contents on the left.
- Headings every 3 to 5 paragraphs. Steps as numbered lists.
- Pictures have a caption. Tables follow the table rules.
- Help opens from the "i" next to a page title, at the right place in the text.

## Emails and reports

Emails and PDF reports follow the same rules as the screens.

- One email for each person, with only their work.
- Subject: action, count and day. "3 jobs for you by Friday".
- Body: a status line, up to 4 numbers, then numbered jobs with one button each.
- Ember colours, DM Sans with a system font fallback, light only.
- Reports: a cover line with portal, name, period and date, then the same cards as the page.

## Report a problem

Every page has one way to tell the team that something is wrong.

- "Report a problem" sits in the page menu "⋯".
- It sends the page address, the view, the time and a short note. It adds a screenshot only when the user ticks it.
- A toast confirms: "Sent to the team".

## Speed

A page shows its first useful number fast. Speed is part of the design.

| Thing | Limit |
|---|---|
| First useful number | 1.5 s on office Wi-Fi |
| Page change | 0.3 s to show the frame, skeleton after that |
| A click on a control | Reacts in 0.1 s |
| JavaScript on first load | 200 KB compressed |

- Data that a page used last time starts loading before the page draws.
- Charts, drawers and maps load only when they open.

## Names and fixed order

The same thing has the same name and the same place in every list, chart and portal.

| Thing | Fixed order or name |
|---|---|
| Channels | Amazon, Website (D2C), Flipkart, Blinkit, GT, OEM. Always in this order, in tables, charts and filters. |
| Channel colours | None. Channels use shades of ink in the fixed order. Orange only for the one that needs action. |
| Products | The Setup product name, never a seller SKU or a file name. The code (FG-0006) is the key. |
| Pages | The sidebar name is the page title, the tab name and the breadcrumb. |
| Roles | Admin, Planner, Dispatch, Finance, Marketing, CX, Viewer. The same words in every portal. |
| Periods | Yesterday, Last 7 days, Last 30 days, Last 90 days, This month, Last month, This quarter. |
| Status words | From the Status list only. No new words for the same state. |

## Rounding and signs

Numbers round the same way everywhere, so the same number never shows two ways.

| Value | Rule |
|---|---|
| ₹ under 1 lakh | Whole rupees with Indian commas: ₹84,210 |
| ₹ 1 lakh to 1 crore | L with 1 decimal: ₹18.4 L. 2 decimals in a table column of L values. |
| ₹ 1 crore and above | Cr with 2 decimals: ₹2.15 Cr |
| Percent | 1 decimal: 9.1%. Under 1: 0.4%. Above 100: no decimal: 186%. |
| Change in a percent | Points: ▼ 2.3 pts. Never a % of a %. |
| Negative money | Minus sign, not brackets: −₹8,062. Red only when it is bad. |
| Units | Whole numbers with commas: 1,284. Days: 1 decimal only under 10. |
| Totals | Sum the raw values, then round. If rounded rows do not add up, show a small note: "Rounded". |

## Number, money and unit fields

Fields that take numbers help the user type them right.

- Money fields show ₹ inside the field and add Indian commas as you type.
- The unit sits inside the field at the right: "kg", "days", "%".
- The field shows its limits under it: "Between ₹50 and ₹10,000".
- Phones open the number keypad for number fields.
- Paste removes spaces and commas by itself.

## What each icon means

One icon means one thing everywhere. Never reuse an icon for something else.

| Icon | Means |
|---|---|
| Check | Done, good |
| Triangle with ! | Needs attention |
| × in a circle | Failed, stop |
| Clock | Late or waiting |
| Down arrow to a line | Download |
| Up arrow from a line | Upload |
| Arrow out of a box | Opens outside Heatronics |
| ⋯ | More actions |
| i in a circle | Explain this |
| Lock | Locked or no access |
| Bell | Alerts |
| Pin | Pinned to the sidebar |

## Drag and drop

Drag is a shortcut, never the only way.

- Things you can drag show a grip (⋮⋮) and the grab cursor on hover.
- While dragging, the item lifts with a shadow and the drop place shows a line.
- Every drag has a menu or button that does the same thing for keyboards and phones.
- A drop shows a toast with Undo.

## Phone gestures

Phones use the gestures people already know. Nothing hides behind a gesture only.

- Pull down on a list to refresh it.
- Swipe down on a bottom sheet to close it.
- Swipe left on an inbox row shows Done and Snooze. The same buttons also show in the row drawer.
- No long press for important actions.

## Wordmark and portal icons

Each portal shows the same wordmark and a clear browser tab icon.

- The wordmark is text: "Heatronics" in white or ink, then the portal name in heat orange.
- No logo image in the sidebar. No made-up icons for portals.
- Each portal has a tab icon: the letter of the portal on obsidian, with a heat bar.
- The page title in the browser tab ends with "Heatronics <portal>".

## Charts in the Dark theme

Charts follow the theme. The meaning of each colour stays the same.

- Dark: series are near white, the comparison is mid grey, the highlight stays heat orange.
- Grid lines are one step lighter than the card.
- Good, Watch and Act now keep their meaning, in lighter shades for contrast.
- Print and PDF always use the light theme.

## Owning and changing this guide

The guide has one owner and one way to change it.

- The guide lives in the hub portal repo. The other portals get it from there.
- A change goes in as a pull request with a before and after picture.
- Hargun approves changes. Each change adds a line to the change list with the date.
- A new part goes into the kit first, then into the portals. No portal builds its own part.
- A new metric is added to the glossary before any page shows it.
- Every quarter, one pass checks every page against the checklist.

## Testing the design

Machines check the guide on every pull request. People check the rest.

- A screenshot of each main page in Ember, Light and Dark, at 1440 and 390 wide, is compared with the last one.
- An access check (axe) runs on each main page. A new serious problem fails the build.
- A copy check fails on contractions, em dashes, "please" and words on the avoid list.
- A code check fails on raw colours, one-off sizes, uppercase labels and hand-built overlays.
- A height check fails a page taller than 2 screens.

## Build rules for code

The rules that keep seven code bases looking like one.

| Rule | How |
|---|---|
| One source of tokens | portal.heatronics.in/shell/ember.css. Every portal loads it. |
| One kit | Same part names and props in every repo: Button, Modal, Drawer, Confirm, Toast, Popover, Menu, Tabs, ViewSwitch, Pill, Count, NumberTile, HeroBand, DataTable, Field, Select, Check, Toggle, DropZone, SourceChip, OwnerChip, Empty, ErrorBox, Skeleton, Steps. |
| No raw colour | No hex, rgb or old colour names (blue, violet, indigo) in components. |
| No one-off size | No text-[13.5px], no rounded-[7px], no z-[95]. |
| No hand-built overlay | No "fixed inset-0" outside the kit. No window.alert, confirm or prompt. |
| No caps labels | No uppercase class on labels. |
| Copy check | A test fails on contractions, em dashes and "please" in UI text. |

## Checklist before merge

Check each line on every pull request that changes a page.

1. [ ] The page fits in two screens at 1440 × 900.
2. [ ] It has one main button.
3. [ ] Every number has a source chip and a comparison.
4. [ ] It uses only kit parts. No hand-built modal, tab or button.
5. [ ] Loading, empty and error states are shown.
6. [ ] It works at 390 wide with no sideways scroll.
7. [ ] Tab reaches every control and the focus ring shows.
8. [ ] All text follows the writing rules and the word list.
9. [ ] Light, Ember and Dark themes all look right.
10. [ ] Tests and the build pass.

