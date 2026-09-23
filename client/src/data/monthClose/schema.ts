// ----------------------------------------------------------------------------
// Month close — canonical schema.
//
// Everything the ingest dashboard touches normalises to two shapes:
//
//   LedgerNode[]  a flat, depth-tagged rendering of the Tally tree (or of a
//                 platform export). Screenshots, xlsx and manual entry all
//                 produce this, so downstream code never learns where a number
//                 came from — only what it is and how far to trust it.
//
//   FieldValue    a number plus its Provenance. Nothing reaches the cascade
//                 without one, which is what lets the UI block a close on
//                 figures a human has not confirmed.
//
// The bucket vocabulary mirrors MonthlyMIS in misDeckData.ts exactly, so emit
// is a rename rather than a translation.
// ----------------------------------------------------------------------------

import type { SalesChannel } from '../misDeck/misDeckData';

/** Where a figure came from, and how far it can be trusted without a human. */
export type IngestMethod = 'xlsx' | 'vision' | 'manual' | 'derived';

/**
 * exact     — read from a machine-readable cell, or computed from such cells.
 * read      — lifted off an image by the vision model. Never usable until confirmed.
 * estimated — filled by a convention (e.g. factory overhead at 10% of revenue).
 */
export type Confidence = 'exact' | 'read' | 'estimated';

export interface Provenance {
  /** Stable id of the uploaded source this came from; 'manual' for typed entry. */
  sourceId: string;
  sourceLabel: string;
  method: IngestMethod;
  confidence: Confidence;
  /**
   * True once a human has eyeballed the figure against its source. Figures with
   * confidence 'read' or 'estimated' start false and gate the close; 'exact'
   * figures are born verified.
   */
  verified: boolean;
  /** Free text surfaced next to the number — anomalies, drill-down notes. */
  note?: string;
}

export interface FieldValue {
  value: number;
  provenance: Provenance;
}

/** One row of a Tally group summary or P&L drill-down, flattened. */
export interface LedgerNode {
  /** Ledger or group name exactly as Tally prints it. */
  name: string;
  /** Indent level in the source. 0 = top-level group. */
  depth: number;
  /** Ancestor names, outermost first. Used to disambiguate repeated leaf names. */
  path: string[];
  /** Signed rupees, Tally's own sign: income and debits positive as printed. */
  amount: number;
  /** Tally group this sits under, when the source names it. */
  group?: string;
  /** False for rollup rows whose amount is the sum of their children. */
  isLeaf: boolean;
  provenance: Provenance;
}

// ---- Close lines -----------------------------------------------------------

/**
 * Which part of the cascade a ledger feeds. These map 1:1 onto MonthlyMIS
 * fields; `contra` and `ignore` are the two escapes that produce no line.
 */
export type Bucket =
  | 'revenue'
  | 'cogm'
  | 'fulfillment'
  | 'marketing'
  | 'platform'
  | 'opex'
  | 'otherIncome'
  | 'nonOperating'
  | 'fundraising'
  | 'contra'
  | 'ignore';

export interface CloseLine {
  key: string;
  label: string;
  bucket: Bucket;
  /** Set for revenue lines so netByChannel can be built without a lookup table. */
  channel?: SalesChannel;
  /** Where this normally comes from — shown in the UI as the fetch instruction. */
  source: string;
  /** Shown under the source when the line has a convention attached. */
  hint?: string;
}

export interface CloseGroup {
  title: string;
  blurb: string;
  lines: CloseLine[];
}

/**
 * The month's line taxonomy. Order is display order; `key` is the contract with
 * the ledger map and must stay stable once a month has been closed against it.
 */
export const CLOSE_GROUPS: CloseGroup[] = [
  {
    title: '1 · Revenue by channel',
    blurb: 'Net external sales per channel, after returns and before internal transfers.',
    lines: [
      { key: 'rev_d2c', label: 'D2C / Shopify', bucket: 'revenue', channel: 'D2C', source: 'Tally → Sales Accounts → D2C Sales' },
      { key: 'rev_amazon', label: 'Amazon / Ecommerce', bucket: 'revenue', channel: 'Amazon', source: 'Tally → Sales Accounts → Ecommerce Sales' },
      { key: 'rev_oem', label: 'OEM', bucket: 'revenue', channel: 'OEM', source: 'Tally → Sales Accounts → OEM Sales' },
      { key: 'rev_offline', label: 'Offline', bucket: 'revenue', channel: 'Offline', source: 'Tally → Sales Accounts → Offline Sales' },
      { key: 'rev_blinkit', label: 'Blinkit / Quick Commerce', bucket: 'revenue', channel: 'Blinkit', source: 'Tally → Sales Accounts → Quick Commerce Sales', hint: 'Can be net negative when credit notes exceed sales' },
      { key: 'rev_export', label: 'Export', bucket: 'revenue', channel: 'Export', source: 'Tally → Sales Accounts → Export Sales' },
      { key: 'rev_str', label: 'Stock transfers (internal)', bucket: 'contra', source: 'Tally → Sales Accounts → Stock Transfers', hint: 'Contra — stripped from both sales and purchases' },
    ],
  },
  {
    title: '2 · COGM',
    blurb: 'Materials, factory and conversion, plus the stock movement that turns purchases into cost of goods made.',
    lines: [
      { key: 'cogm_rm', label: 'Raw material purchases', bucket: 'cogm', source: 'Tally → Purchase Accounts → Raw Material Purchases' },
      { key: 'cogm_str_in', label: 'Stock transfer (inward)', bucket: 'contra', source: 'Tally → Purchase Accounts → Stock Transfer', hint: 'Contra — nets against the sales-side transfer' },
      { key: 'cogm_factory', label: 'Factory overheads', bucket: 'cogm', source: 'Tally → Direct Expenses → Factory Overheads' },
      { key: 'cogm_mfg', label: 'Manufacturing costs (job work, wages, addl. charges)', bucket: 'cogm', source: 'Tally → Direct Expenses → Manufacturing Costs' },
      { key: 'cogm_freight_in', label: 'Inward freight', bucket: 'cogm', source: 'Tally → Direct Expenses → Inward Freight' },
      { key: 'cogm_open', label: 'Opening stock', bucket: 'ignore', source: 'Tally → Trading A/c → Opening Stock', hint: 'Feeds stock movement; not a line of its own' },
      { key: 'cogm_close', label: 'Closing stock', bucket: 'ignore', source: 'Tally → Trading A/c → Closing Stock', hint: 'Feeds stock movement; not a line of its own' },
    ],
  },
  {
    title: '3 · Channel & fulfilment → CM1',
    blurb: 'Marketplace fees, outbound freight and payment costs.',
    lines: [
      { key: 'ff_channel_fees', label: 'Channel fees & commissions', bucket: 'fulfillment', source: 'Tally → Indirect Expenses → Channel Fees & Commissions' },
      { key: 'ff_shipping', label: 'Shipping charges', bucket: 'fulfillment', source: 'Tally → Indirect Expenses → Shipping Charges' },
      { key: 'ff_freight_out', label: 'Freight outward (Porter / transport)', bucket: 'fulfillment', source: 'Tally → Indirect Expenses → Freight Outward Exp.' },
    ],
  },
  {
    title: '4 · Sales & marketing → CM2',
    blurb: 'All paid media and agency cost. Should tie to the platform ad exports.',
    lines: [
      { key: 'sm_total', label: 'Sales & marketing', bucket: 'marketing', source: 'Tally → Indirect Expenses → Sales & Marketing' },
    ],
  },
  {
    title: '5 · Platform / brand → CM3',
    blurb: 'Brand investment and platform costs carried below CM2.',
    lines: [
      { key: 'pf_platform', label: 'Platform / brand investment', bucket: 'platform', source: 'Tally → Indirect Expenses (brand / content agency)', hint: 'June convention: Content Creation – Agency sits here' },
    ],
  },
  {
    title: '6 · Operating expenses → EBITDA',
    blurb: 'Indirect cost below the contribution lines.',
    lines: [
      { key: 'op_payroll', label: 'Payroll (employee cost – indirect)', bucket: 'opex', source: 'Tally → Indirect Expenses → Employee Cost', hint: 'Take the debit total; a net credit means a reversal — drill in before accepting' },
      { key: 'op_professional', label: 'Professional fees', bucket: 'opex', source: 'Tally → Indirect Expenses → Professional Fees' },
      { key: 'op_admin', label: 'Admin & general expenses', bucket: 'opex', source: 'Tally → Indirect Expenses → Admin & General' },
      { key: 'op_warranty', label: 'After-sales & warranty', bucket: 'opex', source: 'Tally → Indirect Expenses → After-Sales & Warranty' },
      { key: 'op_welfare', label: 'Staff welfare', bucket: 'opex', source: 'Tally → Indirect Expenses → Staff Welfare' },
      { key: 'op_bank', label: 'Bank charges', bucket: 'opex', source: 'Tally → Indirect Expenses → Bank Charges' },
      { key: 'op_finadj', label: 'Financial adjustments (net)', bucket: 'opex', source: 'Tally → Indirect Expenses → Financial Adjustments' },
      { key: 'op_other_income', label: 'Other income (indirect incomes)', bucket: 'otherIncome', source: 'Tally → Indirect Incomes', hint: 'Reduces operating expense' },
    ],
  },
  {
    title: '7 · Below EBITDA',
    blurb: 'Finance cost, depreciation and one-time items.',
    lines: [
      { key: 'nl_nonoperating', label: 'Non-operating (finance, D&A, one-time)', bucket: 'nonOperating', source: 'Tally → Indirect Expenses (finance cost, depreciation)' },
      { key: 'nl_fundraising', label: 'Cost of fundraising', bucket: 'fundraising', source: 'Tally → Business Development Expenses', hint: 'Carved out of non-operating for display' },
    ],
  },
];

/** Flat index of every line by key. */
export const CLOSE_LINES: Record<string, CloseLine> = Object.fromEntries(
  CLOSE_GROUPS.flatMap((g) => g.lines.map((l) => [l.key, l] as const)),
);

export const CLOSE_LINE_KEYS = Object.keys(CLOSE_LINES);

/** The Tally figure a close must tie back to, and the gap it is allowed to carry. */
export interface TallyAnchor {
  /** Nett Profit (positive) or Nett Loss (negative) exactly as the P&L screen prints it. */
  nettProfit: FieldValue | null;
}

/** Rupees of unexplained variance a close may carry before it is blocked. */
export const RECONCILE_TOLERANCE = 1;

// ---- Session ---------------------------------------------------------------

export interface UploadedSource {
  id: string;
  label: string;
  kind: SourceKind;
  method: IngestMethod;
  /** ISO timestamp of the upload. */
  addedAt: string;
  /** Rows the adapter lifted out, before mapping. */
  nodes: LedgerNode[];
  /** Adapter-level complaints — unreadable regions, totals that do not foot. */
  warnings: string[];
}

export type SourceKind =
  | 'tallyPnl'
  | 'tallyGroupSummary'
  | 'channelRevenue'
  | 'adSpend'
  | 'skuPnl';

export const SOURCE_KINDS: { kind: SourceKind; label: string; accepts: string; what: string }[] = [
  { kind: 'tallyPnl', label: 'Tally P&L A/c', accepts: '.xlsx, .png, .jpg', what: 'The P&L screen for the month — drives the whole cascade.' },
  { kind: 'tallyGroupSummary', label: 'Tally group summary', accepts: '.xlsx, .png, .jpg', what: 'Drill-downs for any group you need split (Employee Cost, Channel Fees).' },
  { kind: 'channelRevenue', label: 'Channel revenue', accepts: '.xlsx, .csv', what: 'Per-channel net sales when you would rather not take them off Tally.' },
  { kind: 'adSpend', label: 'Ad spend export', accepts: '.xlsx, .csv', what: 'Meta / Google / Amazon spend, to check Sales & Marketing ties out.' },
  { kind: 'skuPnl', label: 'SKU-level P&L', accepts: '.xlsx, .csv', what: 'Per-SKU revenue and cost feeding skuChannelPnl.' },
];

export interface MonthCloseSession {
  /** e.g. "2026-07". */
  periodKey: string;
  /** e.g. "Jul 2026". */
  periodLabel: string;
  sources: UploadedSource[];
  /** Ledger name (joined path) → close line key, for this month's overrides. */
  overrides: Record<string, string>;
  /** Line key → value, for anything typed rather than ingested. */
  manual: Record<string, FieldValue>;
  anchor: TallyAnchor;
  /** Free text that lands in the restated note. */
  notes: string;
}

export function emptySession(periodKey = '', periodLabel = ''): MonthCloseSession {
  return {
    periodKey,
    periodLabel,
    sources: [],
    overrides: {},
    manual: {},
    anchor: { nettProfit: null },
    notes: '',
  };
}

/** Provenance for a figure the user typed in themselves. */
export function manualProvenance(note?: string): Provenance {
  return {
    sourceId: 'manual',
    sourceLabel: 'Typed in',
    method: 'manual',
    confidence: 'exact',
    verified: true,
    note,
  };
}
