# heatronics-mis-reporting

## Login
Every page and API needs a Heatronics login. server/src/htxGate.ts (mounted in server/src/index.ts) asks the master portal
(`https://portal.heatronics.in/api/auth/check?portal=mis`) whether the visitor's `htx_session`
cookie may open this tool (cached 60s), and otherwise redirects to the portal's login or "no access"
page (APIs get 401/403 JSON). The `.run.app` address redirects to mis.heatronics.in.
Who has access is managed at https://portal.heatronics.in/admin (Hargun only).
Endpoints that skip the login (machine callers with their own token): `/api/work/reminders/run`, `/api/ownership/reminders/run` (cron) and `/api/expenses` (read by production.heatronics.in, own token). Never add pages there.
Set `HTX_GATE=off` only for local testing; never on Cloud Run.


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
  - Amazon Ads · Advertised Product → reporting v3 `spAdvertisedProduct` (groupBy advertiser, DAILY) + `sbCampaigns` /
    `sdCampaigns` totals (SKU-less channel spend, as the upload) via `pullAdvertisedProduct()` in `sources/amazonAds.ts` (same
    guard: GET or POST /reporting/reports). Months older than Amazon keeps (SP 94 d, SB/SD 59 d) are refused → upload.
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
  - Easebuzz · Settlement / MDR → `POST https://dashboard.easebuzz.in/payout/v1/retrieve` (form: merchant_key, merchant_email,
    payout_date DD-MM-YYYY, hash = SHA-512 `key|email|date|salt`), one call per day. Optional shared secrets
    `easebuzz-merchant-key`, `easebuzz-salt`, `easebuzz-merchant-email`; missing = "Not connected — add key + salt". Endpoint, hash
    order and answer field names UNVERIFIED (mapper reads several key names).
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
- **Claude task:** Tranzact · BOM pricing — "Tranzact monthly BOM + template import" (18th, Production portal); MIS has no
  cross-portal read yet, so upload it here.
- **Manual uploads (reason shown on the slot):** Tally P&L (Tally on cloud doesn't expose its XML port yet — ask Thakur Hardsoft to
  open port 9000), Tally trial balance (optional screenshot), Flipkart settlement + Flipkart Ads FSN (API approval pending; no fees /
  ads data in its API), Blinkit payout (no API), Snapmint (no API or scheduled export; emailed), Shopflo invoice (one PDF a month),
  Amazon Business Report (optional; only a createReport), Shopify variant sales (fallback only —
  Shopify is live).
- Tests: `npm test` (node:test via tsx, `server/test/*.test.ts`, no network).
