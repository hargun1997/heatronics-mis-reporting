// ----------------------------------------------------------------------------
// The Data Rulebook — the single, explicit statement of how every number in the
// MIS gets there. For each connector: the file(s) we take in, exactly what we
// read from each, and WHERE each figure lands in the P&L cascade and on which
// sheet. Plus the cascade itself (who owns each line), the per-sheet feeds, and
// the "complete through" rule that decides how far the MIS is fully live.
//
// This module is the source of truth for the in-app Rulebook page AND the
// contract the ingestion wiring implements. If a rule changes, change it here.
// ----------------------------------------------------------------------------

import { ALL_SLOTS } from './catalog';

// ---- Who owns each line of the cascade ----
// connectors = marketplace / D2C / ads / logistics / payments uploads (or live pull)
// bom        = Tranzact standard cost → COGM
// tally      = Tally P&L screenshot → the book-of-record below-the-line costs
// derived    = computed from the lines above it
export type LineOwner = 'connectors' | 'bom' | 'tally' | 'derived';

export interface CascadeLine {
  key: string;
  label: string;
  kind: 'revenue' | 'cost' | 'margin';
  owner: LineOwner;
  formula?: string;
  note?: string;
}

// The full P&L cascade, top to bottom — the structure Live MIS mirrors.
export const CASCADE: CascadeLine[] = [
  { key: 'net_revenue', label: 'Net Revenue', kind: 'revenue', owner: 'connectors',
    formula: 'Σ channel net revenue (gross − returns − channel margin − GST − discounts)',
    note: 'For each channel, from its marketplace or D2C report.' },
  { key: 'cogm', label: 'COGM (Cost of Goods Manufactured)', kind: 'cost', owner: 'bom',
    formula: 'Σ (BOM cost/unit × units sold) + 10% factory overhead',
    note: 'Unit cost from the Tranzact BOM × units sold for each SKU. Checked against the Tally RM and factory ledgers.' },
  { key: 'gross_margin', label: 'Gross Margin', kind: 'margin', owner: 'derived',
    formula: 'Net Revenue − COGM' },
  { key: 'channel_fulfilment', label: 'Channel & Fulfilment', kind: 'cost', owner: 'connectors',
    formula: 'Marketplace commissions + FBA/shipping fees + freight out',
    note: 'Commissions from the Amazon, Blinkit and Flipkart settlements. Freight from Shiprocket and Delhivery.' },
  { key: 'cm1', label: 'CM1', kind: 'margin', owner: 'derived', formula: 'Gross Margin − Channel & Fulfilment' },
  { key: 'sales_marketing', label: 'Sales & Marketing', kind: 'cost', owner: 'connectors',
    formula: 'Ad spend (Meta + Google + Amazon Ads)',
    note: 'The MER denominator. Amazon Ads can also come in the settlement file.' },
  { key: 'cm2', label: 'CM2 (Contribution Margin)', kind: 'margin', owner: 'derived', formula: 'CM1 − Sales & Marketing',
    note: 'The last line that reports and the BOM make without Tally. It is fully live.' },
  { key: 'platform_payment', label: 'Platform & Payment (Brand Investment)', kind: 'cost', owner: 'connectors',
    formula: 'Payment-gateway MDR + checkout + BNPL subvention + brand/agency spend',
    note: 'From Easebuzz, Shopflo and Snapmint. The brand investment part comes from Tally.' },
  { key: 'cm3', label: 'CM3', kind: 'margin', owner: 'derived', formula: 'CM2 − Platform & Payment' },
  { key: 'opex', label: 'Operating Expenses', kind: 'cost', owner: 'tally',
    formula: 'Payroll + professional + admin + warranty + welfare + bank − other income',
    note: 'Only in Tally. Read from the P&L, 1 ledger at a time.' },
  { key: 'ebitda', label: 'EBITDA', kind: 'margin', owner: 'derived', formula: 'CM3 − Operating Expenses' },
  { key: 'non_operating', label: 'Non-Operating + Cost of Fundraising', kind: 'cost', owner: 'tally',
    formula: 'Finance cost + depreciation/amortisation + one-time + fundraising',
    note: 'Tally only.' },
  { key: 'net_income', label: 'Net Income', kind: 'margin', owner: 'derived', formula: 'EBITDA − Non-Operating − Cost of Fundraising',
    note: 'Checked against the Tally Nett Profit (limit ₹1).' },
];

// ---- Wiring status, told honestly ----
// live          = pulled automatically by API, always current
// wired         = upload parser exists and feeds the MIS
// fixture-ready = a sample file exists; parser can be wired without waiting on you
// needs-sample  = waiting on one real export from you to build the parser
export type Wiring = 'live' | 'wired' | 'fixture-ready' | 'needs-sample';

export const WIRING_LABEL: Record<Wiring, string> = {
  live: 'Live API',
  wired: 'Upload',
  'fixture-ready': 'Sample ready',
  'needs-sample': 'Needs 1 export',
};

// Per-connector build progress — the three things each source needs before it
// is fully live: its ids mapped into the MIS, its export steps written, and its
// rule (what we do with the data) defined. The rule is always defined below;
// mapping and steps are tracked here and shown as the progress checklist.
export type Ready = 'done' | 'partial' | 'todo' | 'na';
export const READY_LABEL: Record<Ready, string> = {
  done: 'Done', partial: 'In progress', todo: 'To do', na: 'N/A',
};

export interface Destination {
  line: string;        // cascade line label this figure lands on
  dimension: string;   // the grain it carries (channel / SKU / blended)
  rule: string;        // the mapping rule, in plain words
}

export interface FileRule {
  slotId: string;
  label: string;
  required: boolean;
  cadence: string;     // how often you upload it
  reads: string;       // what we extract from the file
  destinations: Destination[];
  exclusions?: string; // what we deliberately drop (to avoid double-count)
}

export interface ConnectorRule {
  connectorId: string;
  label: string;
  channel?: string;    // the MIS channel it maps to (if a revenue source)
  group: 'Book of record' | 'Marketplace' | 'D2C' | 'Marketing' | 'Logistics' | 'Payments & checkout';
  wiring: Wiring;
  /** Chronological order we wired it (1-based). Absent = still queued. */
  seq?: number;
  /** Have we figured how its ids map into the MIS (SKU→FG / channel / ledger)? */
  mapping: Ready;
  // Steps readiness is derived from the catalog (stepsFor / stepsReady), so it
  // can never drift from the actual export steps + deep links.
  /** What is still half-left on this resource — the honest to-do, kept per source. */
  pending?: string;
  summary: string;     // one line: what this source is for
  files: FileRule[];
}

// ---- Steps-as-a-checklist, derived from the catalog -------------------------
// Every uploadable source's steps should carry a deep link straight to its
// export screen. Tally (desktop Tally Prime) and Shopify (live API) have no web
// export URL, so a link is not expected there.
const LINK_EXEMPT = new Set<string>(['tally', 'shopify']);

/** What the steps checklist shows for one connector: written? linked? */
export function stepsFor(connectorId: string): { steps: boolean; link: boolean; linkExpected: boolean } {
  const slots = ALL_SLOTS.filter((s) => s.connectorId === connectorId);
  const required = slots.filter((s) => s.required);
  const consider = required.length ? required : slots;
  const steps = consider.some((s) => s.exportSteps?.length);
  const link = consider.some((s) => s.exportUrl);
  return { steps, link, linkExpected: !LINK_EXEMPT.has(connectorId) };
}

/** Overall steps readiness: done only when steps exist AND a link does (unless exempt). */
export function stepsReady(connectorId: string): Ready {
  const { steps, link, linkExpected } = stepsFor(connectorId);
  if (!steps) return 'todo';
  if (!linkExpected) return 'done';
  return link ? 'done' : 'partial';
}

export const CONNECTOR_RULES: ConnectorRule[] = [
  // ---------------- Book of record ----------------
  {
    connectorId: 'tally', label: 'Tally Prime', group: 'Book of record', wiring: 'wired', mapping: 'done', pending: 'Upload the P&L A/c Excel (Detailed) at each close. This fills OPEX to Net Income. Desktop app, no link.',
    summary: 'The book of record. It gives all lines below CM2 (OPEX, EBITDA, Net Income) and checks the full P&L.',
    files: [
      {
        slotId: 'pnl', label: 'Profit & Loss A/c (Excel)', required: true, cadence: 'Monthly / each close',
        reads: 'Every ledger read exactly from the Detailed P&L Excel (income & debits positive) plus the Nett Profit. A multi-month export carries each month — set the Period to pick which to ingest.',
        destinations: [
          { line: 'Operating Expenses', dimension: 'Company', rule: 'Payroll, professional, admin, warranty, welfare, bank ledgers → OPEX (less other income).' },
          { line: 'Platform & Payment (Brand Investment)', dimension: 'Company', rule: 'Content / agency / brand-investment ledgers → Brand Investment.' },
          { line: 'Non-Operating + Cost of Fundraising', dimension: 'Company', rule: 'Finance cost, depreciation, one-time, and business-development (fundraising) ledgers.' },
          { line: 'COGM', dimension: 'Company', rule: 'RM purchases, factory overhead, manufacturing, inward freight and stock movement reconcile the connector/BOM COGM.' },
          { line: 'Net Income', dimension: 'Company', rule: 'Nett Profit is the anchor every computed line is tied back to (tolerance ₹1).' },
        ],
      },
      {
        slotId: 'trial-balance', label: 'Trial Balance (optional)', required: false, cadence: 'As needed',
        reads: 'Full ledger balances, same vision path — used as a cross-check on the P&L.',
        destinations: [{ line: 'Net Income', dimension: 'Company', rule: 'Cross-check only; does not post on its own.' }],
      },
    ],
  },
  {
    connectorId: 'tranzact', label: 'Tranzact (ERP / BOM / GT·B2B sales)', group: 'Book of record', wiring: 'wired', seq: 1, mapping: 'done', pending: 'Upload the BOM again when costs change. Upload the Sales Invoice Register each month.',
    summary: 'Standard cost for each finished good. SKU sales for the 2 channels with no other report (GT, B2B).',
    files: [
      {
        slotId: 'bom', label: 'BOM pricing export', required: true, cadence: 'When costs change',
        reads: 'FG Item ID, BOM number, BOM name, Total FG Cost — for finished goods (FG-####) only; lowest BOM number wins per FG.',
        destinations: [
          { line: 'COGM', dimension: 'Per SKU → all channels', rule: 'Cost/unit × units sold, + 10% factory overhead, summed to COGM on every SKU and channel that sells that FG.' },
        ],
        exclusions: 'Non-FG rows and accessories (COGS forced to 0).',
      },
      {
        slotId: 'sales', label: 'Sales Invoice Register (Item-wise)', required: true, cadence: 'Monthly',
        reads: 'Per invoice line: channel from the invoice prefix (OEM/ → B2B; GTD/GTR/PHY → GT), Item ID → FG, Invoice Quantity → units, Item Value before tax → revenue.',
        destinations: [
          { line: 'Net Revenue', dimension: 'GT / B2B · per SKU', rule: 'The SKU split for GT and B2B — the two channels with no platform connector. GT ties to Tally Offline Sales, B2B to Tally OEM Sales (Tally is the channel total; this gives the per-SKU bifurcation).' },
        ],
        exclusions: 'Freight / non-FG invoice lines.',
      },
    ],
  },

  // ---------------- Marketplaces ----------------
  {
    connectorId: 'amazon', label: 'Amazon Seller Central', channel: 'Amazon', group: 'Marketplace', wiring: 'wired', seq: 2, mapping: 'done', pending: 'Add the direct link to the Seller Central transaction export.',
    summary: 'Amazon money with exact fees: revenue, units, orders, fees and ad spend.',
    files: [
      {
        slotId: 'unified-transaction', label: 'Unified Transaction (settlement)', required: true, cadence: 'Weekly',
        reads: 'Per SKU: product sales + shipping/giftwrap credits + promo rebates (revenue); selling + FBA + other fees. Plus "cost of advertising" rows and storage/removal fees.',
        destinations: [
          { line: 'Net Revenue', dimension: 'Amazon · per SKU', rule: 'Sales + shipping + gift-wrap + rebates per SKU → Amazon net revenue.' },
          { line: 'Channel & Fulfilment', dimension: 'Amazon · per SKU', rule: 'Selling + FBA + other transaction fees → channel fees; storage/removals → channel fees (unallocated).' },
          { line: 'Sales & Marketing', dimension: 'Amazon', rule: '"Cost of advertising" lines → Amazon ad spend (unless the Amazon Ads report supersedes it).' },
        ],
        exclusions: 'Bank payout / transfer lines (money movement, not P&L).',
      },
      {
        slotId: 'business-report', label: 'Business Report (traffic, optional)', required: false, cadence: 'As needed',
        reads: 'Sessions and units by child SKU — gross of refunds, no fees.',
        destinations: [{ line: '—', dimension: 'Amazon · per SKU', rule: 'Conversion/traffic context only. Never posts to the P&L (the settlement file is the money truth).' }],
      },
    ],
  },
  {
    connectorId: 'flipkart', label: 'Flipkart Seller', channel: 'Flipkart', group: 'Marketplace', wiring: 'wired', seq: 13, mapping: 'done', pending: 'Upload the Settled Transactions report each month. Flipkart is a separate channel, as Amazon is.',
    summary: 'Flipkart net revenue and marketplace fees, from Settled Transactions.',
    files: [
      {
        slotId: 'settlement', label: 'Settled Transactions', required: true, cadence: 'Monthly',
        reads: 'The "Orders" sheet, per Seller SKU: net revenue = Sale Amount − returns; marketplace fee = commission + fixed + collection + shipping (shown as a negative deduction). A fully-returned month nets to zero.',
        destinations: [
          { line: 'Net Revenue', dimension: 'Flipkart · per SKU', rule: 'Net settled sale value (sale − returns) → Flipkart net revenue.' },
          { line: 'Channel & Fulfilment', dimension: 'Flipkart · per SKU', rule: 'Marketplace fee (commission + fixed + collection + shipping) → Flipkart channel fees. GST on fees + TCS/TDS excluded (recoverable).' },
        ],
      },
    ],
  },
  {
    connectorId: 'flipkartads', label: 'Flipkart Ads (PLA/PCA)', channel: 'Flipkart', group: 'Marketing', wiring: 'wired', seq: 14, mapping: 'done', pending: 'Upload the Consolidated FSN report each month (PLA, and PCA if you run it).',
    summary: 'Flipkart ad spend for each product. Part of Sales & Marketing.',
    files: [
      {
        slotId: 'ad-spend', label: 'Consolidated FSN report', required: true, cadence: 'Monthly',
        reads: 'Per Sku Id: Ad Spend. Sku Ids are the same text keys as the settlement Seller SKU, so they map to finished goods via the Flipkart SKU map.',
        destinations: [{ line: 'Sales & Marketing', dimension: 'Flipkart · per product', rule: 'Each Sku Id → FG → measured per-product ad on its Flipkart SKU; counted once in the Flipkart S&M total (the settlement carries no lumped ad).' }],
      },
    ],
  },
  {
    connectorId: 'blinkit', label: 'Blinkit (Quick Commerce)', channel: 'Blinkit', group: 'Marketplace', wiring: 'wired', seq: 7, mapping: 'done', pending: 'Upload the SoA each month. New catalog item ids map when they first come in.',
    summary: 'Blinkit gross bill and all commission and shipping charges, from the payout for each order.',
    files: [
      {
        slotId: 'order-charges', label: 'Payout · order-level charges', required: true, cadence: 'Weekly',
        reads: 'The "Forward & Return Orders" sheet — per order line: item id, order date, gross bill, net deductions, TCS/TDS. Returns carry the opposite sign.',
        destinations: [
          { line: 'Net Revenue', dimension: 'Blinkit · per SKU', rule: 'Total gross bill amount per item → Blinkit net revenue, by order date.' },
          { line: 'Channel & Fulfilment', dimension: 'Blinkit · per SKU', rule: 'Fees = net deductions − TCS − TDS (commission + GST + shipping + GST). TCS/TDS are tax withheld on the seller\'s behalf, recoverable — not a cost.' },
        ],
      },
    ],
  },

  // ---------------- D2C ----------------
  {
    connectorId: 'shopify', label: 'Shopify (D2C)', channel: 'D2C', group: 'D2C', wiring: 'live', seq: 4, mapping: 'done', pending: 'Live API pull. No upload. The upload slot is only a fallback.',
    summary: 'D2C revenue, units and orders for each SKU and day, pulled live through the API.',
    files: [
      {
        slotId: 'variant-sales', label: 'Sales by variant (manual fallback)', required: false, cadence: 'Only if the live pull is down',
        reads: 'Per variant: net items sold, net sales. Blank variant SKU falls back to the product title.',
        destinations: [
          { line: 'Net Revenue', dimension: 'D2C · per SKU', rule: 'Net sales per variant → D2C net revenue (overrides the live pull for that period).' },
        ],
      },
    ],
  },

  // ---------------- Marketing ----------------
  {
    connectorId: 'meta', label: 'Meta Ads', channel: 'D2C', group: 'Marketing', wiring: 'wired', seq: 6, mapping: 'done', pending: 'Upload each month. All 19 catalog ids agree with Shopify.',
    summary: 'D2C ad spend for each product. It gives Sales & Marketing and the MER denominator.',
    files: [
      {
        slotId: 'ad-spend', label: 'Ad spend · campaign × ad set × product', required: true, cadence: 'Weekly',
        reads: 'The "By Product" export: amount spent per catalog product id, plus the grand-total row (the true month spend).',
        destinations: [
          { line: 'Sales & Marketing', dimension: 'D2C · per product', rule: 'Each product id → FG → measured per-product ad on its D2C SKU; sum = the product-attributed spend.' },
          { line: 'Sales & Marketing', dimension: 'D2C · blended', rule: 'Residual (grand total − attributed, spend Meta could not tie to a product) → spread across D2C products by revenue, so per-SKU ad foots to the true total.' },
        ],
      },
    ],
  },
  {
    connectorId: 'googleads', label: 'Google Ads', channel: 'D2C', group: 'Marketing', wiring: 'wired', seq: 10, mapping: 'done', pending: 'Upload the campaign report each month. Optional: add the Shopping products report for exact spend by product.',
    summary: 'D2C ad spend. It adds to Sales & Marketing, split to D2C products by revenue.',
    files: [
      {
        slotId: 'ad-spend', label: 'Campaign report (total spend)', required: true, cadence: 'Weekly',
        reads: 'The "Total: Account" row — the month\'s total Google spend; the date comes from the report\'s range header.',
        destinations: [{ line: 'Sales & Marketing', dimension: 'D2C · blended', rule: 'Total cost → D2C ad spend, spread across D2C products by revenue (Search has no product; Shopping/PMax per-item is the optional report).' }],
      },
      {
        slotId: 'shopping-products', label: 'Shopping products (optional)', required: false, cadence: 'Weekly',
        reads: 'Per Item ID: cost — for Shopping / Performance Max only.',
        destinations: [{ line: 'Sales & Marketing', dimension: 'D2C · per product', rule: 'Item id → FG → measured per-product Google spend; the rest (Search) stays revenue-allocated.' }],
      },
    ],
  },
  {
    connectorId: 'amazonads', label: 'Amazon Ads', channel: 'Amazon', group: 'Marketing', wiring: 'wired', seq: 3, mapping: 'done', pending: 'Upload the real September Advertised Product report (the test used the October export). Add the direct link.',
    summary: 'Amazon ad spend from Sponsored Products. It replaces the ad lines in the settlement.',
    files: [
      {
        slotId: 'ad-spend', label: 'Advertised Product report', required: true, cadence: 'Weekly',
        reads: 'Total cost per advertised SKU (base MSKU); Sponsored Brands/Display rows carry no SKU.',
        destinations: [{ line: 'Sales & Marketing', dimension: 'Amazon · per SKU', rule: 'Per-SKU cost → base MSKU → FG → measured per-SKU Amazon ad; SKU-less rows stay channel-level. When present, replaces the settlement\'s "cost of advertising" lines to avoid double-count.' }],
      },
    ],
  },

  // ---------------- Logistics ----------------
  {
    connectorId: 'shiprocket', label: 'Shiprocket', channel: 'D2C', group: 'Logistics', wiring: 'wired', seq: 5, mapping: 'done', pending: 'Upload the passbook export each month.',
    summary: 'D2C outbound freight. Part of Channel & Fulfilment.',
    files: [
      {
        slotId: 'passbook', label: 'Wallet passbook', required: true, cadence: 'Weekly',
        reads: 'Dated freight/shipping charges (debit rows only). Heatronics ships only D2C via Shiprocket, so untagged rows are D2C; a channel-order-id suffix (…-Amazon / -Blinkit / -Flipkart) reassigns the rare exception.',
        destinations: [{ line: 'Channel & Fulfilment', dimension: 'D2C · per SKU', rule: 'Freight out → D2C fulfilment, allocated across D2C SKUs by units.' }],
        exclusions: 'Wallet top-ups / recharges and COD remittances (credits — money in, not a cost).',
      },
    ],
  },
  {
    connectorId: 'delhivery', label: 'Delhivery', channel: 'D2C', group: 'Logistics', wiring: 'wired', seq: 12, mapping: 'done', pending: 'Upload the wallet report each month.',
    summary: 'D2C warranty and returns freight. An after-sales cost below CM2 (Platform & Payment).',
    files: [
      {
        slotId: 'wallet', label: 'Wallet report', required: true, cadence: 'Monthly',
        reads: 'Delhivery is the returns/replacement (warranty) courier for D2C (RET-/REP- shipments). Net freight = Deductions − Refunds by day (the money column is "Miles").',
        destinations: [{ line: 'Platform & Payment (Brand Investment)', dimension: 'D2C · blended', rule: 'Warranty/returns freight is an after-sales cost → Platform & Payment (below CM2), not the Channel & Fulfilment of the original sale. Blended at the month level (not smeared onto forward-sale SKUs).' }],
        exclusions: 'The "AWB Deductions"/"AWB Refunds" sheets (per-AWB duplicates of the same totals) and "Recharges" (wallet top-ups — money in, not a cost).',
      },
    ],
  },

  // ---------------- Payments & checkout ----------------
  {
    connectorId: 'easebuzz', label: 'Easebuzz', group: 'Payments & checkout', wiring: 'wired', seq: 8, mapping: 'done', pending: 'Upload the settlement export each month.',
    summary: 'D2C payment gateway MDR. Part of Platform & Payment.',
    files: [
      {
        slotId: 'settlement', label: 'Settlement / MDR', required: true, cadence: 'Weekly',
        reads: 'Per settlement: service charge + GST + express service charge + express tax (the gateway cut), by settlement date.',
        destinations: [{ line: 'Platform & Payment (Brand Investment)', dimension: 'D2C · blended', rule: 'Gateway fee → Platform & Payment. Revenue is counted via Shopify, so only the fee is taken (no double-count); a gateway charges the basket, not a SKU.' }],
      },
    ],
  },
  {
    connectorId: 'shopflo', label: 'Shopflo', channel: 'D2C', group: 'Payments & checkout', wiring: 'wired', seq: 11, mapping: 'done', pending: 'Upload the invoice PDF each month. Claude reads it (uses AI).',
    summary: 'D2C checkout invoice (PDF). Part of Platform & Payment.',
    files: [
      {
        slotId: 'invoice', label: 'Checkout invoice (PDF)', required: true, cadence: 'Monthly',
        reads: 'Claude reads the invoice PDF: taxable amount + GST = the checkout cost; TDS withheld is recoverable and excluded. Dated to the billing cycle.',
        destinations: [{ line: 'Platform & Payment (Brand Investment)', dimension: 'D2C · blended', rule: 'Checkout fee (taxable + GST) → Platform & Payment. Revenue is counted via Shopify, so only the fee is taken; TDS excluded (recoverable).' }],
      },
    ],
  },
  {
    connectorId: 'snapmint', label: 'Snapmint', channel: 'D2C', group: 'Payments & checkout', wiring: 'wired', seq: 9, mapping: 'done', pending: 'Upload the group settlement report each month.',
    summary: 'D2C BNPL (EMI) subvention and fees. Part of Platform & Payment.',
    files: [
      {
        slotId: 'settlement', label: 'Settlement / subvention', required: true, cadence: 'Weekly',
        reads: 'Per settled EMI order: subvention + merchant closing fee + P&S charges + cashback take-rate + GST, by settlement date. Cancellations carry no fee.',
        destinations: [{ line: 'Platform & Payment (Brand Investment)', dimension: 'D2C · blended', rule: 'Subvention + fees → Platform & Payment as a finance cost (not a discount off revenue). Revenue is counted via Shopify, so only the cost is taken; TCS/TDS excluded.' }],
      },
    ],
  },
];

// ---- What feeds each sheet/tab of the MIS ----
export interface SheetRule {
  sheet: string;
  what: string;
  feeds: string;
}

export const SHEET_RULES: SheetRule[] = [
  { sheet: 'Overview', what: 'Main KPIs: Net Revenue, Gross Margin %, CM2, EBITDA, Net Income, top channel.',
    feeds: 'The full P&L for the selected period. Lines below CM2 show only for complete months.' },
  { sheet: 'Channels', what: 'Net revenue, mix % and the full P&L for each channel (D2C, Amazon, Blinkit, Flipkart, OEM, Offline).',
    feeds: 'Revenue, fees and ad spend for each channel from its reports. Company totals do not change. Only the split changes.' },
  { sheet: 'SKU', what: 'Revenue, units, COGM and contribution (to CM2) for each SKU.',
    feeds: 'SKU revenue and units from the marketplaces and Shopify, × BOM cost for each unit for COGM.' },
  { sheet: 'SKU × Channel', what: 'Contribution to CM2 for each product and channel.',
    feeds: 'SKU data for each channel. Ad spend splits by the measured SKU ad mix, else by revenue share.' },
  { sheet: 'P&L', what: 'The full company P&L, Net Revenue to Net Income, 1 column for each period.',
    feeds: 'Reports and the BOM to CM2. Tally for OPEX and below. Checked against the Nett Profit.' },
  { sheet: 'MIS Sheet', what: 'The Masterchow line statement (₹ Lac) for each entity.',
    feeds: 'The same full P&L in a different layout. Cash, funding and runway rows are manual until connected.' },
];

// ---- The completeness rule ----
export const COMPLETENESS_RULE = {
  headline: 'How far the MIS is complete',
  body:
    'The MIS is complete to the last month in which all required reports are in. ' +
    'That month is the earliest "data to" date of all required reports, the BOM and the Tally P&L. ' +
    'Up to that month, all lines to Net Income are real and checked. ' +
    'After that month, the MIS shows only the lines that have their reports, and marks the other lines as not complete. ' +
    'Upload all reports each week to move that month forward.',
  /** The same rule as numbered steps (Data rulebook, P&L lines tab). */
  steps: [
    'The MIS is complete to the last month in which all required reports are in.',
    'That month is the earliest "data to" date of all required reports, the BOM and the Tally P&L.',
    'Up to that month, all lines to Net Income are real and checked.',
    'After that month, the MIS shows only lines that have their reports. It marks the other lines as not complete.',
    'Upload all reports each week to move that month forward.',
  ],
};
