// CEO summary of the books (pure; tests server/test/ceoSummary.test.ts). Read by the MCP gateway and Ops' CEO agent
// (GET /api/tally/summary): a few numbers per month, nothing a reader has to add up.
//
// From the stored Trial Balances (asked from 1 April, so P&L groups are financial-year-to-date):
//   - P&L groups per month = this month's FY-to-date closing − last month's (April = itself)
//   - balance sheet groups = the month-end closing (Dr − Cr; liabilities shown positive)
// From the month's P&L copy: Nett Profit, closing stock and the biggest expense ledgers.
// READ ONLY. No ledger names of people beyond what Tally holds as expense ledgers.

export interface TbRowIn { name: string; level: 'group' | 'ledger'; debit: number; credit: number }
export interface SummaryMonthIn {
  period: string;
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
}
export interface CeoSummary {
  months: SummaryMonth[];
  /** biggest expense ledgers of the newest month with a P&L copy (₹, positive = cost) */
  topExpenses: { period: string; rows: { ledger: string; amount: number }[] } | null;
  notes: string[];
}

const r0 = (n: number) => Math.round(n);
const DR = (rows: TbRowIn[], re: RegExp) => {
  const hit = rows.filter((r) => r.level === 'group' && re.test(r.name));
  return hit.length ? hit.reduce((a, r) => a + r.debit - r.credit, 0) : null;
};
const P_AND_L = {
  sales: /^sales accounts$/i,
  otherIncome: /^(indirect incomes?|direct incomes?)$/i,
  purchases: /^purchase accounts$/i,
  directExp: /^direct expenses$/i,
  indirectExp: /^indirect expenses$/i,
};
const fyOf = (p: string) => (Number(p.slice(5, 7)) >= 4 ? Number(p.slice(0, 4)) : Number(p.slice(0, 4)) - 1);
const prevPeriod = (p: string) => {
  const y = Number(p.slice(0, 4)), m = Number(p.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const STOCK = /^closing stock$/i;
const NOT_EXPENSE = /(sales|income|closing stock|opening stock|stock transfer|purchase|interest received|discount received)/i;

export function ceoSummary(input: SummaryMonthIn[], keep = 13): CeoSummary {
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
    const flow = (re: RegExp, sign: 1 | -1) => {
      if (!fytd) return null;
      const now = DR(rows, re);
      if (now == null) return null;
      if (april) return r0(now * sign);
      if (!prevRows || fyOf(prev!.period) !== fyOf(m.period)) return null;
      return r0((now - (DR(prevRows, re) ?? 0)) * sign);
    };
    const bal = (re: RegExp, sign: 1 | -1) => { const v = has ? DR(rows, re) : null; return v == null ? null : r0(v * sign); };
    const cashBank = bal(/^(bank accounts|cash-in-hand)$/i, 1);
    const od = bal(/^bank od a\/c$/i, -1);
    const stock = m.pnl?.ledgerRows.filter((r) => STOCK.test(r.name)) ?? [];
    months.push({
      period: m.period,
      sales: flow(P_AND_L.sales, -1), otherIncome: flow(P_AND_L.otherIncome, -1),
      purchases: flow(P_AND_L.purchases, 1), directExp: flow(P_AND_L.directExp, 1), indirectExp: flow(P_AND_L.indirectExp, 1),
      nettProfit: m.pnl?.nettProfit == null ? null : r0(m.pnl.nettProfit),
      closingStock: stock.length ? r0(stock.reduce((a, r) => a + r.amount, 0)) : null,
      cashBank, overdraft: od, netCash: cashBank == null ? null : r0(cashBank - (od ?? 0)),
      debtors: bal(/^sundry debtors$/i, 1), creditors: bal(/^sundry creditors$/i, -1),
      loans: bal(/^(loans \(liability\)|secured loans|unsecured loans)$/i, -1), gstNet: bal(/^duties & taxes$/i, -1),
      tbDiff: m.tb ? r0(m.tb.difference) : null,
    });
  }
  const out = months.slice(-keep);
  if (out.some((m) => m.tbDiff)) notes.push('A Trial Balance does not tie (tbDiff ≠ 0): its balances are approximate.');
  if (out.some((m) => m.sales == null && m.cashBank != null)) notes.push('Monthly P&L flows need two FY-to-date Trial Balances in a row: blank where one is missing.');
  const last = [...input].sort((a, b) => b.period.localeCompare(a.period)).find((m) => m.pnl?.ledgerRows.length);
  const topExpenses = last
    ? {
        period: last.period,
        rows: last.pnl!.ledgerRows
          .filter((r) => r.amount > 0 && !NOT_EXPENSE.test(r.name))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 12)
          .map((r) => ({ ledger: r.name, amount: r0(r.amount) })),
      }
    : null;
  return { months: out, topExpenses, notes };
}
