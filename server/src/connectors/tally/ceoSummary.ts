// CEO summary of the books (pure; tests server/test/ceoSummary.test.ts). Read by the MCP gateway and Ops' CEO agent
// (GET /api/tally/summary): a few numbers per month, nothing a reader has to add up.
//
// From the stored Trial Balances (asked from 1 April, so P&L groups are financial-year-to-date):
//   - P&L groups per month = this month's FY-to-date closing − last month's (April = itself)
//   - balance sheet groups = the month-end closing (Dr − Cr; liabilities shown positive)
// From the month's P&L copy: Nett Profit, closing stock and the biggest expense ledgers.
// READ ONLY. No ledger names of people beyond what Tally holds as expense ledgers.
// Audit fixes (10 Nov 2026): sales / purchases exclude Stock Transfers (tbRows.salesPurchases); cash, overdraft, debtors,
// creditors and GST come from the Balance Sheet builder with the masters (sub-groups are 'ledger' rows in a real TB, so the
// old group-only read was null every month); loans = Loans (Liability) only; `complete` says whether the month's books
// are final (ended + copy taken ≥ 5 days after month end).

import { balanceSheet } from './statementsCore.js';
import { bucketOfLedger } from './ceoSummaryV2.js';
import { booksComplete, primaryDr, salesPurchases, subTotal, type ParentMap } from './tbRows.js';

export interface TbRowIn { name: string; level: 'group' | 'ledger'; debit: number; credit: number }
export interface SummaryMonthIn {
  period: string;
  /** When the TB / P&L copy was taken (ISO), when known. */
  tbAsOf?: string | null;
  pnlAsOf?: string | null;
  tb: { rows: TbRowIn[]; difference: number; basis?: string | null } | null;
  pnl: { nettProfit: number | null; ledgerRows: { name: string; amount: number }[] } | null;
}
export interface SummaryMonth {
  period: string;
  sales: number | null; otherIncome: number | null; purchases: number | null; directExp: number | null; indirectExp: number | null;
  nettProfit: number | null; closingStock: number | null;
  cashBank: number | null; overdraft: number | null; netCash: number | null;
  debtors: number | null; creditors: number | null; loans: number | null; gstNet: number | null;
  tbDiff: number | null;
  /** Stock transfers taken out of sales and purchases (₹, null = no TB flow). */
  stockTransfers: number | null;
  /** Books final for the whole month (ended, copy ≥ 5 days after month end); null = today not given. */
  complete: boolean | null;
}
export interface CeoSummary {
  months: SummaryMonth[];
  /** biggest expense ledgers of the newest month with a P&L copy (₹, positive = cost) */
  topExpenses: { period: string; rows: { ledger: string; amount: number }[] } | null;
  notes: string[];
}

const r0 = (n: number) => Math.round(n);
const OTHER_INCOME = /^(indirect incomes?|direct incomes?)$/i;
const DIRECT_EXP = /^direct expenses$/i;
const INDIRECT_EXP = /^indirect expenses$/i;
const fyOf = (p: string) => (Number(p.slice(5, 7)) >= 4 ? Number(p.slice(0, 4)) : Number(p.slice(0, 4)) - 1);
const prevPeriod = (p: string) => {
  const y = Number(p.slice(0, 4)), m = Number(p.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const STOCK = /^closing stock$/i;

export function ceoSummary(input: SummaryMonthIn[], keep = 13, opts: { parents?: ParentMap; today?: string } = {}): CeoSummary {
  const { parents, today } = opts;
  const notes: string[] = [];
  const byP = new Map(input.map((m) => [m.period, m]));
  const months: SummaryMonth[] = [];
  for (const m of [...input].sort((a, b) => a.period.localeCompare(b.period))) {
    const rows = m.tb?.rows ?? [];
    const has = rows.length > 0;
    const fytd = has && m.tb?.basis === 'fy-to-date';
    const prev = byP.get(prevPeriod(m.period));
    const prevRows = prev?.tb?.basis === 'fy-to-date' ? prev.tb.rows : null;
    const april = Number(m.period.slice(5, 7)) === 4;
    type Rows = NonNullable<SummaryMonthIn['tb']>['rows'];
    const flowOf = (get: (rs: Rows) => number | null, sign: 1 | -1) => {
      if (!fytd) return null;
      const now = get(rows);
      if (now == null) return null;
      if (april) return r0(now * sign);
      if (!prevRows || fyOf(prev!.period) !== fyOf(m.period)) return null;
      return r0((now - (get(prevRows) ?? 0)) * sign);
    };
    const flow = (re: RegExp, sign: 1 | -1) => flowOf((rs) => primaryDr(rs, re), sign);
    const sp = (rs: Rows) => salesPurchases(rs, parents);
    const bal = (re: RegExp, sign: 1 | -1) => { const v = has ? subTotal(rows, re, parents) : null; return v == null ? null : r0(v * sign); };
    const stock = m.pnl?.ledgerRows.filter((r) => STOCK.test(r.name)) ?? [];
    const closingStock = stock.length ? r0(stock.reduce((a, r) => a + r.amount, 0)) : null;
    // Cash & bank / Bank OD from the Balance Sheet builder (sub-groups and their ledgers, masters when stored).
    const sheet = has ? balanceSheet({ period: m.period, asOf: m.tbAsOf ?? null, tb: { rows, difference: m.tb!.difference, basis: m.tb!.basis ?? null }, closingStock, depreciation: 0, nettProfit: m.pnl?.nettProfit ?? null }, parents) : null;
    const loans = has ? primaryDr(rows, /^loans \(liability\)$/i) : null;
    months.push({
      period: m.period,
      sales: flowOf((rs) => sp(rs).sales, 1), otherIncome: flow(OTHER_INCOME, -1),
      purchases: flowOf((rs) => sp(rs).purchases, 1), directExp: flow(DIRECT_EXP, 1), indirectExp: flow(INDIRECT_EXP, 1),
      nettProfit: m.pnl?.nettProfit == null ? null : r0(m.pnl.nettProfit),
      closingStock,
      cashBank: sheet ? r0(sheet.cash) : null, overdraft: sheet ? r0(sheet.bankOd) : null, netCash: sheet ? r0(sheet.cash - sheet.bankOd) : null,
      debtors: bal(/^sundry debtors$/i, 1), creditors: bal(/^sundry creditors$/i, -1),
      loans: loans == null ? null : r0(-loans), gstNet: bal(/^duties & taxes$/i, -1),
      tbDiff: m.tb ? r0(m.tb.difference) : null,
      stockTransfers: flowOf((rs) => sp(rs).stockTransfers, 1),
      complete: today ? booksComplete(m.period, m.tbAsOf ?? m.pnlAsOf ?? null, today) : null,
    });
  }
  const out = months.slice(-keep);
  if (out.some((m) => m.tbDiff)) notes.push('A Trial Balance does not tie (tbDiff ≠ 0): its balances are approximate.');
  if (out.some((m) => m.stockTransfers)) notes.push('Sales and purchases exclude Stock Transfers (stockTransfers): the same basis as the MIS net revenue.');
  if (out.some((m) => m.complete === false)) notes.push('Months with complete = false are still open or their books were copied < 5 days after month end: not a whole month.');
  if (out.some((m) => m.sales == null && m.cashBank != null)) notes.push('Monthly P&L flows need two FY-to-date Trial Balances in a row: blank where one is missing.');
  const last = [...input].sort((a, b) => b.period.localeCompare(a.period)).find((m) => m.pnl?.ledgerRows.length);
  const topExpenses = last
    ? {
        period: last.period,
        rows: last.pnl!.ledgerRows
          .filter((r) => r.amount > 0 && bucketOfLedger(r.name) != null)
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 12)
          .map((r) => ({ ledger: r.name, amount: r0(r.amount) })),
      }
    : null;
  return { months: out, topExpenses, notes };
}
