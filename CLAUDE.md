# heatronics-mis-reporting

## Login
Every page and API needs a Heatronics login. server/src/htxGate.ts (mounted in server/src/index.ts) asks the master portal
(`https://portal.heatronics.in/api/auth/check?portal=mis`) whether the visitor's `htx_session`
cookie may open this tool (cached 60s), and otherwise redirects to the portal's login or "no access"
page (APIs get 401/403 JSON). The `.run.app` address redirects to mis.heatronics.in.
Who has access is managed at https://portal.heatronics.in/admin (Hargun only).
Endpoints that skip the login (machine callers with their own token): `/api/work/reminders/run`, `/api/ownership/reminders/run` (cron) and `/api/expenses` (read by production.heatronics.in, own token). Never add pages there.
Set `HTX_GATE=off` only for local testing; never on Cloud Run.


## Design & menu
- Same design system as Ops: `design-system/heatronics-mis/MASTER.md` (tokens in `client/src/index.css`, Tailwind names
  map onto them: slate/gray = neutral, white = surface, brand = accent indigo, `bg-cta text-on-cta` = the one primary
  action; light / dark / system theme). No gradients, no raw hex in components, scrims `bg-scrim/x`.
- Menu = `client/src/nav/config.ts` only (sidebar `components/shell/AppNav.tsx`, ⌘K `CommandPalette`, breadcrumbs in
  `PageHeader`). Adding a page = a route in `App.tsx` + a line in nav/config; `server/test/nav.test.ts` checks both.

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
  **Calendar v2** (`closeCalendar.ts`, `CALENDAR_VERSION` 2): `cal-m10-mis` = the five no-API uploads + lock (checklist); new
  `cal-m02-stock` "Closing stock into Tally" with `live: 'amazon-stock'` → `AmazonStockPanel` on the task: `GET /api/stock/amazon?month=`
  (`routes/stock.ts`: Ops `amz_ledger_daily_fc_latest` balances for both month ends via `sources/opsBq.ts opsQuery` + Production costs
  incl. `conversion`) → pure `client/src/data/stock/amazonStock.ts buildValuation` (per FG via `skuToFgMapping`, sellable + unsellable +
  FC-to-FC transit, value = units × (material + conversion), nearest earlier day warned, unmapped SKUs unvalued) + Excel. Brand account
  only (Supernode's stock is theirs). Test `server/test/amazonStock.test.ts`. **Setup = ONE list** (founder, 3 Nov 2026: "three classifications per connector, no duplicates"): every connector card tagged
  Connected (API) / Automated (Claude) / Manual upload (`feedOf` in `ConnectorsPage.tsx`: any `upload` slot → manual, else any `claude_task` /
  `claudeTask` → Claude, else API), filter chips by tag, the card's drawer holds its upload steppers (manual first, automatic as fallback) +
  credentials; "Where we are" + "Pull & save all" on top. No Uploads tab: `?view=uploads#<connector>` and `/reporting/mis/ingest` still open
  that connector's drawer; Round planner under Tools; Data rulebook palette-only. Sidebar: one scrolling list, current page in view.
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
    are `@deprecated` and unused. Tests `server/test/normalisedCogm.test.ts`.
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
  - **Tie** (`completeness.tie`, Tally-backed live months): Tally Nett Profit vs the cascade's net income (engine residual) + per channel
    connector sales ex-GST vs Tally's channel sales ledgers (Amazon, D2C/Shopify, Flipkart, Blinkit, GT, B2B). Residual > 1% of net revenue
    (`TIE_LIMIT_PCT`) = breach: locking needs a written reason (server 422 without), kept on the lock. Channels with no connector are shown, not judged.
  - **GMV vs ex-GST**: facts may carry `gmv` (customer-paid incl. GST) and `netExGst`. Shopify `fetchFacts` fills both (`shopifyLineSales`: `taxes_included`
    + line `tax_lines`); Amazon Sales-API facts carry `gmv` only (no tax split → ex-GST ESTIMATED at 18 %, labelled); Finances/settlement and
    other feeds are taken as booked (Principal is ex-GST). `revenue` itself is unchanged.
  - **Channel P&L** (`anchoredChannelPnl` → `tallyAnchoredRows`) where Tally exists: revenue = Tally channel ledgers; channel fees / marketing /
    platform = connector-attributed `tallyLines.byChannel` + revenue share of the unattributed rest (foots to Tally); COGM by BOM-COGS share; opex and
    non-operating by revenue share (Tally books them company-wide). Months without Tally keep the order-share split (`row.basis`).
  - **Factory overhead** = Tally's Factory Overheads ledger where the month has it (`MonthlyMIS.factory`, `factoryBasis: 'tally'`, `SkuCell.fac`,
    `PeriodAgg.factory`); the 10 % convention only as a labelled fallback (`'assumed'`; static history keeps 10 %). Views use `cellFactory()`.
  - **BOM per month** (`pickBom`): each month prices COGS with its own BOM report (the slot pull's `periodKey`, `production.ts` month param), else the
    nearest month's (tie → earlier), shown as `completeness.bom` with a note. Meta/Google live facts (`channel: 'Meta Ads' | 'Google Ads'`) now map to D2C
    (`toSalesChannel`). MIS Sheet cash rows are labelled ₹ lakh (values were already lakh, not Cr).
- **Manual uploads (reason shown on the slot):** Flipkart settlement + Flipkart Ads FSN (API approval pending; no fees /
  ads data in its API), Blinkit payout (no API), Snapmint (no API or scheduled export; emailed), Shopflo invoice (one PDF a month: Shopflo's tools have no
  billing data).
- Tests: `npm test` (node:test via tsx, `server/test/*.test.ts`, no network).

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
  `docs/planning/ONE-SETUP.md`):** `components/planning/setup/SetupPanel.tsx` = a collapsible card with 11 numbered collapsible sections
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
