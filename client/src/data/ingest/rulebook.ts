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
    note: 'Per channel from each marketplace / D2C source.' },
  { key: 'cogm', label: 'COGM (Cost of Goods Manufactured)', kind: 'cost', owner: 'bom',
    formula: 'Σ (BOM cost/unit × units sold) + 10% factory overhead',
    note: 'Unit cost from Tranzact BOM, joined to units sold per SKU. Reconciled to Tally RM/factory ledgers.' },
  { key: 'gross_margin', label: 'Gross Margin', kind: 'margin', owner: 'derived',
    formula: 'Net Revenue − COGM' },
  { key: 'channel_fulfilment', label: 'Channel & Fulfilment', kind: 'cost', owner: 'connectors',
    formula: 'Marketplace commissions + FBA/shipping fees + freight out',
    note: 'From Amazon/Blinkit/Flipkart settlements (commissions) and Shiprocket/Delhivery (freight).' },
  { key: 'cm1', label: 'CM1', kind: 'margin', owner: 'derived', formula: 'Gross Margin − Channel & Fulfilment' },
  { key: 'sales_marketing', label: 'Sales & Marketing', kind: 'cost', owner: 'connectors',
    formula: 'Ad spend (Meta + Google + Amazon Ads)',
    note: 'The MER denominator. Amazon Ads may also arrive inside the settlement file.' },
  { key: 'cm2', label: 'CM2 (Contribution Margin)', kind: 'margin', owner: 'derived', formula: 'CM1 − Sales & Marketing',
    note: 'The deepest line connectors + BOM can produce on their own — fully live.' },
  { key: 'platform_payment', label: 'Platform & Payment (Brand Investment)', kind: 'cost', owner: 'connectors',
    formula: 'Payment-gateway MDR + checkout + BNPL subvention + brand/agency spend',
    note: 'From Easebuzz / Shopflo / Snapmint; brand-investment share comes from Tally.' },
  { key: 'cm3', label: 'CM3', kind: 'margin', owner: 'derived', formula: 'CM2 − Platform & Payment' },
  { key: 'opex', label: 'Operating Expenses', kind: 'cost', owner: 'tally',
    formula: 'Payroll + professional + admin + warranty + welfare + bank − other income',
    note: 'Exists only in Tally. Read from the P&L screenshot, mapped ledger-by-ledger.' },
  { key: 'ebitda', label: 'EBITDA', kind: 'margin', owner: 'derived', formula: 'CM3 − Operating Expenses' },
  { key: 'non_operating', label: 'Non-Operating + Cost of Fundraising', kind: 'cost', owner: 'tally',
    formula: 'Finance cost + depreciation/amortisation + one-time + fundraising',
    note: 'Tally only.' },
  { key: 'net_income', label: 'Net Income', kind: 'margin', owner: 'derived', formula: 'EBITDA − Non-Operating − Cost of Fundraising',
    note: 'Reconciled against Tally’s own Nett Profit (tolerance ₹1).' },
];

// ---- Wiring status, told honestly ----
// live          = pulled automatically by API, always current
// wired         = upload parser exists and feeds the MIS
// fixture-ready = a sample file exists; parser can be wired without waiting on you
// needs-sample  = waiting on one real export from you to build the parser
export type Wiring = 'live' | 'wired' | 'fixture-ready' | 'needs-sample';

export const WIRING_LABEL: Record<Wiring, string> = {
  live: 'Live API',
  wired: 'Wired',
  'fixture-ready': 'Sample ready',
  'needs-sample': 'Needs one export',
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
  summary: string;     // one line: what this source is for
  files: FileRule[];
}

export const CONNECTOR_RULES: ConnectorRule[] = [
  // ---------------- Book of record ----------------
  {
    connectorId: 'tally', label: 'Tally Prime', group: 'Book of record', wiring: 'wired',
    summary: 'The book of record. Owns everything below Contribution Margin — OPEX, EBITDA, Net Income — and reconciles the whole cascade.',
    files: [
      {
        slotId: 'pnl', label: 'Profit & Loss A/c (screenshot)', required: true, cadence: 'Weekly / each close',
        reads: 'Every ledger row and its hierarchy, read by the Claude vision model (credits negative, debits positive), plus the Nett Profit.',
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
    connectorId: 'tranzact', label: 'Tranzact (ERP / BOM)', group: 'Book of record', wiring: 'wired',
    summary: 'Standard cost per finished good — the per-unit COGS that turns SKU revenue into margin.',
    files: [
      {
        slotId: 'bom', label: 'BOM pricing export', required: true, cadence: 'When costs change',
        reads: 'FG Item ID, BOM number, BOM name, Total FG Cost — for finished goods (FG-####) only; lowest BOM number wins per FG.',
        destinations: [
          { line: 'COGM', dimension: 'Per SKU → all channels', rule: 'Cost/unit × units sold, + 10% factory overhead, summed to COGM on every SKU and channel that sells that FG.' },
        ],
        exclusions: 'Non-FG rows and accessories (COGS forced to 0).',
      },
    ],
  },

  // ---------------- Marketplaces ----------------
  {
    connectorId: 'amazon', label: 'Amazon Seller Central', channel: 'Amazon', group: 'Marketplace', wiring: 'wired',
    summary: 'The fee-accurate money view of the Amazon channel — revenue, units, orders, fees and ad spend.',
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
    connectorId: 'flipkart', label: 'Flipkart Seller', channel: 'Flipkart', group: 'Marketplace', wiring: 'needs-sample',
    summary: 'Flipkart channel revenue and commission — once a settlement export is provided.',
    files: [
      {
        slotId: 'settlement', label: 'Settlement / commission', required: true, cadence: 'Weekly',
        reads: 'Per order/SKU: settled value, commission, collection/shipping fees. (Parser built on your first export.)',
        destinations: [
          { line: 'Net Revenue', dimension: 'Flipkart · per SKU', rule: 'Settled sale value → Flipkart net revenue.' },
          { line: 'Channel & Fulfilment', dimension: 'Flipkart', rule: 'Commission + collection + shipping fees → channel fees.' },
        ],
      },
    ],
  },
  {
    connectorId: 'blinkit', label: 'Blinkit (Quick Commerce)', channel: 'Blinkit', group: 'Marketplace', wiring: 'fixture-ready',
    summary: 'Blinkit channel — gross bill and all the commission/shipping charges from the order-level payout.',
    files: [
      {
        slotId: 'order-charges', label: 'Payout — order-level charges', required: true, cadence: 'Weekly',
        reads: 'Per item: total gross bill, commission + commission GST, shipping + shipping GST.',
        destinations: [
          { line: 'Net Revenue', dimension: 'Blinkit · per SKU', rule: 'Total gross bill amount per item → Blinkit net revenue.' },
          { line: 'Channel & Fulfilment', dimension: 'Blinkit · per SKU', rule: 'Commission + commission GST + shipping + shipping GST → channel fees.' },
        ],
      },
    ],
  },

  // ---------------- D2C ----------------
  {
    connectorId: 'shopify', label: 'Shopify (D2C)', channel: 'D2C', group: 'D2C', wiring: 'live',
    summary: 'The D2C channel, pulled live by API — revenue, units and orders per SKU, per day. No upload needed.',
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
    connectorId: 'meta', label: 'Meta Ads', group: 'Marketing', wiring: 'needs-sample',
    summary: 'D2C ad spend — the Sales & Marketing line and the MER denominator.',
    files: [
      {
        slotId: 'ad-spend', label: 'Ads spend by day', required: true, cadence: 'Weekly',
        reads: 'Amount spent by day (and campaign, if present).',
        destinations: [{ line: 'Sales & Marketing', dimension: 'D2C · by day', rule: 'Amount spent → D2C ad spend.' }],
      },
    ],
  },
  {
    connectorId: 'googleads', label: 'Google Ads', group: 'Marketing', wiring: 'needs-sample',
    summary: 'D2C ad spend — adds to Sales & Marketing.',
    files: [
      {
        slotId: 'ad-spend', label: 'Campaign spend by day', required: true, cadence: 'Weekly',
        reads: 'Cost by campaign, segmented by day.',
        destinations: [{ line: 'Sales & Marketing', dimension: 'D2C · by day', rule: 'Cost → D2C ad spend.' }],
      },
    ],
  },
  {
    connectorId: 'amazonads', label: 'Amazon Ads', channel: 'Amazon', group: 'Marketing', wiring: 'needs-sample',
    summary: 'Amazon ad spend — the fuller Sponsored Products view that supersedes the settlement’s ad lines.',
    files: [
      {
        slotId: 'ad-spend', label: 'Sponsored ads report', required: true, cadence: 'Weekly',
        reads: 'Spend by day (and campaign/SKU, if present).',
        destinations: [{ line: 'Sales & Marketing', dimension: 'Amazon · by day', rule: 'Spend → Amazon ad spend; when present, replaces the "cost of advertising" lines in the settlement file to avoid double-count.' }],
      },
    ],
  },

  // ---------------- Logistics ----------------
  {
    connectorId: 'shiprocket', label: 'Shiprocket', group: 'Logistics', wiring: 'wired',
    summary: 'Outbound freight across channels — part of Channel & Fulfilment.',
    files: [
      {
        slotId: 'passbook', label: 'Wallet passbook', required: true, cadence: 'Weekly',
        reads: 'Dated freight and shipping charges (negative amounts in the passbook).',
        destinations: [{ line: 'Channel & Fulfilment', dimension: 'Allocated across channels', rule: 'Freight out → fulfilment, allocated across channels by their order/units share.' }],
        exclusions: 'Wallet top-ups and COD remittances (money in, not a cost).',
      },
    ],
  },
  {
    connectorId: 'delhivery', label: 'Delhivery', group: 'Logistics', wiring: 'needs-sample',
    summary: 'Freight / remittance — adds to Channel & Fulfilment.',
    files: [
      {
        slotId: 'freight', label: 'Freight / billing', required: true, cadence: 'Weekly',
        reads: 'Freight charges by shipment/date. (Parser built on your first export.)',
        destinations: [{ line: 'Channel & Fulfilment', dimension: 'Allocated across channels', rule: 'Freight → fulfilment, allocated by channel share.' }],
      },
    ],
  },

  // ---------------- Payments & checkout ----------------
  {
    connectorId: 'easebuzz', label: 'Easebuzz', group: 'Payments & checkout', wiring: 'needs-sample',
    summary: 'Payment-gateway MDR — part of Platform & Payment.',
    files: [
      {
        slotId: 'settlement', label: 'Settlement / MDR', required: true, cadence: 'Weekly',
        reads: 'Settled amount and MDR / gateway fee per settlement.',
        destinations: [{ line: 'Platform & Payment (Brand Investment)', dimension: 'D2C', rule: 'MDR / gateway fee → Platform & Payment.' }],
      },
    ],
  },
  {
    connectorId: 'shopflo', label: 'Shopflo', group: 'Payments & checkout', wiring: 'needs-sample',
    summary: 'Checkout settlement fees — part of Platform & Payment.',
    files: [
      {
        slotId: 'settlement', label: 'Checkout settlement', required: true, cadence: 'Weekly',
        reads: 'Settled amount and checkout fee per settlement.',
        destinations: [{ line: 'Platform & Payment (Brand Investment)', dimension: 'D2C', rule: 'Checkout fee → Platform & Payment.' }],
      },
    ],
  },
  {
    connectorId: 'snapmint', label: 'Snapmint', group: 'Payments & checkout', wiring: 'needs-sample',
    summary: 'BNPL subvention / fees — part of Platform & Payment.',
    files: [
      {
        slotId: 'settlement', label: 'Settlement / subvention', required: true, cadence: 'Weekly',
        reads: 'Disbursed amount and subvention / fee per settlement.',
        destinations: [{ line: 'Platform & Payment (Brand Investment)', dimension: 'D2C', rule: 'Subvention + fee → Platform & Payment.' }],
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
  { sheet: 'Overview', what: 'Headline KPIs — Net Revenue, Gross Margin %, CM2, EBITDA, Net Income, top channel.',
    feeds: 'The consolidated cascade for the selected period. Below-CM2 lines show only within the complete-through window.' },
  { sheet: 'Channels', what: 'Net revenue, mix %, and the full cascade split per channel (D2C, Amazon, Blinkit, Flipkart, OEM, Offline).',
    feeds: 'Revenue + fees + ad spend per channel from each source; company totals hold, only the split changes.' },
  { sheet: 'SKU', what: 'Per-SKU revenue, units, COGM, and contribution (to CM2).',
    feeds: 'SKU-level revenue/units from marketplaces + Shopify, joined to BOM cost/unit for COGM.' },
  { sheet: 'SKU × Channel', what: 'The product × channel contribution matrix to CM2.',
    feeds: 'SKU-level facts crossed with channel; ad spend split by measured SKU ad-mix, else revenue share.' },
  { sheet: 'P&L', what: 'The full company cascade, Net Revenue → Net Income, periods as columns.',
    feeds: 'Connectors + BOM for the top (through CM2); Tally for OPEX and below; reconciled to Nett Profit.' },
  { sheet: 'MIS Sheet', what: 'The Masterchow line-item statement (₹ Lac) per entity.',
    feeds: 'Same consolidated cascade, re-laid-out; cash/funding/runway rows stay manual until wired.' },
];

// ---- The completeness rule ----
export const COMPLETENESS_RULE = {
  headline: 'How far the MIS is fully live',
  body:
    'The MIS is “complete” through the latest period in which every REQUIRED source has been uploaded. ' +
    'That floor is the earliest “data through” date across all required connectors (plus BOM and the Tally P&L for the below-CM2 lines). ' +
    'Up to the floor, every line — down to Net Income — is real and reconciled. ' +
    'Past the floor, the view shows only the lines whose sources are in, and flags the rest as incomplete. ' +
    'Keep every source current weekly and the floor moves forward with you.',
};
