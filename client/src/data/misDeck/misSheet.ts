// "MIS Sheet" — the company/channel P&L in the line-item structure of the
// target MIS format (Masterchow layout): Gross Revenue → … → CM1/2/3 → EBITDA,
// months as columns grouped by fiscal year, values in ₹ Lac. Everything is
// derived from the bundled MONTHLY_MIS + the channel-P&L allocation, so the
// rows that Heatronics actually tracks are filled and the rest stay blank.

import {
  SALES_CHANNELS,
  DISCOUNT_DATA,
  type SalesChannel,
} from './misDeckData';
import {
  monthlySeries,
  channelPnl,
  adSpendForPeriod,
  ordersByChannel,
  fiscalYear,
  channelLabel,
  type PeriodMIS,
} from './analytics';
import { PUBLISHED_MONTHS } from './publishedBasis';
import { belowEbitda } from './auditTie';

export type MisEntity = 'company' | SalesChannel;

/** One month's worth of MIS line items, in ₹ (not Lac). null = not tracked. */
export interface MisPoint {
  qty: number | null;
  grossRevenue: number | null;
  channelMargin: number | null;
  returns: number | null;
  gst: number | null;
  ssClaim: number | null;
  discounts: number | null;
  netRevenue: number | null;
  cogs: number | null;
  grossMargin: number | null;
  /**
   * Normalised COGM basis only (memo): Tally's booked COGM − (BOM cost of the units sold + factory overhead) for
   * the period; positive = stock built / purchase timing, negative = drawdown. null on the actual basis and for
   * months that could not be normalised.
   */
  stockVariance: number | null;
  logistics: number | null;
  cm1: number | null;
  marketing: number | null;
  cm2: number | null;
  branding: number | null;
  cm3: number | null;
  payroll: number | null;
  profFee: number | null;
  otherExpense: number | null;
  otherIncome: number | null;
  /** Year-end audit adjustment (auditTie.ts): + = less cost than the workbook. null = none. */
  auditTrueUp: number | null;
  ebitda: number | null;
  /** Below EBITDA, before tax: interest, depreciation, fundraising cost (company only). */
  nonOperating: number | null;
  /** Profit before tax (company only). */
  pbt: number | null;
  /** Current + deferred tax (charge positive). null = no tax line in the books for the period ("no data"). */
  tax: number | null;
  /** Net income = profit after tax (company only). */
  netIncome: number | null;
  openingCash: number | null;
  funding: number | null;
  closingCash: number | null;
  cashBurn: number | null;
  ebitdaBurn: number | null;
  runway: number | null;
  /** Set on a multi-month total whose cash rows cover only some of its months ("Oct–Nov"); absent = all months. */
  cashMonths?: string | null;
}

/** The numeric fields of a MisPoint (everything but the `cashMonths` label). */
export type MisNumKey = Exclude<keyof MisPoint, 'cashMonths'>;
const MIS_POINT_KEYS: MisNumKey[] = [
  'qty', 'grossRevenue', 'channelMargin', 'returns', 'gst', 'ssClaim', 'discounts',
  'netRevenue', 'cogs', 'grossMargin', 'stockVariance', 'logistics', 'cm1', 'marketing', 'cm2',
  'branding', 'cm3', 'payroll', 'profFee', 'otherExpense', 'otherIncome', 'auditTrueUp', 'ebitda',
  'nonOperating', 'pbt', 'tax', 'netIncome', 'openingCash', 'funding', 'closingCash', 'cashBurn', 'ebitdaBurn', 'runway',
];

// A row of the statement. `pct` rows render as %, others as ₹ Lac. `bold` marks
// the margin subtotal lines. `get` returns the value in ₹ (or a fraction for pct).
export interface MisSheetRow {
  label: string;
  pct?: boolean;
  bold?: boolean;
  /** Plain count (rendered as an integer, not ₹ Lac). */
  count?: boolean;
  /** Decimals for a count row (default 0): runway in quarters shows 1.6, not 2. */
  decimals?: number;
  /** Memo line (signed, outside the cascade), rendered muted / italic. */
  memo?: boolean;
  /** Cash / burn row: always ₹ Lac, also in the "% of net revenue" view (a cash balance is not a share of revenue). */
  cash?: boolean;
  get: (pt: MisPoint) => number | null;
}

const ratio = (a: number | null, b: number | null): number | null =>
  a !== null && b ? a / b : null;

export const MIS_SHEET_ROWS: MisSheetRow[] = [
  { label: 'Qty', count: true, get: (p) => p.qty },
  { label: 'Gross Revenue', get: (p) => p.grossRevenue },
  { label: 'Channel Margin', get: (p) => p.channelMargin },
  { label: 'Returns', get: (p) => p.returns },
  { label: 'GST', get: (p) => p.gst },
  { label: 'SS Claim', get: (p) => p.ssClaim },
  { label: 'Discounts (Promo)', get: (p) => p.discounts },
  { label: 'Net Revenue', bold: true, get: (p) => p.netRevenue },
  { label: 'Net Revenue %', pct: true, get: (p) => ratio(p.netRevenue, p.grossRevenue) },
  { label: 'COGS', get: (p) => p.cogs },
  { label: 'Gross Margin', bold: true, get: (p) => p.grossMargin },
  { label: 'GM%', pct: true, get: (p) => ratio(p.grossMargin, p.netRevenue) },
  { label: 'Logistics', get: (p) => p.logistics },
  { label: 'CM1', bold: true, get: (p) => p.cm1 },
  { label: 'CM1%', pct: true, get: (p) => ratio(p.cm1, p.netRevenue) },
  { label: 'Marketing', get: (p) => p.marketing },
  { label: 'CM2', bold: true, get: (p) => p.cm2 },
  { label: 'CM2%', pct: true, get: (p) => ratio(p.cm2, p.netRevenue) },
  { label: 'Brand Investment', get: (p) => p.branding },
  { label: 'CM3', bold: true, get: (p) => p.cm3 },
  { label: 'CM3%', pct: true, get: (p) => ratio(p.cm3, p.netRevenue) },
  { label: 'Payroll Costs', get: (p) => p.payroll },
  { label: 'Professional Fee', get: (p) => p.profFee },
  { label: 'Other Expense', get: (p) => p.otherExpense },
  { label: 'Other income', get: (p) => p.otherIncome },
  { label: 'Audit true-up (audit adjustment)', get: (p) => p.auditTrueUp },
  { label: 'EBITDA', bold: true, get: (p) => p.ebitda },
  { label: 'EBITDA%', pct: true, get: (p) => ratio(p.ebitda, p.netRevenue) },
  { label: 'Interest, depreciation & other', get: (p) => p.nonOperating },
  { label: 'Profit before tax', bold: true, get: (p) => p.pbt },
  { label: 'Tax (incl. deferred)', get: (p) => p.tax },
  { label: 'Net income', bold: true, get: (p) => p.netIncome },
  { label: 'Opening Cash Balance (₹ lakh)', cash: true, get: (p) => p.openingCash },
  { label: 'Funding (equity)', cash: true, get: (p) => p.funding },
  { label: 'Closing Cash Balance (₹ lakh)', cash: true, get: (p) => p.closingCash },
  { label: 'Total Cash Burn', cash: true, get: (p) => p.cashBurn },
  { label: 'EBITDA Burn', cash: true, get: (p) => p.ebitdaBurn },
  { label: 'Runway (Qtr)', count: true, decimals: 1, get: (p) => p.runway },
];

/** The memo line the normalised COGM basis adds right under GM% (Live MIS). */
export const STOCK_VARIANCE_ROW: MisSheetRow = {
  label: 'Stock build / drawdown (purchase timing)', memo: true, get: (p) => p.stockVariance,
};

/** MIS_SHEET_ROWS with the stock build / drawdown memo line under GM% — the normalised COGM basis. */
export const MIS_SHEET_ROWS_NORMALISED: MisSheetRow[] = MIS_SHEET_ROWS.flatMap((r) => (r.label === 'GM%' ? [r, STOCK_VARIANCE_ROW] : [r]));

// ----------------------------------------------------------------------------

const monthByKey = new Map(PUBLISHED_MONTHS.map((m) => [m.key, m]));
const discByKey = new Map(DISCOUNT_DATA.map((d) => [d.key, d.discount]));
const monthsSeries = monthlySeries();

const EMPTY_CASH = {
  channelMargin: null, ssClaim: null, stockVariance: null, payroll: null, profFee: null, otherIncome: null,
  auditTrueUp: null, nonOperating: null, pbt: null, tax: null, netIncome: null,
  openingCash: null, funding: null, closingCash: null, cashBurn: null, ebitdaBurn: null, runway: null,
} as const;

function companyPoint(p: PeriodMIS): MisPoint {
  const m = monthByKey.get(p.key)!;
  const orders = ordersByChannel(p);
  const qty = SALES_CHANNELS.reduce((s, c) => s + orders[c], 0);
  return {
    ...EMPTY_CASH,
    qty: Math.round(qty),
    grossRevenue: m.totalGrossRevenue || null,
    returns: m.totalReturns,
    gst: m.totalTaxes ? Math.abs(m.totalTaxes) : null,
    discounts: discByKey.get(p.key) ?? null,
    netRevenue: m.netRevenue,
    cogs: m.cogm,
    grossMargin: m.grossMargin,
    logistics: m.channelFulfillment,
    cm1: m.cm1,
    marketing: m.salesMarketing,
    cm2: m.cm2,
    branding: m.platformCosts,
    cm3: m.cm3,
    ...belowEbitda(m.ebitda, m.netIncome, m.nonOpLines),
    otherExpense: m.opex,
    ebitda: m.ebitda,
  };
}

function channelPoint(p: PeriodMIS, c: SalesChannel): MisPoint {
  const m = monthByKey.get(p.key)!;
  const r = channelPnl(p, adSpendForPeriod('month', p)).find((x) => x.channel === c)!;
  const orders = ordersByChannel(p);
  const share = p.netRevenue ? Math.max(0, m.netByChannel[c] || 0) / p.netRevenue : 0;
  return {
    ...EMPTY_CASH,
    qty: Math.round(orders[c]),
    grossRevenue: m.grossByChannel[c] ?? null,
    returns: m.returnsByChannel[c] ?? null,
    gst: m.totalTaxes ? Math.abs(m.totalTaxes) * share : null,
    discounts: c === 'D2C' ? (discByKey.get(p.key) ?? null) : null,
    netRevenue: m.netByChannel[c] ?? 0,
    cogs: r.cogm,
    grossMargin: r.grossMargin,
    logistics: r.channelFulfillment,
    cm1: r.cm1,
    marketing: r.salesMarketing,
    cm2: r.cm2,
    branding: r.platformCosts,
    cm3: r.cm3,
    otherExpense: r.opex,
    ebitda: r.ebitda,
  };
}

export function misPoint(p: PeriodMIS, entity: MisEntity): MisPoint {
  return entity === 'company' ? companyPoint(p) : channelPoint(p, entity);
}

/** Sum amount fields across months; nulls stay null when nothing is present. */
export function sumPoints(points: MisPoint[]): MisPoint {
  const out = {} as MisPoint;
  for (const k of MIS_POINT_KEYS) {
    const vals = points.map((p) => p[k]).filter((v): v is number => v !== null);
    out[k] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }
  return out;
}

// ----------------------------------------------------------------------------

export interface MisFiscalYear {
  key: string;   // e.g. "FY 2025-26"
  name: string;  // e.g. "FY 2025-26"
  months: PeriodMIS[];
}

/** Group the monthly series into fiscal years (Apr–Mar), chronological. */
export function misFiscalYears(): MisFiscalYear[] {
  const groups = new Map<string, PeriodMIS[]>();
  for (const p of monthsSeries) {
    const year = Math.floor(p.sortKey / 100);
    const month = p.sortKey % 100;
    const fy = fiscalYear(month, year).key;
    if (!groups.has(fy)) groups.set(fy, []);
    groups.get(fy)!.push(p);
  }
  return [...groups.entries()]
    .map(([key, months]) => ({ key, name: key, months }))
    .sort((a, b) => a.months[0].sortKey - b.months[0].sortKey);
}

export const MIS_ENTITIES: { id: MisEntity; label: string }[] = [
  { id: 'company', label: 'Company (All)' },
  ...SALES_CHANNELS.map((c) => ({ id: c as MisEntity, label: channelLabel(c) })),
];
