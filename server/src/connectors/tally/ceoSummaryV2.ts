// ----------------------------------------------------------------------------
// CEO summary v2 — the "Cash Overwatch" blocks (founder, 7 Nov 2026: "entire P&L MIS, key cash situation, verticals and
// things to watch out for"). Pure; tests server/test/ceoSummaryV2.test.ts. Added NEXT TO the v1 fields of
// GET /api/tally/summary (ceoSummary.ts), which stay unchanged. READ ONLY, stored snapshots only:
//   fy        financial-year-to-date P&L from the newest FY-to-date Trial Balance (+ the same month last FY for YoY)
//   channels  monthly sales per channel ledger of the P&L copies (Amazon, D2C, Flipkart, Blinkit, GT, B2B, Export, Other)
//   costs     opex by bucket per month from the P&L copies' expense ledgers, with MoM and % of sales
//   balance   the newest Balance Sheet (statementsCore.ts): cash per bank ledger, OD, debtors, creditors, stock, loans, GST
//   cashflow  indirect cash flow of the last months (two consecutive TBs each)
//   close     per month: locked / ready / open, tie residual, channel sales vs connector facts, missing manual uploads,
//             when the Tally copy was taken
//   watch     plain-English rules over the above, each with ₹ / % and a reason
// A figure the data cannot give is null, never 0.
// ----------------------------------------------------------------------------

import type { SummaryMonthIn, TbRowIn } from './ceoSummary.js';
import { balanceSheet, statements, type BalanceSheet, type BsLine, type CashFlow, type Parents, type StatementMonthIn } from './statementsCore.js';
import { booksComplete, leafDr, NOT_EXPENSE, primaryDr, salesPurchases, subTotal } from './tbRows.js';
import { netCashFlows, type BalMonth } from '../../services/cashRunway.js';

export type Channel = 'Amazon' | 'D2C' | 'Flipkart' | 'Blinkit' | 'GT' | 'B2B' | 'Export' | 'Other';
export const CHANNELS: Channel[] = ['Amazon', 'D2C', 'Flipkart', 'Blinkit', 'GT', 'B2B', 'Export', 'Other'];
export type CostBucket = 'employee' | 'marketing' | 'channelFees' | 'logistics' | 'rentFactory' | 'professional' | 'finance' | 'depreciation' | 'other';
export const COST_BUCKETS: CostBucket[] = ['employee', 'marketing', 'channelFees', 'logistics', 'rentFactory', 'professional', 'finance', 'depreciation', 'other'];
export const COST_LABEL: Record<CostBucket, string> = {
  employee: 'Employee cost', marketing: 'Marketing & brand', channelFees: 'Channel & platform fees', logistics: 'Logistics & freight',
  rentFactory: 'Rent & factory overheads', professional: 'Professional & compliance', finance: 'Finance cost', depreciation: 'Depreciation', other: 'Other opex',
};

export interface V2MonthIn extends SummaryMonthIn {
  /** When the P&L copy was taken (ISO). */
  pnlAsOf?: string | null;
  tbAsOf?: string | null;
}
export interface LockIn { lockedAt: string; lockedBy: string; worstResidualPct?: number | null; overrideReason?: string }
export interface ManualSlot { connectorId: string; slotId: string; label: string }
export interface LedgerRuleIn { pattern: string; line: string; enabled?: boolean }
export interface V2Input {
  /** Today, YYYY-MM-DD (IST). */
  today: string;
  months: V2MonthIn[];
  parents?: Parents;
  locks?: Record<string, LockIn>;
  /** connector|slot|period of every committed report. */
  committed?: string[];
  /** Connector sales ex-GST per month per channel (committed facts, else the facts cache). A month absent = no connector data. */
  connectorSales?: Record<string, Partial<Record<Channel, number>>>;
  manualSlots?: ManualSlot[];
  /** Stored ledger-name rules (tally/ledger-rules); null = defaults. */
  rules?: LedgerRuleIn[] | null;
}

export interface FyBlock {
  fy: string; // "FY26-27"
  through: string; // newest month, YYYY-MM
  monthsCovered: number;
  sales: number | null; otherIncome: number | null; cogs: number | null;
  grossMargin: number | null; grossMarginPct: number | null;
  ebitda: number | null; ebitdaPct: number | null; depreciation: number | null; financeCost: number | null;
  netProfit: number | null; netProfitPct: number | null;
}
export interface FyOut { current: FyBlock | null; lastFy: FyBlock | null; yoyPct: { sales: number | null; grossMargin: number | null; netProfit: number | null } | null }
export interface ChannelMonth { period: string; sales: Partial<Record<Channel, number>>; total: number | null; unmatchedSalesLedgers: string[] }
export interface ChannelsOut { months: ChannelMonth[]; momPct: Partial<Record<Channel, number | null>> & { total?: number | null }; sharePct: Partial<Record<Channel, number>>; ledgers: Record<string, Channel> }
export interface CostMonth { period: string; sales: number | null; buckets: Record<CostBucket, number | null>; total: number | null; pctOfSales: Record<CostBucket, number | null> }
export interface CostsOut { months: CostMonth[]; momPct: Record<CostBucket, number | null>; ledgers: Record<string, CostBucket> }
export interface BalanceOut {
  period: string; asOf: string | null;
  cash: { ledger: string; amount: number }[]; cashBank: number; overdraft: number; netCash: number;
  receivables: number | null; payables: number | null; inventory: number | null; loans: number | null; gstNet: number | null;
  fixedAssets: number | null; workingCapital: number; fyProfit: number; totalAssets: number; tbDiff: number; warnings: string[];
}
export interface FlowOut { period: string; profit: number; depreciation: number; workingCapital: number; operating: number; investing: number; financing: number; retained: number; other: number; netChange: number; openingCash: number; closingCash: number; warnings: string[] }
export interface CloseMonth {
  period: string; status: 'locked' | 'ready' | 'open';
  lockedAt: string | null; lockedBy: string | null; tieResidualPct: number | null; breach: boolean | null; overrideReason: string | null;
  tallySales: number | null; connectorSales: number | null;
  channelGap: { channel: Channel; tally: number; connector: number; gap: number }[]; channelGapTotal: number | null;
  missingUploads: string[];
  pnlCopyAt: string | null; daysAfterMonthEnd: number | null; tbTies: boolean | null;
}
export interface WatchItem { id: string; severity: 'high' | 'medium' | 'low'; title: string; reason: string; period?: string; inr?: number | null; pct?: number | null }
export interface CeoSummaryV2 {
  fy: FyOut | null;
  channels: ChannelsOut | null;
  costs: CostsOut | null;
  balance: BalanceOut | null;
  cashflow: FlowOut[];
  close: CloseMonth[];
  watch: WatchItem[];
  amazonStock: null;
  notes: string[];
}

// ---------------------------------------------------------------- helpers
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || !b ? null : r1((a / Math.abs(b)) * 100));
const change = (now: number | null | undefined, before: number | null | undefined) => (now == null || before == null || !before ? null : r1(((now - before) / Math.abs(before)) * 100));
const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[–—]/g, '-').replace(/[^a-z0-9%&/-]+/g, ' ').replace(/\s+/g, ' ').trim();
export const prevPeriod = (p: string) => { const y = Number(p.slice(0, 4)), m = Number(p.slice(5, 7)); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const fyOf = (p: string) => (Number(p.slice(5, 7)) >= 4 ? Number(p.slice(0, 4)) : Number(p.slice(0, 4)) - 1);
const fyLabel = (p: string) => { const y = fyOf(p); return `FY${String(y).slice(2)}-${String(y + 1).slice(2)}`; };
const monthEndIso = (p: string) => { const [y, m] = p.split('-').map(Number); return new Date(Date.UTC(y, m, 0, 18, 29, 59)).toISOString(); }; // 23:59:59 IST
const sameMonthLastYear = (p: string) => `${Number(p.slice(0, 4)) - 1}${p.slice(4)}`;

const groupDr = (rows: TbRowIn[], re: RegExp) => primaryDr(rows, re);

// ---------------------------------------------------------------- ledger → channel (mirror of the close's map + rules)
const NOT_SALE = /\b(fees?|commission|ads?|advert\w*|tds|tcs|receivables?|debtors?|expenses?|payable|refunds?|damage|reimburse\w*|charges?|freight|shipping|marketing|after-? ?sales?|warranty|promotions?)\b/;
const LOOKS_SALE = /\b(sales?|revenue|credit notes?|returns?)\b/;
/** Exact seed names of client/src/data/monthClose/ledgerMap.ts (normalised). */
const SEED_CHANNEL: Record<string, Channel> = {
  'd2c sales': 'D2C', 'shopify sales': 'D2C', 'ecommerce sales': 'Amazon', 'amazon sales': 'Amazon',
  'flipkart sales': 'Flipkart', 'ecommerce - flipkart': 'Flipkart', 'oem sales': 'B2B', 'offline sales': 'GT',
  'quick commerce sales': 'Blinkit', 'blinkit sales': 'Blinkit', 'export sales': 'Export',
};
const RULE_CHANNEL: Record<string, Channel> = { rev_blinkit: 'Blinkit', rev_flipkart: 'Flipkart' };
const QC = /(blinkit|grofers|hyperpure|zepto|instamart|swiggy|big ?basket|quick[ -]?commerce)/;

/** Which sales channel a P&L ledger feeds; null = not a sales ledger (stock transfers, fees, costs, income). */
export function channelOfLedger(name: string, rules: LedgerRuleIn[] | null = null): Channel | null {
  const n = norm(name);
  if (!n || /stock transfer/.test(n)) return null;
  const seed = SEED_CHANNEL[n];
  if (seed) return seed;
  for (const r of rules ?? []) {
    if (r.enabled === false || !RULE_CHANNEL[r.line]) continue;
    try { if (new RegExp(r.pattern, 'i').test(n)) return RULE_CHANNEL[r.line]; } catch { /* a bad stored pattern is skipped */ }
  }
  if (NOT_SALE.test(n) || !LOOKS_SALE.test(n)) return null;
  if (/\b(d2c|shopify|website|web ?store)\b/.test(n)) return 'D2C';
  if (/\bflipkart\b/.test(n)) return 'Flipkart';
  if (QC.test(n)) return 'Blinkit';
  if (/\bamazon\b|e-?commerce/.test(n)) return 'Amazon';
  if (/\b(oem|b2b|corporate|bulk)\b/.test(n)) return 'B2B';
  if (/\b(offline|gt|general trade|dealers?|distributors?|retail|physio\w*|pharmac\w*)\b/.test(n)) return 'GT';
  if (/\bexport/.test(n)) return 'Export';
  return 'Other';
}

// ---------------------------------------------------------------- ledger → cost bucket
// NOT_EXPENSE (tbRows.ts) = the /api/expenses rule: "Sales & Marketing" is a cost (it was dropped as a sales line, round 10
// A1) and the Direct / Indirect Expenses GROUP rows are skipped (their ledgers are listed too, round 10 A2). Bank charges and
// interest on TDS / GST stay in opex ("other"), as the Live MIS has them (round 10 A7).
const BUCKET_RULES: [CostBucket, RegExp][] = [
  ['other', /bank charges|interest on (tds|gst|income tax)|late fee/],
  ['depreciation', /depreciat|amortis/],
  ['finance', /finance cost|\binterest\b|loan processing|\bemi\b|overdraft|od charges/],
  ['employee', /employee|salar|\bwages\b|staff|\bpf\b|provident|\besi\b|gratuity|bonus|incentive|recruit|hiring|payroll|director.?s? remuneration/],
  ['channelFees', /channel fee|commission|\bfba\b|d2c fees|platform fee|gateway|razorpay|easebuzz|snapmint|shopflo|amazon damage|reimbursement|cod charges|settlement/],
  ['marketing', /marketing|advertis|\bads?\b|media buying|google|meta\b|facebook|influencer|content creation|brand|campaign|promotion|creative|agency|shoot|celebrity/],
  ['logistics', /freight|shipping|courier|shiprocket|delhivery|porter|transport|logistic|packaging|packing|warehous|cartage/],
  ['rentFactory', /\brent\b|factory|electric|power|manufactur|job work|dyeing|repair|maint|utilit|water|consumable|generator|diesel|machine/],
  ['professional', /professional|legal|audit|consult|compliance|certification|govt fee|\broc\b|filing|trademark|patent|nsdl|secretar|registration|licen[cs]e/],
];
/** Lines the Live MIS books in COGM (cost of goods made), not opex: server opex = client opex (round 10 A2). */
const COGM_LINE = /^(factory overheads?|manufacturing (costs?|expenses?)|inward freight|freight inward)$/;
/** Which opex bucket an expense ledger falls in; null = not an operating expense row (sales, stock, purchases, income, totals). */
export function bucketOfLedger(name: string): CostBucket | null {
  const n = norm(name);
  if (!n || NOT_EXPENSE.test(n) || COGM_LINE.test(n) || channelOfLedger(name)) return null;
  for (const [b, re] of BUCKET_RULES) if (re.test(n)) return b;
  return 'other';
}

// ---------------------------------------------------------------- FY to date
const toStatementIn = (m: V2MonthIn): StatementMonthIn => {
  const rows = m.pnl?.ledgerRows ?? [];
  const stock = rows.filter((r) => /^closing stock$/i.test(r.name));
  return {
    period: m.period, asOf: m.tbAsOf ?? m.pnlAsOf ?? null,
    tb: m.tb ? { rows: m.tb.rows, difference: m.tb.difference, basis: m.tb.basis ?? null } : null,
    closingStock: stock.length ? stock.reduce((a, r) => a + r.amount, 0) : null,
    depreciation: rows.filter((r) => /depreciat/i.test(r.name)).reduce((a, r) => a + r.amount, 0),
    nettProfit: m.pnl?.nettProfit ?? null,
  };
};

function fyBlock(m: V2MonthIn | undefined, parents?: Parents): FyBlock | null {
  if (!m?.tb || m.tb.basis !== 'fy-to-date' || !m.tb.rows.length) return null;
  const rows = m.tb.rows;
  const sheet = balanceSheet(toStatementIn(m), parents);
  // Stock Transfers out of sales AND purchases (round 7 #1): sales = the channel ledgers, GM ₹ unchanged.
  const { sales: salesV0, purchases } = salesPurchases(rows, parents);
  const direct = groupDr(rows, /^direct expenses$/i);
  const opening = groupDr(rows, /^opening stock$/i) ?? 0;
  const closing = toStatementIn(m).closingStock;
  const salesV = salesV0 == null ? null : r0(salesV0);
  const cogs = salesV == null || closing == null ? null : r0((purchases ?? 0) + (direct ?? 0) + opening - closing);
  const gm = salesV == null || cogs == null ? null : salesV - cogs;
  const net = sheet && !sheet.stockUnknown ? r0(sheet.fyProfit) : null;
  // Leaf ledgers only: a sub-group ("Finance Costs") and its ledgers are both listed in the TB (round 7 #9).
  const dep = leafDr(rows, /depreciat|amortis/i, parents);
  const fin = leafDr(rows, /finance cost|interest (paid|expense)|interest on (?!tds|gst|income tax)|bank interest|^interest$|loan processing/i, parents);
  const tax = leafDr(rows, /income tax|provision for tax|tax expense/i, parents) ?? 0;
  const hasLedgers = rows.some((r) => r.level === 'ledger');
  const ebitda = net == null || !hasLedgers ? null : r0(net + (dep ?? 0) + (fin ?? 0) + tax);
  const mo = Number(m.period.slice(5, 7));
  return {
    fy: fyLabel(m.period), through: m.period, monthsCovered: mo >= 4 ? mo - 3 : mo + 9,
    sales: salesV, otherIncome: (() => { const v = groupDr(rows, /^(indirect incomes?|direct incomes?)$/i); return v == null ? null : r0(-v); })(),
    cogs, grossMargin: gm, grossMarginPct: pct(gm, salesV),
    ebitda, ebitdaPct: pct(ebitda, salesV), depreciation: dep == null ? null : r0(dep), financeCost: fin == null ? null : r0(fin),
    netProfit: net, netProfitPct: pct(net, salesV),
  };
}

export function fyOut(months: V2MonthIn[], parents?: Parents): FyOut | null {
  const sorted = [...months].sort((a, b) => a.period.localeCompare(b.period));
  const newest = [...sorted].reverse().find((m) => m.tb?.basis === 'fy-to-date' && m.tb.rows.length);
  if (!newest) return null;
  const current = fyBlock(newest, parents);
  const lastFy = fyBlock(sorted.find((m) => m.period === sameMonthLastYear(newest.period)), parents);
  return {
    current, lastFy,
    yoyPct: current && lastFy ? { sales: change(current.sales, lastFy.sales), grossMargin: change(current.grossMargin, lastFy.grossMargin), netProfit: change(current.netProfit, lastFy.netProfit) } : null,
  };
}

// ---------------------------------------------------------------- channels (P&L copies)
export function channelsOut(months: V2MonthIn[], rules: LedgerRuleIn[] | null = null, keep = 6): ChannelsOut | null {
  const withPnl = [...months].filter((m) => m.pnl?.ledgerRows.length).sort((a, b) => a.period.localeCompare(b.period));
  if (!withPnl.length) return null;
  const ledgers: Record<string, Channel> = {};
  const all: ChannelMonth[] = withPnl.map((m) => {
    const sales: Partial<Record<Channel, number>> = {};
    const unmatched: string[] = [];
    for (const r of m.pnl!.ledgerRows) {
      const ch = channelOfLedger(r.name, rules);
      if (!ch) continue;
      ledgers[r.name] = ch;
      sales[ch] = r0((sales[ch] ?? 0) + r.amount);
      if (ch === 'Other') unmatched.push(r.name);
    }
    const vals = Object.values(sales) as number[];
    return { period: m.period, sales, total: vals.length ? r0(vals.reduce((a, b) => a + b, 0)) : null, unmatchedSalesLedgers: [...new Set(unmatched)] };
  });
  const out = all.slice(-keep);
  const last = out[out.length - 1], prev = out.length > 1 ? out[out.length - 2] : null;
  const momPct: ChannelsOut['momPct'] = { total: change(last.total, prev?.total) };
  const sharePct: Partial<Record<Channel, number>> = {};
  for (const ch of CHANNELS) {
    if (last.sales[ch] == null && prev?.sales[ch] == null) continue;
    momPct[ch] = change(last.sales[ch] ?? null, prev?.sales[ch] ?? null);
    if (last.sales[ch] != null && last.total) sharePct[ch] = r1((last.sales[ch]! / last.total) * 100);
  }
  return { months: out, momPct, sharePct, ledgers };
}

// ---------------------------------------------------------------- costs (P&L copies)
export function costsOut(months: V2MonthIn[], rules: LedgerRuleIn[] | null = null, keep = 6): CostsOut | null {
  const withPnl = [...months].filter((m) => m.pnl?.ledgerRows.length).sort((a, b) => a.period.localeCompare(b.period));
  if (!withPnl.length) return null;
  const ledgers: Record<string, CostBucket> = {};
  const all: CostMonth[] = withPnl.map((m) => {
    const buckets = Object.fromEntries(COST_BUCKETS.map((b) => [b, null])) as Record<CostBucket, number | null>;
    let sales = 0, haveSales = false;
    for (const r of m.pnl!.ledgerRows) {
      const ch = channelOfLedger(r.name, rules);
      if (ch) { sales += r.amount; haveSales = true; continue; }
      const b = bucketOfLedger(r.name);
      if (!b) continue;
      ledgers[r.name] = b;
      buckets[b] = r0((buckets[b] ?? 0) + r.amount);
    }
    const vals = COST_BUCKETS.map((b) => buckets[b]).filter((v): v is number => v != null);
    const s = haveSales ? r0(sales) : null;
    return {
      period: m.period, sales: s, buckets, total: vals.length ? r0(vals.reduce((a, b) => a + b, 0)) : null,
      pctOfSales: Object.fromEntries(COST_BUCKETS.map((b) => [b, pct(buckets[b], s)])) as Record<CostBucket, number | null>,
    };
  });
  const out = all.slice(-keep);
  const last = out[out.length - 1], prev = out.length > 1 ? out[out.length - 2] : null;
  const momPct = Object.fromEntries(COST_BUCKETS.map((b) => [b, change(last.buckets[b], prev?.buckets[b])])) as Record<CostBucket, number | null>;
  return { months: out, momPct, ledgers };
}

// ---------------------------------------------------------------- balance sheet + cash flow
const CASH_GROUP = /^(bank accounts|cash-in-hand|cash in hand)$/i;
const looksCash = (n: string) => /\bbank\b|\bcash\b/i.test(n) && !/\bo\.?d\b|overdraft|\bcc\b|\bocc\b|cash credit|deposit|\bfds?\b|loan|advance|charges|guarantee|margin/i.test(n);
function cashLedgers(sheet: BalanceSheet): { ledger: string; amount: number }[] {
  const out: { ledger: string; amount: number }[] = [];
  const walk = (lines: BsLine[] | undefined) => {
    for (const l of lines ?? []) {
      if (CASH_GROUP.test(l.label)) { if (l.children?.length) for (const k of l.children) out.push({ ledger: k.label, amount: r0(k.amount) }); else out.push({ ledger: l.label, amount: r0(l.amount) }); }
      else if (looksCash(l.label) && !l.children?.length) out.push({ ledger: l.label, amount: r0(l.amount) });
      else if (l.children?.length) walk(l.children as BsLine[]);
    }
  };
  walk(sheet.assets.filter((l) => /current assets/i.test(l.label)));
  return out.filter((c) => c.amount !== 0);
}

export function balanceOut(months: V2MonthIn[], parents?: Parents): { balance: BalanceOut | null; cashflow: FlowOut[] } {
  // A stored TB without rows (an empty Tally answer kept before round 7 #11) is no Balance Sheet: never cash ₹0.
  const ins = months.filter((m) => m.tb?.rows.length).map(toStatementIn);
  if (!ins.length) return { balance: null, cashflow: [] };
  const { sheets, flows } = statements(ins, parents);
  const sheet = sheets[sheets.length - 1];
  const m = months.find((x) => x.period === sheet?.period);
  const rows = m?.tb?.rows ?? [];
  const bal = (re: RegExp, sign: 1 | -1) => { const v = subTotal(rows, re, parents); return v == null ? null : r0(v * sign); };
  const loansDr = primaryDr(rows, /^loans \(liability\)$/i);
  const balance: BalanceOut | null = sheet ? {
    period: sheet.period, asOf: sheet.asOf,
    cash: cashLedgers(sheet), cashBank: r0(sheet.cash), overdraft: r0(sheet.bankOd), netCash: r0(sheet.cash - sheet.bankOd),
    receivables: bal(/^sundry debtors$/i, 1), payables: bal(/^sundry creditors$/i, -1),
    inventory: toStatementIn(m!).closingStock == null ? null : r0(toStatementIn(m!).closingStock!),
    loans: loansDr == null ? null : r0(-loansDr), gstNet: bal(/^duties & taxes$/i, -1),
    fixedAssets: (() => { const v = primaryDr(rows, /^fixed assets$/i); return v == null ? null : r0(v); })(),
    workingCapital: r0(sheet.workingCapital), fyProfit: r0(sheet.fyProfit), totalAssets: r0(sheet.totalAssets), tbDiff: r0(m?.tb?.difference ?? 0),
    warnings: sheet.warnings,
  } : null;
  const flowOut = (f: CashFlow): FlowOut => ({
    period: f.period, profit: r0(f.profit), depreciation: r0(f.depreciation), workingCapital: r0(f.workingCapital.reduce((s, x) => s + x.amount, 0)),
    operating: r0(f.operating), investing: r0(f.investing), financing: r0(f.financing), retained: r0(f.retained), other: r0(f.other),
    netChange: r0(f.netChange), openingCash: r0(f.openingCash), closingCash: r0(f.closingCash), warnings: f.warnings,
  });
  return { balance, cashflow: flows.slice(-3).map(flowOut) };
}

/**
 * Month-end net cash (bank − overdraft) and Loans (Liability) of every WHOLE month (books ended and copied ≥ 5 days after
 * month end) from the Balance Sheet builder: the one input of the cash runway, the "Cash lasts" watch and MCP
 * mis_get_cash_runway (round 7 #2, #3). A running or barely-closed month is left out, never counted as a month.
 */
export function netCashMonths(months: V2MonthIn[], parents: Parents | undefined, today: string): BalMonth[] {
  const ins = months.filter((m) => m.tb?.rows.length).map(toStatementIn);
  const { sheets } = statements(ins, parents);
  const byP = new Map(months.map((m) => [m.period, m]));
  return sheets.filter((b) => booksComplete(b.period, b.asOf, today)).map((b) => {
    const loans = primaryDr(byP.get(b.period)?.tb?.rows ?? [], /^loans \(liability\)$/i);
    return { period: b.period, netCash: r0(b.cash - b.bankOd), loans: loans == null ? null : r0(-loans), overdraft: r0(b.bankOd) };
  });
}

// ---------------------------------------------------------------- close status
export function closeOut(x: V2Input, keep = 4): CloseMonth[] {
  const thisMonth = x.today.slice(0, 7);
  const periods = [...new Set(x.months.map((m) => m.period))].filter((p) => p <= thisMonth).sort().slice(-keep);
  const committed = new Set(x.committed ?? []);
  const everUsed = new Set((x.committed ?? []).map((k) => k.split('|')[0]));
  const byP = new Map(x.months.map((m) => [m.period, m]));
  return periods.map((p) => {
    const m = byP.get(p);
    const lock = x.locks?.[p];
    const sales: Partial<Record<Channel, number>> = {};
    for (const r of m?.pnl?.ledgerRows ?? []) { const ch = channelOfLedger(r.name, x.rules ?? null); if (ch) sales[ch] = (sales[ch] ?? 0) + r.amount; }
    const tallySales = Object.keys(sales).length ? r0((Object.values(sales) as number[]).reduce((a, b) => a + b, 0)) : null;
    const conn = x.connectorSales?.[p];
    const channelGap: CloseMonth['channelGap'] = [];
    if (conn) for (const ch of CHANNELS) {
      const c = conn[ch];
      if (c == null) continue;
      const t = sales[ch] ?? 0;
      channelGap.push({ channel: ch, tally: r0(t), connector: r0(c), gap: r0(t - c) });
    }
    const connTotal = conn ? r0((Object.values(conn) as number[]).reduce((a, b) => a + (b ?? 0), 0)) : null;
    const ended = p < thisMonth;
    const missingUploads = ended ? (x.manualSlots ?? []).filter((s) => everUsed.has(s.connectorId) && !committed.has(`${s.connectorId}|${s.slotId}|${p}`)).map((s) => s.label) : [];
    const asOf = m?.pnlAsOf ?? null;
    const days = asOf ? Math.floor((Date.parse(asOf) - Date.parse(monthEndIso(p))) / 86_400_000) : null;
    const pctV = lock?.worstResidualPct ?? null;
    return {
      period: p, status: lock ? 'locked' : tallySales && tallySales > 0 ? 'ready' : 'open',
      lockedAt: lock?.lockedAt ?? null, lockedBy: lock?.lockedBy ?? null, tieResidualPct: pctV, breach: pctV == null ? null : Math.abs(pctV) > 1, overrideReason: lock?.overrideReason ?? null,
      tallySales, connectorSales: connTotal,
      channelGap, channelGapTotal: channelGap.length ? r0(channelGap.reduce((a, g) => a + Math.abs(g.gap), 0)) : null,
      missingUploads, pnlCopyAt: asOf, daysAfterMonthEnd: days, tbTies: m?.tb ? Math.abs(m.tb.difference) < 1 : null,
    };
  });
}

// ---------------------------------------------------------------- watch
const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
export function watchOut(x: V2Input, parts: { channels: ChannelsOut | null; balance: BalanceOut | null; cashflow: FlowOut[]; close: CloseMonth[]; costs: CostsOut | null }): WatchItem[] {
  const out: WatchItem[] = [];
  const sorted = [...x.months].sort((a, b) => a.period.localeCompare(b.period));
  const byP = new Map(sorted.map((m) => [m.period, m]));
  const { balance, close, channels } = parts;
  // 1. cash runway: net cash (bank − overdraft) at the average monthly change in NET cash less new loans over the last ≤ 3
  //    whole months — the same method as /api/cash/runway (an OD-funded burn shows; a 2-day month never counts).
  const flows = balance ? netCashFlows(netCashMonths(x.months, x.parents, x.today)).slice(-3) : [];
  if (balance && flows.length) {
    const avg = flows.reduce((s, f) => s + f.netChange, 0) / flows.length;
    if (avg < 0) {
      const months = r1(Math.max(0, balance.netCash) / -avg);
      out.push({ id: 'cash_runway', severity: months < 3 ? 'high' : months < 6 ? 'medium' : 'low', period: balance.period, inr: r0(avg), pct: months,
        title: `Cash runway ≈ ${months} months`, reason: `Net cash ${inr(balance.netCash)} (bank − overdraft) after an average fall of ${inr(avg)} a month in net cash, less new loans, over ${flows.length} whole month${flows.length === 1 ? '' : 's'} (${flows.map((f) => f.period).join(', ')}).` });
    }
  }
  // 2. debtors +20 % MoM · 3. creditors > 2× purchases · 4. GST payable spike
  if (balance) {
    const cur = byP.get(balance.period), prev = byP.get(prevPeriod(balance.period));
    const bal = (m: V2MonthIn | undefined, re: RegExp, sign: 1 | -1) => { const v = m?.tb ? subTotal(m.tb.rows, re, x.parents) : null; return v == null ? null : v * sign; };
    const d1 = bal(cur, /^sundry debtors$/i, 1), d0 = bal(prev, /^sundry debtors$/i, 1);
    const dPct = change(d1, d0);
    if (dPct != null && dPct > 20 && d1 != null) out.push({ id: 'debtors_up', severity: dPct > 50 ? 'high' : 'medium', period: balance.period, inr: r0(d1 - (d0 ?? 0)), pct: dPct, title: `Debtors up ${dPct}% in a month`, reason: `Sundry Debtors ${inr(d1)} at ${balance.period} vs ${inr(d0 ?? 0)} the month before: customers are paying slower or sales were booked late in the month.` });
    const purchases = (() => {
      const vals = sorted.filter((m) => m.period <= balance.period).slice(-3).map((m) => {
        const p = byP.get(prevPeriod(m.period));
        if (!m.tb || m.tb.basis !== 'fy-to-date') return null;
        const now = salesPurchases(m.tb.rows, x.parents).purchases;
        if (now == null) return null;
        if (Number(m.period.slice(5, 7)) === 4) return now;
        if (!p?.tb || p.tb.basis !== 'fy-to-date' || fyOf(p.period) !== fyOf(m.period)) return null;
        return now - (salesPurchases(p.tb.rows, x.parents).purchases ?? 0);
      }).filter((v): v is number => v != null && v > 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    })();
    if (balance.payables != null && purchases != null && balance.payables > 2 * purchases) {
      out.push({ id: 'creditors_high', severity: balance.payables > 3 * purchases ? 'high' : 'medium', period: balance.period, inr: balance.payables, pct: r1(balance.payables / purchases),
        title: `Creditors = ${r1(balance.payables / purchases)}× a month's purchases`, reason: `Sundry Creditors ${inr(balance.payables)} against average monthly purchases of ${inr(purchases)}: suppliers are being stretched or bills sit unpaid.` });
    }
    const g1 = bal(cur, /^duties & taxes$/i, -1), g0 = bal(prev, /^duties & taxes$/i, -1);
    if (g1 != null && g0 != null && g1 > 0 && g1 > 1.5 * Math.max(g0, 1) && g1 - g0 > 50_000) {
      out.push({ id: 'gst_spike', severity: 'medium', period: balance.period, inr: r0(g1 - g0), pct: change(g1, g0), title: `GST payable jumped to ${inr(g1)}`, reason: `Duties & Taxes payable ${inr(g1)} vs ${inr(g0)} the month before: a tax payment may be due or input credit was not booked.` });
    }
    if (Math.abs(balance.tbDiff) >= 1) out.push({ id: 'tb_diff', severity: 'high', period: balance.period, inr: balance.tbDiff, title: `Trial Balance for ${balance.period} does not tie`, reason: `Debits and credits differ by ${inr(balance.tbDiff)} in the copy Tally gave: every balance above is approximate until fixed in TallyPrime.` });
  }
  // 5. tie breach · 8. P&L copy too early / missing · 9. missing uploads
  for (const c of close) {
    if (c.breach) out.push({ id: `tie_breach:${c.period}`, severity: 'high', period: c.period, pct: c.tieResidualPct, title: `${c.period} locked with a ${c.tieResidualPct}% tie residual`, reason: c.overrideReason ? `Over the 1% limit; locked anyway: "${c.overrideReason}".` : 'Over the 1% limit between Tally and the connectors.' });
    if (c.status !== 'locked' && c.period < x.today.slice(0, 7)) {
      if (c.pnlCopyAt == null) out.push({ id: `pnl_missing:${c.period}`, severity: 'medium', period: c.period, title: `No Tally P&L copy for ${c.period}`, reason: 'The month has ended but Tally has not been reached since: the books of that month are not in the MIS yet.' });
      else if (c.daysAfterMonthEnd != null && c.daysAfterMonthEnd < 5) out.push({ id: `pnl_early:${c.period}`, severity: 'low', period: c.period, title: `${c.period} P&L copy taken ${c.daysAfterMonthEnd} day${c.daysAfterMonthEnd === 1 ? '' : 's'} after month end`, reason: 'Entries usually land for about 5 days after a month closes: its figures may still move. The next Tally poll re-takes it.' });
    }
    if (c.missingUploads.length) out.push({ id: `uploads:${c.period}`, severity: 'medium', period: c.period, title: `${c.missingUploads.length} manual report${c.missingUploads.length === 1 ? '' : 's'} missing for ${c.period}`, reason: `${c.missingUploads.join(', ')}: no API for these, they come in by hand (Setup → Connectors).` });
    if (c.channelGapTotal != null && c.tallySales && c.channelGapTotal > 0.05 * c.tallySales) {
      const worst = [...c.channelGap].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0];
      out.push({ id: `channel_gap:${c.period}`, severity: 'medium', period: c.period, inr: c.channelGapTotal, pct: pct(c.channelGapTotal, c.tallySales), title: `${c.period}: Tally vs connector sales differ by ${inr(c.channelGapTotal)}`, reason: `Biggest: ${worst.channel} Tally ${inr(worst.tally)} vs connector ${inr(worst.connector)}. Sales booked in another month, a missing credit note, or a connector gap.` });
    }
  }
  // 7. a channel ledger down > 25 % MoM (only a finished month vs the one before)
  if (channels && channels.months.length > 1) {
    const last = channels.months[channels.months.length - 1], prev = channels.months[channels.months.length - 2];
    if (last.period < x.today.slice(0, 7)) {
      for (const ch of CHANNELS) {
        const p = change(last.sales[ch] ?? null, prev.sales[ch] ?? null);
        if (p != null && p < -25 && (prev.sales[ch] ?? 0) > 100_000) out.push({ id: `channel_down:${ch}`, severity: p < -50 ? 'high' : 'medium', period: last.period, inr: r0((last.sales[ch] ?? 0) - (prev.sales[ch] ?? 0)), pct: p, title: `${ch} sales down ${Math.abs(p)}% in ${last.period}`, reason: `${inr(last.sales[ch] ?? 0)} vs ${inr(prev.sales[ch] ?? 0)} in ${prev.period} (Tally sales ledgers).` });
      }
    }
  }
  const RANK = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || Math.abs(b.inr ?? 0) - Math.abs(a.inr ?? 0));
}

// ---------------------------------------------------------------- per-ledger tools
/** Monthly amounts of every P&L ledger whose name contains `query` (case-insensitive). */
export function ledgerTrend(months: V2MonthIn[], query: string, keep = 13): { ledger: string; months: { period: string; amount: number }[]; total: number }[] {
  const q = norm(query);
  if (!q) return [];
  const sorted = [...months].filter((m) => m.pnl?.ledgerRows.length).sort((a, b) => a.period.localeCompare(b.period)).slice(-keep);
  const by = new Map<string, Map<string, number>>();
  for (const m of sorted) for (const r of m.pnl!.ledgerRows) {
    if (!norm(r.name).includes(q)) continue;
    const row = by.get(r.name) ?? new Map<string, number>();
    row.set(m.period, (row.get(m.period) ?? 0) + r.amount);
    by.set(r.name, row);
  }
  return [...by].map(([ledger, row]) => {
    const ms = sorted.map((m) => ({ period: m.period, amount: r0(row.get(m.period) ?? 0) }));
    return { ledger, months: ms, total: r0(ms.reduce((a, x) => a + x.amount, 0)) };
  }).sort((a, b) => Math.abs(b.total) - Math.abs(a.total)).slice(0, 25);
}

/** Biggest expense ledgers of one month (shown positive = cost), with the month before for comparison. */
export function expensesOf(months: V2MonthIn[], period: string, top = 25): { period: string; rows: { ledger: string; amount: number; before: number | null; bucket: CostBucket | null }[]; total: number } | null {
  const m = months.find((x) => x.period === period && x.pnl?.ledgerRows.length);
  if (!m) return null;
  const prev = months.find((x) => x.period === prevPeriod(period) && x.pnl?.ledgerRows.length);
  const before = new Map<string, number>();
  for (const r of prev?.pnl?.ledgerRows ?? []) before.set(r.name, (before.get(r.name) ?? 0) + r.amount);
  const rows = m.pnl!.ledgerRows.filter((r) => r.amount > 0 && bucketOfLedger(r.name) != null)
    .sort((a, b) => b.amount - a.amount).slice(0, top)
    .map((r) => ({ ledger: r.name, amount: r0(r.amount), before: before.has(r.name) ? r0(before.get(r.name)!) : null, bucket: bucketOfLedger(r.name) }));
  return { period, rows, total: r0(m.pnl!.ledgerRows.filter((r) => r.amount > 0 && bucketOfLedger(r.name) != null).reduce((a, r) => a + r.amount, 0)) };
}

// ---------------------------------------------------------------- all together
export function ceoSummaryV2(x: V2Input): CeoSummaryV2 {
  const notes: string[] = [];
  const fy = fyOut(x.months, x.parents);
  const channels = channelsOut(x.months, x.rules ?? null);
  const costs = costsOut(x.months, x.rules ?? null);
  const { balance, cashflow } = balanceOut(x.months, x.parents);
  const close = closeOut(x);
  const watch = watchOut(x, { channels, balance, cashflow, close, costs });
  if (!fy) notes.push('FY to date needs an FY-to-date Trial Balance (taken since 2 Nov 2026): none stored yet.');
  else if (!fy.lastFy) notes.push(`Last FY to date needs the Trial Balance of ${sameMonthLastYear(fy.current?.through ?? '')}: not stored, so YoY is blank.`);
  if (fy?.current && fy.current.ebitda == null) notes.push('EBITDA needs the exploded ledgers of the Trial Balance (depreciation, finance cost): blank on a groups-only copy.');
  if (channels?.months.some((m) => m.unmatchedSalesLedgers.length)) notes.push(`Sales ledgers not named for a channel are shown as "Other": ${[...new Set(channels.months.flatMap((m) => m.unmatchedSalesLedgers))].slice(0, 6).join(', ')}.`);
  if (!x.connectorSales || !Object.keys(x.connectorSales).length) notes.push('Channel sales vs connectors needs committed reports or a facts-cache month: none found, so channelGap is empty.');
  notes.push('Costs are Tally\'s booked figures by ledger-name bucket (as booked, not the normalised MIS basis). Amazon stock ₹ is not stored as a snapshot: amazonStock is null.');
  return { fy, channels, costs, balance, cashflow, close, watch, amazonStock: null, notes };
}
