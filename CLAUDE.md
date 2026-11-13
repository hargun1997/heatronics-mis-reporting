# heatronics-mis-reporting

## Login
Every page and API needs a Heatronics login. server/src/htxGate.ts (mounted in server/src/app.ts) asks the master portal
(`https://portal.heatronics.in/api/auth/check?portal=mis`) whether the visitor's `htx_session`
cookie may open this tool (cached 60s), and otherwise redirects to the portal's login or "no access"
page (APIs get 401/403 JSON). The `.run.app` address redirects to mis.heatronics.in.
Who has access is managed at https://portal.heatronics.in/admin (Hargun only). **People & teams (13 Nov 2026):** the check may also send
`pages` (menu page ids). `htxGate({catalog: HTX_PAGES})` refuses pages not granted (APIs stay open to anyone who can open the MIS; Today goes to
the first granted page), serves `/.well-known/htx-pages.json` and `GET /api/htx/pages`; the sidebar, ⌘K and MainLayout (notice on a client-side
move) read it (`client/src/components/shell/useHtxPages.ts`). `server/src/htxPages.ts` is GENERATED from `client/src/nav/config.ts`:
`node --experimental-strip-types scripts/gen-htx-pages.mjs` (test `server/test/htxPages.test.ts`). No `pages` = everything opens.
Endpoints that skip the login (machine callers with their own token): `/api/work/reminders/run`, `/api/ownership/reminders/run` (cron), `/api/expenses` (read by production.heatronics.in, own token), `/api/tally/poll` and `/api/connectors/auto-pull/run` (GitHub Actions daily; Bearer = secret `mis-auto-pull-token` / env MIS_AUTO_PULL_TOKEN, repo secret MIS_AUTO_PULL_TOKEN; no token on Cloud Run = refused; a token call only starts the once-a-day run and answers counts). Never add pages there.
Set `HTX_GATE=off` only for local testing; never on Cloud Run.
**Security rules (9 Nov 2026, `server/test/security.test.ts`):** the app is built in `server/src/app.ts` (index.ts only listens) so the test lists
EVERY registered route and asserts a 401 without a login (also with a forged `Host` / `X-Forwarded-Host: localhost`); a new open path fails it
until added there and here. Open paths match EXACTLY (no prefix, no `..` / `//` / `%2e`); the localhost bypass and `HTX_GATE=off` are ignored
when `K_SERVICE` is set (Cloud Run). On open paths the gate sets `req.htxAuthed` (signed-in person vs machine): unauthenticated reminder runs
only do the once-a-day scheduled send and answer counts only; `/api/expenses` needs `EXPENSES_API_TOKEN` (Bearer) or a login on Cloud Run
(no token = refused). Store keys: ingest connector / slot ids must be slugs (`SAFE_ID`), the local backend refuses keys outside its folder.
SSRF (`connectors/safeUrl.ts`): the Tally host may not be internal (metadata server, loopback, private ranges) on Cloud Run; the Delhivery
`feedUrl` (carries `x-feed-token`) must be https on heatronics.in — both checked on save and before each request. Raw Tally master exports
(`/Master*.json`: party GSTINs / PANs) are git-ignored.

**AI usage feed** `GET /api/ai/usage?months=<n>` (`routes/aiUsage.ts`, pure `services/aiUsageFeed.ts`, test `test/aiUsageFeed.test.ts`; manifest tool `mis_get_ai_usage`): schema 1 of `heatronics-portal/mcp/ai-usage-feed.md` from the stored `usage/<day>/<id>.json` records (`recordApiUsage`), per IST month newest first, vendor = gemini-* → gemini else claude, purposes = feature, ₹ at `USD_INR` 88. Login only (the MIS has no roles). The MIS makes no Gemini calls any more (`ledgerVision` runs on Claude).


## Design & menu
- Heatronics "Ember" design system (spec `design-system/EMBER.md`, MIS rules `design-system/heatronics-mis/MASTER.md`; tokens in
  `client/src/index.css`, Tailwind names map onto them: slate/gray = Ember neutrals, white = surface, brand / accent / indigo = the
  heat ramp, `bg-cta text-on-cta` = the one primary action, `chart-*` / `CHART` = obsidian + grey + one heat; DM Sans).
  No indigo, no gradients, no raw hex in components, scrims `bg-scrim/x`.
- **Themes** (EMBER.md "Themes", 11 Nov 2026): Ember (default: obsidian sidebar, light pages, ignores system dark) · Light (white
  sidebar) · Dark. Picker = segmented "Theme" control in the sidebar footer (always visible; icons on the collapsed rail; in the phone
  drawer). `localStorage htx.theme.mis` (old `mis.theme` dark → dark, else ember); `client/index.html` boot script sets
  `<html data-htx-theme>` + `data-theme` (dark only for Dark) before paint; sidebar colours = `--nav-*` tokens per theme
  (`:root[data-htx-theme="light"]` in `index.css`); print stays light (`prefs.ts applyStoredTheme`).
- Menu = `client/src/nav/config.ts` only (sidebar `components/shell/AppNav.tsx`, ⌘K `CommandPalette`). Adding a page = a route in
  `App.tsx` + a line in nav/config; `server/test/nav.test.ts` checks both.
- **Simplified structure (founder, 11 Nov 2026: "text overload… a page should not be more than 2 scrolls… modals, pills and menus";
  plan `/home/claude/ember/simplify/MIS-PLAN.md`):** **Home = Today** (`HOME`). Sidebar = 4 sections, 14 pages, no Tools section:
  Reporting (Today · Live MIS · AI insights) · Accounts (Tasks · Book an invoice · Bulk payments · TDS · Cash runway · Tally health ·
  Handbook) · Planning (5-year plan · Round planner · Price floors; Round planner in the menu per founder) · Admin (Setup). Not in the sidebar (palette + a button on the page they belong to):
  Send report (Live MIS header), People and reminders (Tasks gear, Setup header), Data rulebook
  (Live MIS About popover), Amazon to Tranzact. Removed: Month close (old) page (`/reporting/mis/close` → Setup), All tools hub
  (`/tools` → Today), Ask the MIS page (`/reporting/mis/chat` → AI insights, which has the chat). Short addresses: `/live`, `/cash`,
  `/tds`, `/payments`, `/booking`, `/floors`, `/setup`.
- **Page template (every page):** `components/ui/PageHeader` = title · status pill · actions (ONE primary) · About "i" popover (owner,
  how often, what to do from `PAGE_OWNER`, optional `help` = "How this works", Pin to sidebar) → ONE sentence (≤ 25 words) → optional
  underline `tabs`. No breadcrumbs (only for palette-only pages), no icon tile, no owner line on the page. Body = `PageBody` (max-w-7xl,
  same gutters). Shared pieces `components/ui/states.tsx`: `Loading`, `ErrorBox` (with Try again), `Empty`, `Panel` (the one titled card),
  `InfoTip` (a note behind an "i"; `text` gives it visible words), `ShowAll` (first rows + modal), `StepNo`, `BTN` / `BTN_PRIMARY`.
  KPI band = `KpiTile` (4–6 tiles, visible without scroll; the plan's `Stat` wraps it). `PageHeader` ends with ONE 16 px gap (with or without tabs):
  bodies never add their own top padding. Secondary header buttons go in `HeaderMore` (inline from `sm`, a "…" menu on phones); the About "i"
  sits next to the title on phones. `Popover` renders in a portal with fixed coordinates (flips up, stays in the window, Esc closes only
  the popover), so drawers and scroll areas never clip an InfoTip. `SectionCard` = the `Panel` look; its `description` is an InfoTip. Budget: ≤ 2 screens at 1440 × 900 in the default state (measured: every
  page ≤ 1,670 px); detail goes into Modal / Drawer / Popover (`components/ui/overlays`), a tab, or a `Views` switch.
- **Writing = ASD-STE100:** one instruction per sentence, steps ≤ 20 words, active voice, digits, no idioms, no em dashes in UI text,
  one word per idea: Setup (not Connectors), Pull (API) vs Upload (file), Report (not slot), Lock (a month), Fix (a problem) vs Task
  (work with a due date), Not connected, No data, Refresh, Download. Notes under charts / tables are `Note` popovers
  (`components/liveMis/shared.tsx`), never paragraphs.
- **Live MIS layout:** header pill "Locked to <month> · N ready" (popover = the old completeness banner), tabs in the header, one row
  of period filters, Download menu (Excel / PDF), Send report. A stack of charts = ONE card with pills (`Views` wrapping the old
  `Fold`s; `tab` = pill label; choice remembered in `livemis:views:<id>`). Month lock bar = one row: status pill, "Check with Tally"
  (modal with the tie table), "Cost basis" note, `Lock <month>`; a lock with open items asks for the reason in a modal.
- **Tasks:** shared header (pill "N with no owner"), Fix rows are one line (select a row for detail; Open · Done · 7 days), the Fix
  list shows 12 then "Show all". People and reminders = header tabs (People · Roles · Reminder email · Heads · Email templates; old
  `#roles` / `#emails` / `#heads` links select the tab).
- **Setup:** two panels (Reports by month · Pull the reports for 1 month) then ONE list of sources grouped by type (row: name, reports,
  API / Claude task / Manual upload pill, status pill, Open / Connect / Upload → the same drawer). The password-store notice is a pill
  with a popover. `IngestWorkspace` component removed (only the two panels remain in that file).
- **5-year plan:** views are header tabs; Setup (the 11 sections, unchanged) opens in a right drawer (`SetupPanel embedded`); scenario
  select + Save in the header, the rest (Compare with, Save as new, Undo, Download Excel, Round planner, Delete) in the "…" menu.
  Round planner's embedded page scrolls inside its frame (page = 1 screen).
- **Bundle:** (loading pass 11 Nov 2026: `vite.config.ts` gives Rollup's CommonJS helpers their own `cjs-helpers` chunk — they sat
  inside `xlsx-style-codepages`, so every page downloaded 433 kB; `FloatingChat` imports the deck + context on first open;
  `pages/work/lazyParts.tsx` loads TaskPanel / TaskEditor (handbook, TDS parts, Excel writer) when a row or the Add task modal opens;
  `handbookAnchors` split out of `taskModel`. Today 1,240 → 322 kB of JS, Tasks 1,784 → 613, Live MIS 1,430 → 743. Still eager: `xlsx`
  (419 kB) on Setup, Price floors, Bulk payments, Book an invoice — their parsers import it statically.)
  Every page is `lazyPage(() => import(...), 'Name')` in `App.tsx` (own chunk; `<Suspense>` around the `<Outlet />` in
  `MainLayout`; a missing chunk after a deploy reloads once). Keep `xlsx-js-style` / `jspdf` out of page chunks: import the
  builders (`liveMisExport`, `liveMisPdf`, `misFormatExport`, `planningExport`, `priceFloorsExport`) with `await import()` on
  click; the Live MIS page reads options / the MIS-format source from `utils/liveMisSource.ts`. `/assets/*` is served
  `immutable, max-age=1y`, `index.html` `no-cache` (`server/src/index.ts`).

## Live connectors & shared secrets
- `server/src/connectors/sharedSecrets.ts`: connectors fill blank fields from the SAME Secret Manager entries Ops uses
  (project gen-lang-client-0101319357, read with the Cloud Run identity, 5-min cache): Amazon `spapi-lwa-client-id|secret`,
  `spapi-refresh-token-in`; Amazon Ads `adsapi-lwa-client-id|secret`, `adsapi-refresh-token-in`; Google Ads `google-ads-*`
  (customer default 4927002413); Meta `meta-access-token`, `meta-ad-account-id`; Flipkart `flipkart-app-id|secret`;
  Shiprocket `shiprocket-email|password`; Easebuzz `easebuzz-merchant-key|salt|merchant-email` (optional); Delhivery `delhivery-api-token` +
  `warranty-feed-token` (optional; = the Warranty Manager's DELHIVERY_API_TOKEN / FEED_TOKEN). Precedence: saved on the Connectors page < shared < `CONNECTOR_<ID>_<FIELD>` env (shared wins so a stale saved token never masks it).
  Never put values in code — this repo is public.
- Amazon Ads (`sources/amazonAds.ts`) and Flipkart (`sources/flipkart.ts`) are ports of Ops' clients and are READ ONLY
  (a guard runs before every request). Amazon Ads reports are async: a pull waits ≤ `AMAZON_ADS_WAIT_MS` (12 s), only asks for days
  Amazon keeps (SP 94 d, SB/SD 59 d) and finishes the rest in the background. Flipkart waits ≤ `FLIPKART_PULL_MS` (20 s),
  newest windows first. Both feed `/api/connectors/facts`, which the Live MIS page awaits on load — keep them fast. Flipkart has no fees in its API — the settlement upload stays for the close.
- API versions: `GOOGLE_ADS_API_VERSION` (default v25), `META_GRAPH_VERSION` (default v25.0), same env names as Ops.
- `/api/connectors/facts` runs every source in parallel (Live MIS run-rate). The month-end close is fed per slot (below).

## Close slots: automatic vs manual (`server/src/connectors/slots/**`)
- Every close report slot (`client/src/data/ingest/catalog.ts`) has ONE source in `slots/catalog.ts` `SLOT_SOURCES`:
  `api` (the MIS's own connector), `sheet` (Tranzact daily Google Sheet), `claude_task` (a named Claude scheduled task) or
  `upload` (manual, with the one-line reason). Test `server/test/slots.test.ts` fails if a client slot has no entry (adding a
  slot = a catalog line). `GET /api/connectors/slots` → badge + line per slot and `FEED_TASKS` (Connectors page "Month-end
  close: how each report is fed" + "Scheduled feeds"; badge + line + "Pull now" on each close slot).
- **Pull = the upload's output, same commit.** A pull returns either `facts` in the exact shape the slot's upload parser emits
  (pure mappers `slots/map/*`, conventions copied from `uploadParsers.ts`) or sheet `rows` that the browser runs through the SAME
  parser. The browser stages it like a dropped file (checks → review → `POST /api/ingest/commit`, raw file =
  `api-pull-…json` / `sheet-pull-…json`), so `computeClose` never sees a difference. Equivalence tests build the upload sheet from
  the same synthetic data and run the real client parser. Upload stays as the fallback on every slot.
- `POST /api/connectors/slots/:connectorId/:slotId/pull {periodKey, force?}` runs the pull as an in-memory job (`slots/jobs.ts`):
  waits ≤ 25 s (`SLOT_PULL_WAIT_MS`), then `{status: running}` and the browser polls `GET …/pull/:periodKey`; job budget 270 s
  (`SLOT_PULL_BUDGET_MS`), result reused 10 min. Missing creds = `{status: not_connected}` with what to add (not an error).
  Close page "Pull & save all for <month>" pulls every connected automatic slot and saves only clean pulls (no fail / warn).
- **Automatic slots** (all READ ONLY; a guard runs before every request):
  - Amazon · Unified Transaction → SP-API Finances v0 `GET /finances/v0/financialEvents` for the month in 7-day windows, paced
    0.5 rps burst 30, PostedBefore ≥ 3 min ago (`spapiGet`, GET only). Mapper `map/amazonFinances.ts`: Principal / Shipping /
    GiftWrap + promotions = revenue, every item fee = fees, per day × base MSKU; no-SKU ads payments = spend; storage / removals /
    coupons / SAFE-T = channel fees; transfers / loans / TCS / TDS / retrocharges excluded; dated by the posted UTC day (as the
    report). Settlement reports (`GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2`) are NOT used (windows straddle months). Unverified
    against a live month: whether the IN report's "selling fees" include GST on fees exactly as the fee events do — reconcile the
    first pulled month with its upload.
  - Amazon Ads · Advertised Product → FIRST Ops' stored copy (`sources/opsAdsStore.ts`: BigQuery dataset `ops`, asia-south1,
    `ads_sp_product` sku / asin / cost per day + `ads_sb_campaign` / `ads_sd_campaign` cost; one SELECT via jobs.query,
    `assertSelectOnly`; Cloud Run identity, scope bigquery.readonly) when every table holds the month's last finished day
    (running month: yesterday). Else reporting v3 `spAdvertisedProduct` (groupBy advertiser, DAILY) + `sbCampaigns` /
    `sdCampaigns` totals (SKU-less channel spend, as the upload) via `pullAdvertisedProduct()` in `sources/amazonAds.ts` (same
    guard: GET or POST /reporting/reports) — a fresh month-long report sat "pending" for hours on 2 Nov 2026; if Amazon is still
    preparing, Ops' partial copy comes back with a warning. Months older than Amazon keeps (SP 94 d, SB/SD 59 d) are refused → upload.
  - Meta · campaign × ad set × product → Graph `GET /act_…/insights` `level=ad&breakdowns=product_id` + `level=account` total;
    residual = total − product rows (spread by revenue, as the upload). `metaInsights()` (GET insights only). The product_id value
    format ("<id>, <name>") is assumed equal to Ads Manager's export — unverified.
  - Google Ads · Campaign report / Shopping products → `googleAds:searchStream` (guarded: never `:mutate`): `campaign`
    cost_micros total, and `shopping_performance_view` cost per `segments.product_item_id` (variant = last `_` part).
  - Shiprocket · Wallet passbook → `api`, COMPUTED from shipment charges: "Computed from shipment charges (freight + COD + RTO),
    not the wallet statement — compare with the passbook once". The wallet statement API (`/account/details/statement`) was
    dropped: live for Oct 2026 it gave one money-in line and 0 debits. `sources/shiprocket.ts computedCharges`: `GET /v1/external/
    orders?page&per_page=100&from&to&sort=ASC&sort_by=id` (Ops' live D2C call; + login POST only, guard: GETs) for orders created
    from 20 days before the month to its end → `map/shiprocket.ts`: per order `awb_data.charges` (Ops' sr_shipments fields):
    freight_charges (else applied_weight_amount / the shipment's freight_charges), cod_charges, charged_weight_amount_rto (else
    rto_charges / applied_weight_amount_rto), booked once per order on its first shipment with an AWB. Dated: freight + COD on the
    AWB assign day (else pickup, else order created; IST), RTO on the RTO initiated day (else AWB day, warned). No AWB / cancelled
    before pickup (status 8 / 16) = no charge. Facts = the passbook parser's (day × channel from the Channel Order Id suffix,
    `fees`). Not in it: weight-dispute debits, refunds / credits, adhoc wallet lines; whether the API amounts include the 18 % GST
    the passbook debits carry is UNVERIFIED. Note: the passbook parser counts debits only (refund credits are skipped as money in).
  - Easebuzz · Settlement / MDR → settlements API from Easebuzz's own PHP kit (easebuzz/paywitheasebuzz-php-lib `payout.php`):
    `POST https://dashboard.easebuzz.in/settlements/v1/retrieve`, JSON `{merchant_key, hash, payout_date: {start_date, end_date}
    (DD-MM-YYYY), merchant_email?}`, hash = SHA-512 `key|start_date|end_date|salt` (email not hashed). Easebuzz answers at most
    20 settlements per call (live: every month came back with exactly 20, the newest) → `payoutsSplit` halves any range that answers
    20 and asks again (down to one day; a full single day = warning), deduped by payout id. Shared
    secrets `easebuzz-merchant-key`, `easebuzz-salt` (+ optional `easebuzz-merchant-email`); missing = "Not connected". Answer
    field names UNVERIFIED (mapper reads several key names).
  - Tranzact · BOM pricing → `api` from the Production portal: `GET https://production.heatronics.in/api/costs?month=` (machine
    endpoint; Bearer = optional shared secret `production-costs-token`; `sources/production.ts`, guard GET /api/costs only; a month
    without costs falls back to Production's newest, warned). `map/costs.ts productionBomCosts`: FG-… items → `bomCosts` rows
    (`fgId`, `bomNumber`, `bomName`, `costPerUnit` = `material` = the BOM at its parts' latest purchase invoices, ex-GST; conversion
    NOT added — Tally holds overheads). The pull returns `bomCosts` (SlotPull), staged like `runBomChecks`. Differs from the upload:
    invoice prices instead of Tranzact default prices.
  - Amazon · Business Report → `api`: ONE SP-API `createReport` GET_SALES_AND_TRAFFIC_REPORT (dateGranularity MONTH,
    asinGranularity CHILD, the month in IST) per month asked; report id held 2 h in memory so a re-pull reuses it; polled every
    15 s; document gunzipped. `assertSpapiPostAllowed`: createReport is the ONLY SP-API POST the MIS makes (test). Rows
    (`map/costs.ts salesTrafficRows`, header the `amazonbiz` reader knows) go through the client's Business Report reader.
  - Delhivery · Wallet report → `api`, COMPUTED freight (Delhivery has no wallet / ledger API): "Computed freight (Delhivery
    tracking + charge calculator), not the wallet ledger — compare with the wallet once". `sources/delhivery.ts`
    `computedFreight`: (1) the month's Delhivery AWBs from the Warranty Manager `GET https://warranty.heatronics.in/api/feeds/
    delhivery-shipments?month=YYYY-MM` (header `x-feed-token`; non-PII rows: awb, direction forward|reverse, createdAt, orderId,
    sheetRow, originPin, destinationPin, paymentMode, declaredWeightG; `feedUrl` overrides the host) → (2) tracking `GET
    track.delhivery.com/api/v1/packages/json/?waybill=a,b,…&token=` (≤ 50 per call — batch size unverified; same call the
    Warranty Manager makes live) → whitelisted `trackSummary` (status, charged weight, picked up, consignee PIN only) → (3)
    charge calculator `GET /api/kinko/v1/invoice/charges/.json?md=S|E&ss=Delivered|RTO|DTO&d_pin&o_pin&cgm&pt=Pre-paid`
    (header `Authorization: Token`; params from public client libraries, Delhivery's docs are behind a login: UNVERIFIED),
    `total_amount` (GST incl.) else `gross_amount`, one call per distinct query (lane × weight × status × mode).
    Paced per pull (`dlClient`): tracking 2/s, calculator 1 per 2 s, each doubling its gap after a 429; a 429 waits Retry-After or
    the body's "available in N seconds" and retries ≤ 4 times. Budget (SLOT_PULL_BUDGET_MS, 3 s reserve) runs out → priced AWBs
    kept, the AWBs left booked at the same-direction average of the priced ones (warning "… left unpriced … ESTIMATE"); tests
    inject fetch + a fake clock. Rules (`map/delhivery.ts
    chargePlan`): cancelled / not picked up = no freight; forward RTO → ss=RTO, else Delivered (in transit = estimate, warned);
    reverse pickup → ss=DTO (customer pin → return warehouse pin); weight = charged weight, else product weight, else 500 g.
    Facts = the wallet parser's (`parseDelhivery`): source `delhivery`, D2C, net ₹ per IST day of the label's creation, in
    `fees`. Guard `assertDelhiveryReadOnly`: GET only, to exactly those two Delhivery paths + the feed path (create / edit /
    cancel / pickup / waybill refused, test). Missing token = "Not connected — create secret delhivery-api-token". Not in the
    estimate: weight disputes, re-attempts, adhoc wallet debits / credits; AWBs the warranty sheet no longer holds (a regenerated
    label replaces the old AWB). Reconcile the first month with the wallet upload.
  - Tranzact · Sales Invoice Register (GT / B2B) → `sheet`: Google Sheets v4 `spreadsheets.values.get` (GET only,
    `sources/sheets.ts`) of sheet `1Ze3E5WLTMUaVkTOvtOsbuh0caj4IT6-Eze8nsAB1gPQ` (Drive folder "Tranzact feed", shared as Viewer
    with 559416687588-compute@developer.gserviceaccount.com), token from the metadata server with scope spreadsheets.readonly (no
    secret; needs the Sheets API enabled). `map/feeds.ts tranzactSheetForMonth`: header found like the parser, rows filtered to the
    month, Document Date written ISO (day-first for DD-MM-YYYY), then the client's `parseTranzactSales`. Empty sheet = "No data in
    the sheet yet" (fail check, upload fallback). Product Price & Inventory / Purchase Invoice Register ids are in `TRANZACT_SHEETS`
    (not read yet).
- **Tranzact register rules (10 Nov 2026, round 9 A9-1/3/4/6/7, B5; test `server/test/tranzactParser.test.ts`):** the upload parser
    (`parseTranzactSales`) and the sheet pull (`tranzactSheetForMonth`) skip **cancelled** lines (Document Status "Cancelled", or a
    Cancelled column 1 / Yes; same aliases as Ops) and say "N cancelled line(s) ₹X skipped" in the trace; no status column = a trace
    note. Non-FG items (SFG / RM / spares / accessories) with a value COUNT for the channel as unmapped products (they show in Product
    gaps); charge lines are dropped, ₹ traced (`TRANZACT_CHARGE_LINE`, same pattern in the sheet pull, test-checked): freight, transport,
    cartage, courier, insurance, forwarding, round-off always; service / delivery / loading / installation / labour / packing /
    packaging / shipping / handling ONLY with "charge(s)" ("Service kit", "Delivery bag", "Loading tray" stay products); **tooling /
    development charges / mould (whole word, not "Moulded") / NRE lines = B2B channel revenue with NO product and no units** (sku-less fact). "FG 0006" = FG-0006. Totals rows ("3 (530)") are
    skipped. Text dates are day-first (`toISODate`: ISO, then dd/mm/yyyy built with Date.UTC; free text read on the local day); undated
    lines are counted with ₹. "(5,000)" = −5,000 in the Tranzact reader only (`numSigned`; other parsers keep `num`). Server `isoDay` also reads YYYY/MM/DD. The Amazon-customer transfer rule applies only to rows with no known series (a GTD /
    OEM invoice to Amazon stays that series' sale, as Tally books it). Tranzact's per-series Tally ledgers are in the seed map: GT -
    Dealer / Retailer / CNF Sales, Physio Channel Sales, MT Sales, B2C Offline Sales → `rev_gt`; **Internal Transfer Sales → `rev_str`**
    (stock transfer, never revenue; mirrored in `ceoSummaryV2.ts SEED_CHANNEL`).
    **GT definition (MIS):** GT = Tranzact series GTD + GTR + GTC + PHY + MT + B2C (`client/src/data/tranzact/rules.ts`), which ties to
    Tally Offline Sales. Ops' `/gt` page uses GTD + GTR + CNF + PHY (no MT / B2C; "CNF" is not a Tranzact prefix, C&F is GTC), so the
    two portals can show different GT sales — not changed here (Ops-side fix: CNF → GTC, decide MT / B2C).
- **Claude task (indirect):** the BOM costs Production serves come from the "Portal feeds: Mac Chrome" Claude task (its Tranzact part runs on the 18th).
  - Tally · P&L → `api`, READ ONLY, from STORED snapshots (Tally answers only while TallyPrime is open on Thakur Hardsoft's cloud
    with the company loaded). `.github/workflows/tally-poll.yml` POSTs `/api/tally/poll` (open path, status only) every 30 min Mon–Sat;
    `tally/snapshots.ts scheduledDue` lets it run only from the 15th, 10:00–19:00 IST, every 20 min until last month has a copy taken on /
    after the 15th, then once a day. Each poll stores this month, last month and ≤ 2 older unstored months (last 12) as
    `tally/pnl-<YYYY-MM>` (+ `tally/state`, `tally/raw-last`). Request = Tally's "Profit and Loss" report exploded
    (`tally/pnl.ts`); every request passes `assertTallyReadOnly` (Export only). Real answer shape (checked on July 2026): group =
    DSPACCNAME + PLAMT/BSMAINAMT, line = DSPACCNAME + PLAMT/PLSUBAMT, ledger = BSNAME + BSAMT/BSSUBAMT; amounts carry the group's
    sign (shown = value × sign of group; contras negative); no Nett Profit row → Σ group totals; Purchase Accounts collapsed → split
    into Stock Transfer (= Stock Transfers sale) + Raw Material Purchases like the Excel reader. The slot reads the snapshot (a forced
    poll if none), warns when the copy was taken < 5 days after month end. Host / port / company on the Connectors → Tally card (never
    in the repo). `POST /api/tally/pull` = signed-in Pull now.
  - Tally · Trial Balance → `api`, stored by the SAME poll after each month's P&L (`tally/tb.ts`: "Trial Balance" exploded,
    closing DSPCLDRAMTA / DSPCLCRAMTA per DSPACCNAME, checked live 2 Nov 2026; exploded ledgers come UNWRAPPED after their group, so the poll asks twice — EXPLODEFLAG No = group names + totals, Yes = groups + ledgers, a name in the groups set = group;
    Dr ≠ Cr or no rows = warning) as `tally/tb-<YYYY-MM>` (+ `tally/tb-raw-last`). A TB that doesn't
    tie shows as a warning (the live Oct 2026 one didn't). A TB failure never undoes the P&L copy. The pull returns
    `trialBalance` (staged + committed as a record; `liveDeck` ignores any ledgerRows on the trial-balance slot, screenshot
    included, so a TB never enters the P&L cascade).
  - Shopify · Sales by variant → `api`: the connector's own `fetchFacts` (orders by day × variant, read only) for the month,
    committed so the close is frozen (an upload / pull for source+month wins over the live facts in `buildLiveDeck`).
- **Tally books (Tally health page `/tally`, READ ONLY):** `connectors/tally/books.ts` (pure: Day Book + "List of Accounts"
  Ledgers / Groups / Stock Items envelopes — Export Data only, `assertTallyReadOnly`; tolerant parsers; `tallyHealth` rules with
  "how to fix in TallyPrime"; voucher search) + `bookStore.ts` (`tally/masters`, `tally/books-<YYYY-MM>`, `tally/books-state`,
  `tally/raw-books` sample). The scheduled poll refreshes them after the P&L (masters daily, Day Books ≤ 6 h old for this + last
  month, then backfill to 12 months) within ~4 min; "Pull Tally now" on the page forces it. Routes `/api/tally/books/*` incl.
  `ask` (Claude grounded in health + matching vouchers + ledger list + Hargun's booking pattern). The XML shape of the Day Book /
  masters answers is UNVERIFIED until the first live pull — check `tally/raw-books`.
- **Live Balance Sheet + Cash Flow** (Live MIS tabs, READ ONLY): the poll also back-fills a Trial Balance for up to 3 of
  the last 13 months per run (`state.tbMonths`). `GET /api/tally/statements` = stored TBs + each month's P&L copy (closing stock,
  depreciation, Nett Profit); pure builder `client/src/data/statements/statements.ts` (BS from Tally's primary groups + closing
  stock + FY profit to date; indirect cash flow from consecutive BSs, sections sum to Δ cash & bank; `misCashRows` fills the MIS
  Sheet cash rows). Tests `server/test/statements.test.ts`. The TB is asked from 1 April (`tbEnvelope`, snapshot `basis:
  'fy-to-date'`; a state with another `tbBasis` empties `tbMonths` so every TB is re-pulled) so P&L groups are FY-to-date; any
  stock the TB carries as an asset (Tally's opening stock) is swapped for the P&L copy's closing stock; `parents` (Tally masters)
  nest sub-group ledgers so nothing counts twice; April's carry-forward into P&L A/c is netted, other P&L A/c moves = "Prior-period
  entries"; "Unexplained" ≥ ₹10,000 and monthly profit ≠ the P&L copy's Nett Profit are warned. UNVERIFIED until a live pull: what
  the FY-start TB shows for stock (Opening Stock row vs Stock-in-Hand) and whether Detailed lists sub-groups and their ledgers.
- **Exports + ledger rules + product gaps (3 Nov 2026):**
  - Live MIS Excel / PDF now include Balance Sheet, Cash Flow (last 12 months, from `useStatements`) and MIS Sheet (company, cash rows via
    `misSourceWithCash`; the MIS Sheet tab download uses it too). `buildLiveWorkbook(deck, o, statements?)`, `buildLivePdf(deck, o, statements?)`;
    no stored Trial Balance = a sheet that says so.
  - **Ledger name rules** `client/src/data/monthClose/ledgerRules.ts` (pure): after the seed map, `lookupLedger` tries an editable rule table
    (Blinkit/Zepto/Instamart sales → `rev_blinkit`, Flipkart sales → `rev_flipkart`, brand agencies/shoots/influencers → `pf_platform`,
    bankers/valuation/allotment/business development → `nl_fundraising`). Stored in objectStore `tally/ledger-rules` (`GET/PUT /api/tally/ledger-rules`,
    which also returns ledger masters, newest P&L rows and expense-ledger voucher narrations); loaded by `loadLiveDeck`. Tally health page → "Ledger rules":
    matched per line, unmatched sales ledgers, brand/fundraising candidates, narration hits (listed only, a ledger is never split by narration), one click
    adds an exact-name rule. A combined "Ecommerce Sales" is never split.
  - **Product gaps** `productSuggest.ts`: unmapped rows (B2B Tranzact items, Meta ids) and no-BOM products (`MISSING_BOM_FGS`) get name-similarity suggestions;
    `deck.productGaps` → `ProductGapsPanel` on Live MIS; a click stores the confirmation (`mis/product-map`, `/api/mis/product-map`: `sku` overrides + `bomProxy`).
    A product with no BOM is costed from its confirmed proxy, else ESTIMATED from the closest costed product (`costEstimated`, cell flag `costEst`/`noCost`),
    and the month stays "uncosted" until confirmed: never a silent 100% margin.
- **Tasks = the one place for accounts work (founder, 3 Nov 2026; Issues + Tally health overlapped):** `/tasks` (sidebar Accounts, first;
  badge = open Fix items + tasks late / due today, `data/issues/useIssueCount.ts`). Views To do · **Fix** · Calendar · All tasks; To do opens with
  the worst open Fix items (`FixPreview`), `?view=fix` = the full list (`components/issues/IssuesInbox.tsx`, one load per page `useInbox`).
  `/reporting/mis/issues` redirects there. Fix items: server `services/issuesInbox.ts serverItems` (Tally health checks, hanging ledgers per
  kind, TB that doesn't tie, Tally not reached, `MANUAL_SLOTS` missing for last month, the anomaly scan grouped per check, future months
  skipped) → `GET /api/issues/inbox` / `count`; browser `data/issues/inbox.ts deckItems` (tie breach, ready to lock, BOM from another month,
  unmapped / no-BOM products). Shared state `issues/state` (`POST /api/issues/state`): Done holds until the item's `sig` changes.
  Tally health keeps only tools (Chart of accounts default, Ask, Ledgers, Vouchers, Ledger rules) + a line pointing to Tasks → Fix.
  **Calendar v2** (`closeCalendar.ts`, `CALENDAR_VERSION` 3 since TDS planning): `cal-m10-mis` = the five no-API uploads + lock (checklist); new
  `cal-m02-stock` "Closing stock into Tally" with `live: 'amazon-stock'` → `AmazonStockPanel` on the task: `GET /api/stock/amazon?month=`
  (`routes/stock.ts`: Ops `amz_ledger_daily_fc_latest` balances for both month ends via `sources/opsBq.ts opsQuery` + Production costs
  incl. `conversion`) → pure `client/src/data/stock/amazonStock.ts buildValuation` (per FG via `skuToFgMapping`, sellable + unsellable +
  FC-to-FC transit, value = units × (material + conversion), nearest earlier day warned, unmapped SKUs unvalued) + Excel. Brand account
  only (Supernode's stock is theirs). Test `server/test/amazonStock.test.ts`. **Setup = ONE list** (founder, 3 Nov 2026: "three classifications per connector, no duplicates"): every connector card tagged
  Connected (API) / Automated (Claude) / Manual upload (`feedOf` in `ConnectorsPage.tsx`: any `upload` slot → manual, else any `claude_task` /
  `claudeTask` → Claude, else API), filter chips by tag, the card's drawer holds its upload steppers (manual first, automatic as fallback) +
  credentials; "Where we are" + "Pull & save all" on top. No Uploads tab: `?view=uploads#<connector>` and `/reporting/mis/ingest` still open
  that connector's drawer; Round planner under Planning; Data rulebook palette-only. Sidebar: one scrolling list, current page in view.
- **Chart of accounts** (Tally health → Chart of accounts, `GET /api/tally/books/chart`, pure `connectors/tally/chart.ts`, READ ONLY): groups →
  sub-groups → ledgers tree with closings from the newest stored TB; hanging ledgers = on a parent group with sub-groups (not Sundry Debtors /
  Creditors / Duties & Taxes / banks), in a carry-over / old group (Busy Carryover, "- Busy"), no group, or in another channel's group; each with a
  suggested existing group (`MOVE_RULES` by name, else the sub-group of look-alike ledgers; never across the books). Handbook c2 lists the sub-groups
  and the moves found on 3 Nov 2026. Tests `server/test/chart.test.ts`, `issuesInbox*.test.ts`.
- **Amazon price floors, live (`/tools/price-floors`, 3 Nov 2026):** fees, prices, units and returns come from Ops' stored Amazon data, not
  the Seller Central upload. `services/priceFloorsLive.ts`: 4 SELECTs on Ops BigQuery via the shared `opsQuery` (`sources/opsAdsStore.ts`,
  `assertSelectOnly`): `amz_fin_events` (kind order / refund, aggregated per order item then per seller SKU), `amz_orders_items_latest`
  (SKU → ASIN), `ads_sp_product` (spend per ASIN), storage fees → pure `mapFloorRows` = the fee report's `ParsedSkuRow` shape per ASIN over
  the last 30 full IST days: sales / ASP incl. GST (Principal + Tax), FBA / closing per unit charged, refund admin (RefundCommission) per
  refund item, referral % = Commission ÷ GST-incl price of the items that paid it (only when ≥ 80 % of units did), fees incl. their GST
  (itemised `fee_gst` ratio, else + 18 %, noted). `GET /api/price-floors/live` (cached 6 h in `price-floors-live`, `?force=1`; a failure
  keeps the last good copy). The page merges it with the same `mergeReport` as an upload (once per new report id, then saves the
  settings); the upload stays behind "Upload a fee report instead". Inbound placement / transport stay settings (account-level fees).
  UNVERIFIED until the first live run: Amazon IN fee type names (FBA / closing regexes) and whether fee GST is itemised. Tests
  `server/test/priceFloorsLive.test.ts`.
  **v2 (9 Nov 2026, `client/src/utils/priceFloors.ts`, tests `server/test/priceFloorsV2.test.ts`):** `solve()` now = `setup()` + `gstAt()` +
  `linesAt()` (same maths; `marginAt(price)` = the lines at any price). (1) **₹1,000 band** `bandAdvice()`: margin ₹ at ₹999 (no referral, low
  closing) and `deadTo` = lowest whole ₹ ≥ the band earning at least that (bisection, ≤ 5× band); `priceAtBelow` = target floor ≤ ₹999 AND today's
  ASP sits in ₹1,000…deadTo−1 → Action "Price at ₹999" (page + PDF); every SKU detail / PDF waterfall shows `bandLine()` ("Band: ₹999 keeps ₹X;
  avoid ₹1,000–₹Y"). An ASP below ₹999 keeps the normal Raise / OK action. (2) **FBM**: `withSpecs` copies `route` + `chargeKg` from Production's
  specs (FBM SKUs get no FBA storage / freight and are left out of the storage-volume average); `asCharged()` swaps an FBM SKU's FBA fee for the
  courier `fbmCourier` = max(`fbmMin` 70, `fbmPerKg` 45 × chargeKg), incl. GST, inbound and storage 0, closing fee as today (Easy Ship /
  self-ship); waterfall row "Amazon fees + courier (FBM)", detail "Courier per order (FBM, X kg…)". (3) `global.unsell` (Settings "Share of
  returns that can't be resold, %", default 0) = `unsellOf()`, used by the table, SKU detail, "Selling below target" and the PDF, named in the
  table caption and `assumptionsLine`. (4) **1P**: `global.ownPays3p` (Settings checkbox "Own-brand sales pay 3P margin", default on = old
  behaviour) and per-SKU `firstParty` ("Sold by us (1P)"; null = follow the default) → `resellerOf()` 0, reseller row hidden for that SKU;
  `routeTag()` = "FBA|FBM · 1P" on rows, titles and the PDF.
- **Bulk payments (ICICI) (`/tools/bulk-payments`, founder 7 Nov 2026): FILES ONLY — no bank API, never moves money**; the accounts team
  uploads in ICICI CIB (BizPay360) and a second user authorises there. Formats in ONE place `client/src/data/payments/iciciFormats.ts`:
  payee export ("Manage Bene", BIFF8 .xls, sheet CounterPartyListUX3, header row found by text "Bene Name" + "Account Number", junk rows
  / page footers skipped, accounts kept as text; "Not Available" IFSC = ICICI payee) parsed in the browser (`payees.ts parsePayeeRows`,
  `workbook.ts readPayeeWorkbook`); Bulk Payee Registration = Bene_Reg_Format (BNF_NAME, "BENE_ NICK_NAME" with the space, BENE_ACC_NO,
  BENE_IFSC, BENE_EMAIL, BENE_MOBILE; all text cells; nick ≤ 20 UNVERIFIED); **bulk PAYMENT format = PLACEHOLDER `PAYMENT_FORMAT`
  (`verified: false`, ICICI customised bulk columns PYMT_PROD_TYPE_CODE … ADDL_INFO5) — confirm in BizPay360 → File Format Settings
  and run "Validate File for Upload" before "Payment File Upload"**. Mode default (`batch.ts defaultMode`): ICIC IFSC / ICICI Bank → FT,
  ≥ ₹2 lakh → RTGS, else NEFT; only Active payees payable. Storage (ingest objectStore): `payments/payees` (FULL account numbers — needed
  for the files; the signed-in page gets them, the UI shows ••••1234; never log them), `payments/batch-<id>` + `payments/batches-index`
  (records only, no bank status; who = `req.htxUser`, else self-reported, flagged). Routes `server/src/routes/payments.ts`
  (`GET/PUT /api/payments/payees`, `GET/POST /api/payments/batches`, `GET /api/payments/batches/:id`). Debit account in localStorage
  `mis.payments.debitAccount` only. Tests `server/test/payments.test.ts` (synthetic data; the repo is public — never commit real payees).
- **TDS planning (`/accounts/tds`, sidebar Accounts; founder 9 Nov 2026), READ ONLY from the STORED Tally Day Books:** `GET /api/tds?month=`
  (`routes/tds.ts`, pure `services/tdsFeed.ts`: months FY April → month + 1 / quarter end, only vouchers touching a /TDS/ ledger + their ledger
  masters) → pure engine `client/src/data/tds/tds.ts buildTds` (in the browser): TDS PAYABLE ledgers (not receivable / 194O / TCS / Current
  Assets), section from the ledger name (`sectionOf`: 192, 194A/C/H/Q, 194I(a/b), 194J(a/b), 195, else "Other" = rename the ledger), amount
  paid = the voucher's Dr lines ex-GST / tax / bank, deductee = party (PAN from masters), rate check (194C 1 % / 2 % by PAN 4th letter,
  194J 2 / 10, 194H 2, 194I 2 / 10, 194Q 0.1, no PAN = 20 % 206AA), threshold notes, challans = TDS debits with a bank line booked in the
  NEXT month (assumption), FIFO late-deposit interest 1.5 % / month-or-part, 234E ₹200 / day capped, challan head 0020 company / 0021 other,
  due 7th (March → 30 Apr), quarter 26Q / 24Q / 27Q rows (BSR / serial read from the challan narration "BSR 1234567 Challan 12345").
  Rates / limits = 1961 Act after Finance Act 2025 — UNVERIFIED for FY 2026-27 (Income-tax Act 2025 renumbers sections). Excel layout in ONE
  place `client/src/data/tds/tdsFormats.ts` (Pay this month · Deductee detail · 26Q prep) — **match to Heatronics' existing TDS file when the
  founder sends it**. Calendar v3: `cal-m07-tds-pay` (7th, every month but April; `cadence: 'quarterly'` + `months` = those months),
  `cal-m04-tds-march` (30 Apr), both `live: 'tds'` → `pages/work/TdsTaskPanel.tsx`; `cal-q-tds-return` (31 Jan / May / Jul / Oct). Tests
  `server/test/tds.test.ts`.
- **Live MIS = five tabs of expandable sections (founder, 5 Nov 2026: "expandable … declutter … the P&L is the MIS"):** `pages/mis/LiveMisPage.tsx`
  Overview (Headline · Revenue & growth · Run-rate — whole business) · **P&L** (the MIS sheet `LiveMisSheetTab` with Show ₹ Lac | % of net
  revenue and **Basis Actual | Normalised** — ONE basis switch (`LiveView.basis`, default normalised) drives the Margin ladder & cost structure,
  Detailed P&L and By channel sections below it; "Download (this format)" writes what is shown, `MisFormatSource.percent` / `rows`) · Channels
  (Channel mix · SKU × channel) · Products (SKU P&L · Units sold) · Statements (Balance sheet · Cash flow; no period bar). `Section` in
  `components/liveMis/shared.tsx` (open state in localStorage `mis-live-folds-v1`, first section of a tab open). Old tab ids (`?tab=missheet` …)
  map in `LEGACY_TABS`; `/reporting/mis/deck` redirects here (MISDeck.tsx deleted). Data freshness + uploads live on Setup only; repeat purchase /
  cohorts live in Ops → D2C → Customers (one link line).
  - **Normalised COGM basis (founder, 5 Nov 2026: "we should see some normalisation with revenue" — the flat FY blend is retired):** pure
    `liveViews.ts normaliseLiveMonths(months, completeness, deck?)` → `{months, note, skipped, estimated}`. Normalised COGM for a month = BOM cost
    of the units sold + factory overhead, i.e. the live month restated by its `channelRecon.cogmVariance` (Tally COGM − Σ SkuCell COGS − factory):
    `cogm − v`, GM / CM1 / CM2 / CM3 / EBITDA / net income `+ v`, everything else actual; `v` is kept on the month as `stockVariance` (summed into
    `PeriodAgg.stockVariance` / `normalisedMonths`) and shown as the signed memo line **"Stock build / drawdown (purchase timing)"** (positive =
    stock built) under GM% on the MIS sheet (`MIS_SHEET_ROWS_NORMALISED`, `MisPoint.stockVariance`), in the Detailed P&L, the cost-structure
    table and the Excel / PDF P&L + MIS sheets (`normaliseCogm` option), so a full year still reconciles: Σ normalised net income − Σ memo = Tally
    net income. **As-booked fallback, never an FY average:** static history / published months, top-line months, months without a recon and
    months whose every SKU cell has no BOM cost stay as booked and are named in the note ("Dec 23–Jul 26 shown as booked — no BOM costing for
    them"); a facts-only month costed to CM2 is already on this basis (variance 0). `blendLiveMonths` / `blendedMonths` / `fyBlendedGMRates`
    were deleted (code-health pass, 9 Nov 2026). Tests `server/test/normalisedCogm.test.ts`.
    **Conversion cost is inside the normalised COGM (10 Nov 2026, audit A1):** the BOM is material only, so normalised COGM = BOM material of the
    units sold + ALL conversion cost booked that month in Tally's Direct Expenses (`misDeck/conversion.ts conversionCost`: factory overheads +
    manufacturing costs + inward freight + any other COGM ledger that is not raw material / stock movement; `MonthlyMIS.conversion`,
    `PeriodAgg.conversion`; `factory` is still the Factory Overheads ledger). `cogmVariance` = raw-material purchases + stock movement − BOM
    material of the units sold, so the memo line holds ONLY material purchase timing (before: ≈ ₹40.8 L of manufacturing cost + freight over
    Apr–Oct 2026 sat in the memo and normalised GM was that much too high). Bridge: "Product cost (BOM)" = normalised COGM − conversion, new step
    "Manufacturing cost and inward freight" (`direct_other`). A month whose Tally closing stock = opening stock with purchases booked
    (`stockUnposted`) is listed as "estimated" in the note (`NormalisedMonths.stockEstimated`): its memo is not final. Raw SKU cells carry factory overhead only (`SkuCell.fac`); the SKU × channel views foot them to the Channel P&L (`channelFoot.ts`).
    **Sales with no BOM cost are never ₹0 in the normalised COGM (10 Nov 2026, audit A6-1 / A6-9):** `misDeck/uncosted.ts uncostedEstimate`:
    `noCost` cells + `MonthlyMIS.unmappedRevenue` (sales no product map knows, set in `buildMonth`) are costed at the month's own BOM material
    rate (Σ cogs ÷ Σ rev of the costed cells); the estimate is taken out of the memo (`v − est`), so the identity still holds, and listed in
    `NormalisedMonths.uncosted` + the note ("Not costed by BOM …: ₹X L of sales in Sep 26 — material estimated …"). A month where more than
    half of its product sales have no cost (`UNCOSTED_SKIP_SHARE`) stays as booked ("most sales have no BOM cost"). Facts-only months are unchanged.
- **Published history on the live basis (10 Nov 2026, founder-approved audit fixes; `data/misDeck/publishedBasis.ts`, test
  `server/test/publishedBasis.test.ts`):** every reader (Live MIS, legacy analytics, MIS sheet, exports, chat) takes `PUBLISHED_MONTHS` /
  `PUBLISHED_CELLS`, never the raw `MONTHLY_MIS` / `SKU_CELLS`. (1) The workbook's channel rows carried GST (Σ channels − net revenue =
  the month's `totalTaxes`, exact to Dec 2025): `exGstChannels` scales each month's channel rows by net revenue ÷ Σ channels (≈ 100/105,
  all products at 5 % GST; the per-month ratio is used instead of a flat rate because it is exact and also covers the restated Jan–Mar
  2026 months), so Σ channels = net revenue to the paisa; the customer-paid figure is kept as `gmvByChannel`. FY25-26 Σ channels was
  ₹6.13 Cr vs ₹5.83 Cr net revenue. (2) `reclassifyEarlyAmazon` is deleted: Amazon Dec 2023 – Sep 2024 (₹1.01 Cr incl. GST) shows as
  Amazon, not OEM/B2B; `recutAmazonCells` takes it back out of the OEM model SKU cell (cost = revenue × Amazon's own Oct 2024 – Mar 2025 cost rate ≈ 24 %, units = revenue ÷
  its revenue per unit, flagged `costEst` / `uEst`; the OEM part keeps the model's 67.7 % and is flagged too; the model's cost on the Amazon
  revenue, ₹45.4 L from units that never existed, is dropped, not moved to OEM: Amazon GM ≈ 76 %, OEM ≈ 29 % in those months). SKU cells cut from the workbook rows (OEM, Offline, early Amazon, some Blinkit months: Σ cells = the GST-incl row)
  are scaled to the ex-GST row by `exGstCells`; cells from other sources (Amazon net proceeds from Oct 2024, Shopify per product) are already
  ex-GST and stay as booked, so they do not foot exactly to the channel row (different source).
  (3) Like-for-like compares only months that have a year-ago month. (4) Chat / AI context (`data/chat/misContext.ts`) = the built deck
  (`buildLiveMisContext`; fiscal years summed from the deck by `fySummaryOf`); the stale `FY_SUMMARY` / `buildMisContext` are no longer
  read. (5) A published month replaced by a full Tally close carries `completeness.vsPublished` (₹ change): chip `PublishedGapChip` in
  the Live MIS status strip + a low Fix item `published:<month>` when net revenue or net profit moved ≥ ₹10,000.
- **Published history tied to the audited accounts (10 Nov 2026, audit recon + review; pure `data/misDeck/auditTie.ts`, applied in
  `PUBLISHED_MONTHS`, test `server/test/auditTie.test.ts`):** FY24-25 and FY25-26 company net revenue (ex inter-branch), gross margin
  (revenue − material), EBITDA, PBT and net income equal the audited statements (FY25 within ₹2,000: the workbook's revenue is ₹1,920 short;
  FY26 within ₹100). (1) FY24-25 material was a flat 30.97 % proxy: COGM line "Audit true-up: material (audit adjustment)" −₹11.70 L, spread
  over Apr 24–Mar 25 by each month's "Raw Materials & Inventory" line (each month flagged `auditNote`); GM / CM1–CM3 / EBITDA move, opex does
  not; channels take it via `cogsWeights`, SKU × channel cells via the COGM rest in `fac` (FY25 GM 63.55 % → 66.63 %, EBITDA ₹27.20 L →
  ₹39.18 L). FY26 the same for +₹8,940. (2) Other income = opex line "Other income" (FY25 ₹0.28 L new; FY26 ₹1.47 L was netted into opex,
  now its own line, opex total unchanged); tax = Non-operating line "Tax (incl. deferred)" in March (FY25 ₹2.95 L, FY26 −₹0.86 L credit) so
  Net income = PAT; FY26 finance-cost true-up ₹5,215. Every published month < Apr 2026 carries `nonOpLines` ("Interest & depreciation";
  audited-year months a ₹0 tax line, so tax shows 0 there; Dec 23–Mar 24 and live months without a tax ledger show "no data"). MIS sheet rows
  added: Interest, depreciation & other · Profit before tax · Tax (incl. deferred) · Net income (company only; `auditTie.belowEbitda`,
  `taxOf`); the legacy MIS-format company point splits payroll / prof fee / other income out of OpEx too. (3) Jan–Mar 2026 inter-branch scaled
  to the books (₹8.97 L → ₹11.93 L; FY26 turnover = audited ₹6.93 Cr); ×1.0659 kept; gross / returns / GST = the channel rows' build-up so it
  foots to the restated net (`footBuildUp`). (4) Dec 23–Mar 24: depreciation 4/12 of the year spread over the 4 months (was the full ₹13.88 L
  in Mar 24); FY bucket label "FY23-24 (Dec 23–Mar 24, 4 months)" (`fyBucketLabel`). (5) Detailed P&L note per FY: "audited revenue includes
  ₹X inter-branch transfers; MIS excludes them" (`PeriodAgg.interBranch`, `interBranchNote`).
- **SKU layer foots (10 Nov 2026, audit R6 / R8 / R10; pure `data/misDeck/skuLayer.ts`, tests `server/test/skuLayer.test.ts`):**
  (1) sales no product map knows get one **"Not mapped (sales with no product)"** cell per channel (`NO_PRODUCT_LABEL`) and month (`notMappedCells`, `noCost`; `uncostedEstimate` skips it
  because `unmappedRevenue` already counts it), so SKU P&L / Units sold never drop them; a Tranzact `FG-dddd` the FG master does not list is
  its own product under its Tranzact name (`skuRollup.ts tranzactFgHit`), costed by its BOM. (2) Workbook OEM / Offline / Blinkit cells are
  `modelled` (product + units assumed): SKU P&L / SKU × channel rank products by measured revenue, a mostly-modelled column says "(modelled)",
  Units sold shows estimated units (modelled or `uEst`) as "≈" and ranks by counted units; accessories, "Amazon (no SKU split)" and unmapped sales rank last (`rankLast`). (3) Static cells on the books' basis
  (`bookedStaticCells` in `liveDeck staticHistory`): D2C ads ex-GST (`D2C_AD_SPEND` ÷ `D2C_COSTS` meta + google, the feed's Google carried
  18 % GST); Σ ad ≤ booked S&M and Σ fees ≤ what is left of booked C&F + S&M (ads kept, fees give way) — FY25-26 cells cf + ads were
  ₹56.1 L above the P&L, now ≤ it every month. (4)–(5) Channel COGM weights and period = sum of months now come from #409 (`channelAlloc.ts cogsWeights` / `sumChannelRows`);
  the SKU P&L below CM2 (`slicePnl`) is also summed month by month. (6) "Why it moved": cells ≠ books is "Sales not in
  product detail", never a top reason (also "Other / rounding"). (7) Meta product rows above the account total are scaled down to it (upload
  parser + slot mapper; stored months need a re-pull). (8) Plan vs actual: Amazon settled cell units × the month's Business Report units ordered ÷ settled (`amazonOrderedRatio`, deck `traffic`),
  else × `AMAZON_ORDERED_PER_SETTLED` 1.205 (measured Oct 25–Jun 26, labelled estimate), to the plan's ordered basis, noted on the page. Left: Mar 26 Amazon cells vs row (−₹2.44 L, which side is wrong is
  unknown), Jan–Mar 26 restated quarter (×1.0659, data decision), plan Jul–Sep 26 last-year units (re-import the sheet), B6-4 legacy COGM by month.
- **MIS sheet + periods (10 Nov 2026, audit round 7 #4–#6 #12–#14 / round 10 #4; pure `data/misDeck/misPeriods.ts`, tests
  `server/test/misSheetPeriods.test.ts`):** Payroll / Professional fee / Other income are split out of OpEx for legacy months too
  (`opexSplit`: Payroll…, Salar…, Professional Fees, Legal & CA…, Other Income…; no matching line = blank, never 0; FY23-24–FY25-26 ₹116.22 L
  payroll + ₹22.80 L fees were in Other Expense). A period's EBITDA Burn = max(0, −Σ EBITDA) (FY25-26 was 33.97 L, now 0.97 L) and is gated;
  payroll / prof fee / other income are blank in a total whose Other Expense is, the stock memo in one whose COGS is. Range presets and the Excel Summary end on the newest
  COMPLETE month (`anchorMonth` / `isCompleteMonth`: closed, published, or a full close of a finished month), not the running / half-booked
  newest; "YTD" = Indian FY to date, labelled "FY26-27 to date"; the Summary names the newest month separately. Cash rows (`MisSheetRow.cash`)
  stay ₹ Lac in the % view / % export. FY cash = the months with a stored cash flow (`cashOverMonths`), named in the total header ("cash
  Oct–Nov"). The unused `FY_SUMMARY` was deleted.
- **Live MIS speed:** facts through `connectors/factsCache.ts` (per source × month, closed months 24 h / recent 15 min, stale
  served + background refresh, Refresh = force); `readAllExtracted` cached behind a version marker written on every save /
  delete; the client shares one deck load per tab (`loadLiveDeck`, 2 min).
- **Month close: lock, ties, BOM, factory** (Live MIS, `data/misDeck/closeTies.ts` pure + `MonthClosePanel`):
  - **Close & lock** = shared stored lock (`close-locks` + audit `close-locks-audit` in the ingest object store; `GET /api/ingest/locks`,
    `POST /api/ingest/locks/:YYYY-MM {action: lock|unlock, worstResidualPct, overrideReason|reason}`; `ingest/closeLocks.ts`; who = the
    portal email when `auth/check` returns one (htxGate sets `req.htxUser`), else the self-reported name, flagged unverified).
    Only frozen history (< `LIVE_BOUNDARY`) and locked months are `closed`; `completeThrough` = the contiguous closed run from the first
    month (a month with no data or not locked stops it). A full Tally month (P&L with net revenue > 0; with none it is only to-CM2 / top line)
    is `ready` until locked. Published months are not closed until locked either.
  - **Month completeness (10 Nov 2026, pure `data/misDeck/monthCompleteness.ts`, tests `server/test/monthCompleteness.test.ts`):**
    (1) a Tally copy with no sales ledger (stock carry-forward only) is ignored when connectors sold (`tallyIgnored`); facts-only months
    book connector sales ex-GST (`gstBasis.ts exGstOf`: reported, else GMV ÷ 1.05 estimated → `exGstEstimated`, else as booked).
    (2) `full` needs every channel with ≥ 5 % of the month's connector sales to have a Tally ledger ≥ half of it (`tallyGaps`).
    (3) a channel with ≥ 5 % (and ≥ ₹10,000) of the previous 3 months' sales (published months count; OEM/Offline folded into B2B/GT)
    and no sales this month = `missingChannels` (`applyChannelHistory`, skips locked months): SOFT blocker ("stopped, or not booked?"),
    level kept so it can be locked with a reason; only (2) is hard. Named channels show "no data" in the channel P&L
    (`channelNoData`), never ₹0. Tie: an orders-GMV estimate (Sales API) is shown but not judged; a breach says which side is lower
    and by how much. Server `ceoSummaryLoad.ts ASSUMED_GST_RATE` = the same 5 % (test). (4) `ready` = full + no
    `closeBlockers` (month over, tie ≤ 1 %, closing stock ≠ opening when the month bought or sold, required reports not missing /
    empty / partial). Blockers show on the Month close panel (numbered) and as one Fix item `close:<YYYY-MM>`; soft ones (tie, report)
    can be locked with a written reason.
  - **Tie** (`completeness.tie`, Tally-backed live months): Tally Nett Profit vs the cascade's net income (engine residual) + per channel
    connector sales ex-GST vs Tally's channel sales ledgers (Amazon, D2C/Shopify, Flipkart, Blinkit, GT, B2B). Residual > 1% of net revenue
    (`TIE_LIMIT_PCT`) = breach: locking needs a written reason (server 422 without), kept on the lock. Channels with no connector are shown, not judged.
  - **GMV vs ex-GST**: facts may carry `gmv` (customer-paid incl. GST) and `netExGst`. Shopify `fetchFacts` fills both (`shopifyLineSales`: `taxes_included`
    + line `tax_lines`); Amazon Sales-API facts carry `gmv` only (no tax split → ex-GST ESTIMATED at the product GST rate, `gstBasis.ts DEFAULT_GST_RATE` = 5 % since 10 Nov 2026, labelled); Finances/settlement and
    other feeds are taken as booked (Principal is ex-GST). `revenue` itself is unchanged.
  - **Channel P&L** (`anchoredChannelPnl` → `tallyAnchoredRows`) where Tally exists: revenue = Tally channel ledgers; channel fees / marketing /
    platform = connector-attributed `tallyLines.byChannel` + revenue share of the unattributed rest (foots to Tally); COGM by BOM-COGS share; opex and
    non-operating by revenue share (Tally books them company-wide). Months without Tally keep the order-share split (`row.basis`).
    **Cost allocation rules (10 Nov 2026, pure `data/misDeck/channelAlloc.ts`, tests `server/test/channelAlloc.test.ts`):** (1) Marketing sits where
    it was spent: connector ad spend for live months, the published ad feeds (`channelAdWeight`) for locked / published months (per month AND per channel the larger of the two — `PeriodAgg.smTagsByMonth` holds each month's report tags — then summed over the period, so a quarter mixing a feed-only and a tags-only month keeps both); the rest of
    Tally's S&M goes ONLY to the consumer channels (D2C, Amazon, Flipkart, Blinkit) by ad spend, else by their revenue (`row.basis:
    'estimated'`), never to B2B / OEM / GT / Export unless something attributes it there (a period with no consumer channel at all falls
    back to revenue, estimated). (2) A report can't put more on a channel than Tally booked: `capTallyLines` (per month, per line, in
    `buildLiveDeck`) scales the channels down pro rata, keeps the cut on `TallyBucketLine.over`, and `deckItems` raises the Fix item
    "<Month>: Amazon fees in the report exceed Tally by ₹X — check the booking"; `spreadWithCap` does the same per period so a negative
    rest is never spread. (3) Σ channels = company for every line (tested). Months without Tally use the same rule: no ad spend = consumer channels by revenue, not every channel.
    **One channel method (10 Nov 2026, audit rounds 8 + 9; `channelAlloc.ts`, `channelFoot.ts`, tests `server/test/channelSplits.test.ts`):**
    (4) a year / quarter / range = Σ its months' rows (`anchoredChannelPnl` sums `memberAggs`; was split once at period level: FY24-25 B2B CM2
    off ₹18.95 L). (5) The MIS Sheet channel view (`liveMisPoint`) takes the same anchored row; the legacy revenue-share `channelPnl` is only
    the fallback (B2B showed the company GM %: FY25-26 COGS ₹30.99 L → ₹56.22 L). (6) COGM weights `cogsWeights`: each channel's SKU material
    per ₹ applied to its BOOKED revenue (cells covering part of Tally's OEM scale up), no-BOM sales at the month's material rate, a channel with
    booked sales and no cells at that rate — flagged `row.estimatedLines` 'cogm' + `row.notes`. (7) Channel & fulfilment and Platform & Payment
    (`allocateChannelCost`): report tags (published months: the larger of tags and the fee feeds `feedFees` / `feedPlatform`) capped at the books,
    the rest ONLY to the consumer channels by revenue (B2B / GT get none unless a report tags them; was ₹14.68 L on B2B / GT in FY25-26);
    'fees' / 'platform' in `estimatedLines` when > 1 % went by revenue. Legacy `channelPnl` follows the same rules and no longer puts the S&M
    leftover on Blinkit (₹10.6 L). (8) SKU × channel (`footCellsToChannels`, matrix + Excel): each channel-month's cells foot to its anchored
    row to CM2 — material per cell, the rest of COGM (factory, manufacturing, inward freight, stock true-up, no-BOM sales) in `fac` by material,
    fees / ads scaled to the books (Amazon ads inside published fees move to marketing; fees above the books capped: FY25-26 cf + S&M ₹277.6 L →
    ₹221.5 L = the P&L), booked sales the SKU data lacks in a "Not mapped (books vs SKU data)" cell; cells carry `footed`. (9) Ledger
    "Operations Platform Subscriptions" (Shopflo) + gateway charge ledgers → `pf_platform` (Platform & Payment was ₹0 in Tally months).
  - **Factory overhead** = Tally's Factory Overheads ledger where the month has it (`MonthlyMIS.factory`, `factoryBasis: 'tally'`, `SkuCell.fac`,
    `PeriodAgg.factory`); the 10 % convention only as a labelled fallback (`'assumed'`; static history keeps 10 %). Views use `cellFactory()`.
  - **BOM per month** (`pickBom`): each month prices COGS with its own BOM report (the slot pull's `periodKey`, `production.ts` month param), else the
    nearest month's (tie → earlier), shown as `completeness.bom` with a note. Meta/Google live facts (`channel: 'Meta Ads' | 'Google Ads'`) now map to D2C
    (`toSalesChannel`). MIS Sheet cash rows are labelled ₹ lakh (values were already lakh, not Cr).
- **Why it moved** (Live MIS Overview section `ov-why`, 9 Nov 2026): pure `client/src/data/misDeck/bridge.ts buildBridge()` = EBITDA bridge month vs previous month / same month last year: volume · price & product mix · channel mix · returns · other revenue, then BOM cost · stock timing (normalised basis, `stockVariance`) · factory · channel fees · ads (by platform) · payment fees · opex, in ₹ lakh with sign; steps sum to the change ("Other / rounding" if not). Missing = `not_enough_data` / unsplit step, never 0. `topReasons()` = 3 lines ≤ 10 words, no LLM. View `components/liveMis/WhyItMoved.tsx` + `whyData.ts`. Client-only (the deck is built in the browser), so the page saves the pure bridge output (numbers only) via `POST /api/mis/bridge` (`routes/misBridge.ts`, `services/bridgeSnapshot.ts`: whitelist + 60k cap, objectStore `mis/bridge-latest` + `mis/bridge-<YYYY-MM>`, one write per content hash); `GET /api/mis/bridge?month=` = MCP `mis_get_margin_bridge` (null when none, `asOf` = last save). Tests `server/test/bridge.test.ts`, `bridgeSnapshot.test.ts`.
- **Feeds & pulls (10 Nov 2026, test `server/test/feedsAndPulls.test.ts`):**
  - Amazon Sales API (`sources/amazon.ts orderMetricsFacts`): a range is asked in ≤ 365-day windows (`salesWindows`) and merged — one call over
    > 821 days failed the whole source ("Metrics Interval … exceeded limit for Granularity day"); an old window Amazon refuses is left out with a note.
  - Facts cache: every pull records `facts-status/<source>` (okAt, error, errorAt); a failed background refresh is no longer swallowed:
    `/api/connectors/facts` sources carry `staleError` / `staleErrorAt` (deck `liveFeed.sources`), and `liveFactsHealth` → Fix item
    `live:<id>` "X live numbers are N days old" (> 2 h low, ≥ 1 day medium, ≥ 3 days high; Flipkart approval wait = one low item).
  - Missing reports (`issuesInbox slotItems`, server copy of the slot list `slots/closeSlots.ts`, tested equal to the client catalog): EVERY close
    slot × unlocked month from its first stored month (else its connector's; never-loaded connectors low) to last month, missing / empty (0 rows) / partial (dates short of the month), one item per
    connector naming each slot (sig = the set of missing slot × month pairs, so Done holds until a new one goes missing); replaces the 5-slot `MANUAL_SLOTS` check (kept only as a fallback when no reports are passed).
  - Daily auto-pull (`slots/autoPull.ts`, `POST /api/connectors/auto-pull/run`, `.github/workflows/slot-auto-pull.yml`): once per IST day after
    07:00, every connected automatic slot whose pull needs no browser reader (facts / BOM costs / Trial Balance) for last month (missing, empty,
    partial, or re-pulled daily up to the 8th) and this month to date (not Amazon / Amazon Ads / Meta / Google Ads / Shopify / Flipkart, whose
    saved pull would freeze the live run-rate); saves only clean pulls (no warning, all rows in the month, finished month covered), never over an
    upload or into a locked month. Sheet / Business Report / Tally P&L stay on "Pull & save all". State `auto-pull/state`; `GET /api/connectors/auto-pull`.
- **Manual uploads (reason shown on the slot):** Flipkart settlement + Flipkart Ads FSN (API approval pending; no fees /
  ads data in its API), Blinkit payout (no API), Snapmint (no API or scheduled export; emailed), Shopflo invoice (one PDF a month: Shopflo's tools have no
  billing data).
- Tests: `npm test` (node:test via tsx, `server/test/*.test.ts`, no network; a test that reaches the object store sets
  `INGEST_STORE=local` + `INGEST_STORE_DIR` before importing it, so it never probes GCP or writes the real bucket — see
  `factsCache.test.ts`; `INGEST_STORE=local` is ignored when `K_SERVICE` is set, i.e. on Cloud Run). Checks before a push: `npm test`,
  `npm run lint` (client + server; server `no-explicit-any` is a warning only under `src/connectors/**`),
  `npm run typecheck --workspace=client|server`, `npm run build`.
- **CI** `.github/workflows/ci.yml` (every PR + push to main, Node 20 = Dockerfile): client `npm run lint` (0 errors; warnings allowed) +
  `tsc -b && vite build`, server `tsc`, `npm test`. Keep it green before merging: Cloud Build only checks after the merge.

- **Server books readers fixed (audit rounds 7 + 10, 10 Nov 2026; `connectors/tally/tbRows.ts` shared, tests `server/test/serverBooks.test.ts`):**
  TB sales / purchases exclude Stock Transfers (`salesPurchases`: v1 `months[].sales`, `fy.sales`, GM / EBITDA %, Today sales tile; GM ₹ unchanged);
  v1 balances come from the Balance Sheet builder with masters (sub-groups are `ledger` rows in a real TB; `subTotal`), loans = Loans (Liability)
  only (v1 = v2); finance cost / depreciation = leaf ledgers only (`leafDr`); Bank Charges / Interest on TDS stay opex (`other`). Cash runway,
  the `cash_runway` watch / "Cash lasts" tile and the MIS-sheet cash rows all use NET cash (bank − OD) and whole months only
  (`booksComplete`: ended + copy ≥ 5 days after month end; `netCashMonths` → `netCashFlows`, calendar neighbours only); `misCashRows(flows,
  period, today?)` on `openingNetCash` / `closingNetCash`; tiles say "books as of 2 Nov". v1 months carry `stockTransfers` + `complete`.
  A TB month without its P&L copy and no TB stock = `stockUnknown` (no Closing Stock line, no cash flow for it or the next month); the TB
  backfill pulls only months with a P&L copy (`tbBackfill`); an empty Tally answer never overwrites a stored copy (`keepCopy`). Two P&L
  copies: statements + summary read the newer (`pnlCopies.ts pickPnlCopy`, committed `savedAt` vs snapshot `asOf`); Fix item
  `pnl-copies:<m>` when their Nett Profit differs > ₹1,000. Cost buckets use the `/api/expenses` `NOT_EXPENSE` ("Sales & Marketing" =
  marketing; Direct / Indirect Expenses group rows not added to their ledgers); "After-Sales & Warranty" is not a sales ledger. Anomaly
  scan: cost spike (≥ 3× the 3-month median and ≥ ₹1 L), negative sales ledger, "sales ledger" wording; the inbox skips the running month.
  Monthly email labels its figure "Sales in stored reports" (no live Shopify).

## 5-year plan (`/planning`)
- Port of the Google Sheet "Heatronics Projection and Deployment Plan" (1j75EvRvD5mX-SSBNiwr_Lu2uhjmD-21SOpIRQz3RVUE), run live
  and extended Oct-26 → Mar-31. Engine `client/src/data/planning/engine.ts` (pure); Base = `base-plan.json`, written by
  `scripts/import-projection-plan.py <sheet.xlsx>` (re-run after the sheet changes; it also writes `base-plan-check.json`).
- `server/test/planning.test.ts` proves Base gives the sheet's own numbers for M1–M18 at an 18-month horizon (revenue, CM1–3,
  EBITDA, PAT, GST asset, inventory, NWC, cash, 12M/18M peak deficit). Keep it green when touching the engine.
- After the base: units = same month a year earlier × (1 + channel growth for that FY); lines with `repeat` run as in the same
  calendar month of the base's last 12 months; fixed amounts get inflation (+ team growth for people groups).
- Saved scenarios: `/api/planning/scenarios` (objectStore `planning-index` + `planning-scenario-<id>`), shared by everyone.
- D2C customer model (`plan.d2c`, default mode `cohorts`): D2C revenue = new buyers × AOV + repeat orders by cohort
  (same-month, next-month, months 2–11, year 2+ with fade, × seasonality × boost). In base months new buyers are back-solved
  from the sheet's D2C revenue (so parity holds); after the base they grow with the D2C growth lever. After the base, D2C ROAS
  lines pay for new-buyer revenue only (scaled by the same-month base year's new share). Rates are learned in
  `data/planning/history.ts` (seed = Shopify analytics pulled 2 Nov 2026; AOV at order time, before returns).
- `POST /api/planning/history/refresh` pages every Shopify order (READ ONLY, fields id/created_at/cancelled_at/test/total_price/
  customer) → `planning-d2c-history` (monthly new vs repeat + cohorts; NO customer ids stored; orders > ₹2 lakh skipped).
- Seasonality per SKU (`plan.skuSeason`) is learned from the sheet's "Units : Last Year" rows; lever `seasonShape: 'history'`
  makes FY29+ = last FY total × growth spread by those curves. Old saved scenarios are upgraded by `upgradePlan()`.
- **Founder decisions (Nov 2026)** = `plan.fx` (`PlanFx`, engine.ts; defaults `founderFx()` in basePlan.ts; `resolveFx()`): each is a switch
  with a test in planning.test.ts. **`fx.sheetParity` (UI: Setup → Starting point → Plan basis "Sheet parity") ignores every switch, forces monthly tax and sets placeholder
  products aside → M1–M18 equal the sheet** (tests wrap `basePlan()` with `setSheetParity`; a plan saved before `fx` has `fx` undefined = unchanged,
  "Apply the founder decisions" adds it). Switches: `gstServicesAsCost` (stuck services GST expensed in CM1, `gstServicesCost`; ≈ ₹12 Cr over 54 mo),
  `revenueExGst` (P&L on ex-GST revenue, default ON: lowers EBITDA by the output GST), GMV + ex-GST revenue always reported; `gtNetRealisation`
  (GT revenue = list less distributor margin, margin line zeroed, %-of-revenue costs still sized on list); `seed` (₹8 Cr equity, round-cost line e378
  = fee % × seed; the Ask shows "still to raise after the seed"); `opening` (cash, receivables, payables, inventory, GST asset, debt, accumulated
  losses; `opening.ts openingFromTally` maps the Sep-26 balance sheet from `/api/tally/statements`, READ ONLY); `ventureDebt` (replaces the event
  flagged `venture`: moratorium + equal instalments, own rate/fee; repayments feed `cumulativeNeed`, which sizes the Ask) and `overdraft` (interest on
  last month's negative cash) — **placeholders carry `confirmed:false`**; tax by FY with opening accumulated losses (`levers.taxMode='fy'`);
  `d2cDiscount` (% of D2C list revenue; Shopify history now records `total_discounts` per month, `discountPctOf`; AOV is grossed up so discounts aren't
  taken twice); `depreciationOnce` (new capex straight-line over `lifeYears` from the next month, D&A lines no longer inflate); `skuTweaks` (hGo/hPulse
  volume, price). Placeholder products (lotion, oil: `placeholder:true`). SKUs launched in the base's last year (hPulse, hBoots) keep their run-rate after the base.
- **Page = ONE Setup, then outputs (founder, 3 Nov 2026: "should have just 1 setup thing...and then just outputs"; contract
  `docs/planning/ONE-SETUP.md`):** `components/planning/setup/SetupPanel.tsx` = a right drawer (simplification pass 2: numbered sections, one part at a time via sub-tabs, field help in "i" popovers; output views use header tabs + sub-tabs, `components/planning/ui.tsx` PlanCard / SubTabs / Stat, Costs = one group table with a lines modal) with 11 numbered collapsible sections
  (Starting point · Assumptions · Products & categories · D2C customers & seasonality · Offline retail & stores · Team & hiring · Capacity,
  sites & capex · Funding · Targets · Business plan text · Sheet lines), each `setup/<Section>.tsx` exporting `SECTION` (`setup/types.ts`:
  `{id, title, blurb, Section, summary}`) with its pure helpers + `summary(plan)` in `data/planning/setup/<section>.ts` (tests
  `server/test/setup-*.test.ts`; `setup-sections.test.ts` checks every summary). Shared pieces `setup/shared.tsx`. Every input lives in
  Setup; the views below (`components/planning/outputs/*`: Overview, Business plan, Revenue, Costs, Monthly P&L = `PnlGrid`, Cash & funding,
  Products & customers) are read-only (no input / `update` in them — grep-checked). ONE primary button on the page: Setup → Targets →
  "Fit the plan to these targets" (`data/planning/setup/targets.ts fitToTargets` = `solvePath` or `solveForTarget`, then `fundTheGap`).
  "Plan basis" (Starting point, `setup/mode.ts planMode/setPlanMode`: Sheet parity | My plan) replaced the Sheet-parity checkbox, the
  "Growth builder on" switch and "Use my products in the plan". Funding → "Benchmarks (Indian D2C)" = `setup/fundingDefaults.ts
  FUNDING_DEFAULTS` from `docs/planning/funding-defaults.json` (research `docs/planning/D2C-RAISE-BENCHMARKS.md`, 3 Nov 2026: Series A ≈ ₹40 Cr
  at ₹40 Cr ARR, 3.5×; B ≈ ₹150 Cr at ₹150 Cr ARR, 4×; C ≈ ₹300 Cr at ₹350 Cr ARR, 4.5×; venture debt 25–30 % of a round); "Add these
  rounds as a starting point" writes `bench-` rounds that `fundTheGap` keeps. Lint: `react-refresh/only-export-components` is off for
  `setup/**` (eslint.config.js). Panel / section open state in localStorage `planning-setup-v1`.
- **Pain-care plan (founder, 3 Nov 2026)** = `data/planning/painCare.ts buildPainCarePlan(base)` (Setup → Starting point → "Load the pain-care plan",
  then Save as scenario; test `server/test/painCare.test.ts`): "Zanskar route" for 12 months — online only (Amazon, Flipkart, D2C incl. quick
  commerce, which rides in the D2C share), topicals (cream Feb-27, roll-on Apr-27, oil Jul-27) + hGo as the only device launch, sheet device
  volumes ×1.2 / hGo ×1.5 (`skuTweaks`); new lines' `chStart.G/P` and `retailStart` = `NEXT_ROUND_MONTH` (16 = Jan-28, the next round); GT /
  pharmacy+physio / MT outlets, new devices (TENS M22, massager M28, hot–cold M34), nutra and the offline team from that month; branding ₹50 L
  (placeholder) + ₹17.5 L capex in Q1; path FY29 100 → FY30 250 → FY31 500 Cr (FY28 left to the launches: a target there makes `solvePath` zero
  the topicals); Series A `bench-a` ₹35 Cr at M16 priced at 3.5 × trailing-12-month net revenue (≥ ₹50 Cr), the rest by `fundTheGap`. Known: cash
  bottoms ≈ −₹6 Cr in Nov-27 before the round — needs a bridge / earlier close.
- **Growth layer** (`plan.growth`, `data/planning/growth.ts` + hooks in `runPlan`; absent / off / sheet parity = no
  change, test `server/test/growth.test.ts`): new product lines are `plan.products` with `category` (device | topical | nutra), `inHouse`,
  `launchCost` / `launchCapex` (launch month), `marketingPct` and `growthLine`; `hires` (dept → Factory Payroll else Corporate Salaries,
  + benefits %, one-off hiring % of a year's CTC, yearly increment); `capacity` blocks (capex in month, + units and running cost after the
  lead time; utilisation = in-house units ÷ capacity, core SKUs count as in-house); `capex` items; `rounds` (equity in month, fee to
  Fundraise Costs, dilution table with the seed's `seedPreMoney`); `stores` (revenue ramp per opening, Retail Stores opex, Store Fit-out
  capex; store revenue is outside the 5 channels: `storeRevenue`). Exit ARR here = last 3 months' P&L revenue × 4 (`runRateArr`).
  `solveForTarget` scales growth lines' launch volumes to `targetArr`; `fundTheGap` sizes unconfirmed `auto-` rounds (≥ ₹15 Cr, next 12
  months above ₹5 Cr, from seed month + 3, pre-money 4× run-rate ARR, placeholder). Consumables repeat (`repeatPct` of a month's buyers
  reorder next month, kept `repeatDecay` a month; launch volume = NEW buyers). Offline `retail` types (GT / MT / pharmacy): outlets added by
  month with a ramp × units per outlet per family (split over that family's live growth lines), invoiced at list × (1 − trade margin) as
  `retailRevenue` (outside the 5 channels), schemes → Revenue Deductions, listing fee per new outlet → Channel Commission, servicing per
  outlet → Fulfilment & Delivery, material = list × cogsPct. `path` (FY → P&L revenue) + `solvePath` sets `push` per FY (× new buyers of
  growth lines). `build500Cr` = the example growth plan ₹30 → 100 → 250 → 500 Cr FY28–FY31 (all placeholders; Setup → Starting point → "Load
  the example growth plan"). Excel export mirrors the sheet: Overview, Business Plan, 1. Revenue Planning, 2. Expense Calendar, 3. P&L,
  4. Cash Flow & Fundraise (months + FY columns), Growth builder.
  Per product `chStart` / `chGrowth` (channel starts its month, its share grows by its own rate a year; units = launch volume × live
  shares) and `retailStart`. Hires with `scale {by: revenue|units|outlets, every, type?}` = max(count, ceil(metric / every)) from last
  month's ARR / units or this month's outlets, never shrinking, hiring cost on each increase. `overheads` (site: sq ft × rent + running,
  deposit → Intangibles & Deposits, fit-out → Plant & Machinery; fixed ₹/mo escalating yearly; % of list revenue). `funding` rules feed
  `fundTheGap`; `roundStats` = cash before, burn / mo (next 12) and runway per round.
- **Products & categories** (Setup section; `setup/Products.tsx`, pure `data/planning/setup/products.ts`): categories
  (`growth.categories: CategoryDef[]`, defaults `defaultCategories()` device / topical / nutra; add / rename / remove when empty) → products
  in each ("+ Add product") → per-product volumes and expenses. A product leaves a field unset to inherit its category (`resolveProduct`:
  material %, marketing %, repeat, kept, in-house, channel split). Volume = launch + growth, or `unitsByFy` (typed units per FY, spread over
  the months on sale × seasonality; `push` skips typed years). `expenses: ProductExpense[]` (oneoff / capex in the start month, monthly from
  start with + % a year until `end`, pct = share of the product's revenue) → group `EXPENSE_GROUP[kind]` unless set (opex group "Product
  Running Costs"). Current sheet SKUs = "Current range" (skuTweaks). Excel: categories, typed units and product expenses on the Growth
  builder sheet. Tests in `server/test/growth.test.ts`.
- Business Plan + Overview (`plan.business`, `data/planning/summary.ts`): headline 12M/18M/full, Exit ARR (TTM × min(L3M ÷ same
  3M a year earlier, cap 2); pre-plan prior = `exitPriorL3M`), The Ask (peak deficit × (1 + contingency) − venture debt; 12M uses
  `business.contingency12`, 18M/full `cash.contingencyPct`), use of funds + capital deployment from lines tagged with a milestone,
  assumptions / risks / themes & milestones / team text. Tested against the sheet (Exit ARR, equity 12M/18M, deployment by theme).
- **Plan vs actual (Planning → "Plan vs actual", 9 Nov 2026):** the Base (or a saved) plan is the budget, Live MIS months are the actuals.
  Pure `client/src/data/planning/planVsActual.ts` (byte-identical copy `server/src/planning/planVsActual.ts`, test-checked): per month plan, actual,
  gap ₹ / %, status (within 5% = on track / behind / ahead), no data = null never 0, the running month AND a finished month whose books
  are not complete (`ActualMonth.complete` = `isCompleteMonth`, else level full; state `partial`, 10 Nov 2026) shown but not counted, year to date, exit
  ARR pace (last 3 closed months × 4 vs plan, gap carried to FY end), behind list. Deck side `planVsActualLive.ts` (normalised basis; units from
  SkuCells). View `components/planning/outputs/PlanVsActual.tsx`. Server: `GET /api/planning/vs-actual?scenario=` (MCP `mis_get_plan_vs_actual`);
  Base plan months = generated `server/src/planning/basePlanMonths.ts` (`node --import tsx scripts/export-base-plan-months.ts`; test fails when stale);
  a saved scenario carries `summary` months written by the Planning page on Save (older scenarios: open + Save once); actuals = what the browser last
  stored (`POST /api/planning/actuals`, written when the view opens), because the deck is built client side. Tests `server/test/planVsActual.test.ts`.

## Morning page (`/today`, 9 Nov 2026; home since 11 Nov 2026)
`GET /api/today` (`routes/today.ts`, pure `services/morningBrief.ts`, test `test/morningBrief.test.ts`; manifest tool `mis_get_morning_brief`): status (act / watch / ok), 5 tiles (net cash, months of cash, sales, to fix, tasks late), "Needs you" (Tally watch items + open Fix items + late / due-today tasks, high first), "What changed" vs the last saved day, "Coming up". Stored data only, no AI. The first read of each IST day saves ONE small snapshot `morning/snap-<day>` (+ `morning/index`, last 45 days). Page `pages/today/TodayPage.tsx` (11 Nov 2026 layout: 5 KPI tiles, then "Do these first" as a numbered list beside "What changed" and "Due soon"; 1 screen).

## Cash runway (`/accounts/cash-runway`, 9 Nov 2026)
`GET /api/cash/runway` (`routes/cash.ts`, pure `services/cashRunway.ts`, test `test/cashRunway.test.ts`; manifest tool `mis_get_cash_runway`): net cash now (newest TB, bank − overdraft) moved forward 13 weeks at the last ≤ 3 months' change in NET cash less new loans (`netCashFlows`, from consecutive stored TBs) — Usual (average), Worst month repeats, Best month repeats. GST / salaries / suppliers are inside that pattern (no extra lump). Week each case goes below zero / reaches the overdraft limit. `PUT /api/cash/settings {odLimit}` (store `cash/settings`). Stored books only; NOT a sales forecast (says so on the page).

## Page owners + sources (9 Nov 2026)
Every sidebar page names its owner (role + person where known), how often and what to do: `PAGE_OWNER` in `client/src/nav/config.ts`, shown in the page's About "i" popover by `PageHeader` (test: every sidebar page has one, `server/test/nav.test.ts`). Every number says where it comes from and when it last updated: `components/ui/SourceChip.tsx` (pill "Tally books · 3 h ago", popover with each source + notes; amber past `staleAfterH`). Notes and page status live in the chip / a header status pill, not in banners; inline boxes only for blocking errors.
