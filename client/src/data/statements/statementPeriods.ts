// Balance Sheet + Cash Flow for any period the Live MIS period row picks (PR 3, 22 Nov 2026): Monthly, Quarterly,
// Yearly, Range (presets and custom months), the same columns as the P&L. Pure.
//   Balance Sheet of a period = the position at its end: the sheet of its LAST month that has a stored Trial Balance
//   (a later member with no TB yet = "as of <that month>", noted).
//   Cash Flow of a period = the sum of its months' flows (each month = two consecutive month-end sheets, so the sum is
//   the change from the month before the period to its end, across 1 April too); opening = first month's opening,
//   closing = last month's closing. A member month with no flow is listed in `missing` and the column says so.
import type { BalanceSheet, CashFlow } from './statements';

export interface PeriodCol { key: string; label: string; members: string[] }
export interface PeriodSheet { col: PeriodCol; sheet: BalanceSheet | null; asOfMonth: string | null; note: string | null }
export interface PeriodFlow { col: PeriodCol; flow: CashFlow | null; missing: string[] }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (p: string) => `${MON[Number(p.slice(5)) - 1]} ${p.slice(2, 4)}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function periodSheets(sheets: BalanceSheet[], cols: PeriodCol[]): PeriodSheet[] {
  const by = new Map(sheets.map((s) => [s.period, s]));
  return cols.map((col) => {
    const ms = [...col.members].sort();
    let k = ms.length - 1;
    while (k >= 0 && !by.has(ms[k])) k--;
    if (k < 0) return { col, sheet: null, asOfMonth: null, note: null };
    const at = ms[k];
    const note = k < ms.length - 1 && ms.length > 1 ? `Position at the end of ${monthLabel(at)}: no Trial Balance for ${ms.slice(k + 1).map(monthLabel).join(', ')} yet.` : null;
    return { col, sheet: by.get(at)!, asOfMonth: at, note };
  });
}

/** Sums the flows of the given months (in month order). Null when none of them has a flow. */
export function sumFlows(flows: CashFlow[], period: string): CashFlow | null {
  const fs = [...flows].sort((a, b) => a.period.localeCompare(b.period));
  if (!fs.length) return null;
  if (fs.length === 1) return { ...fs[0], period };
  const add = (f: (x: CashFlow) => number) => r2(fs.reduce((s, x) => s + f(x), 0));
  const labels: string[] = [];
  for (const f of fs) for (const w of f.workingCapital) if (!labels.includes(w.label)) labels.push(w.label);
  const first = fs[0], last = fs[fs.length - 1];
  return {
    period,
    profit: add((x) => x.profit),
    pnlProfit: fs.some((x) => x.pnlProfit == null) ? null : add((x) => x.pnlProfit ?? 0),
    depreciation: add((x) => x.depreciation),
    workingCapital: labels.map((label) => ({ label, amount: add((x) => x.workingCapital.find((w) => w.label === label)?.amount ?? 0) })),
    operating: add((x) => x.operating),
    capex: add((x) => x.capex),
    investments: add((x) => x.investments),
    investing: add((x) => x.investing),
    equity: add((x) => x.equity),
    loans: add((x) => x.loans),
    financing: add((x) => x.financing),
    retained: add((x) => x.retained),
    other: add((x) => x.other),
    netChange: add((x) => x.netChange),
    openingCash: first.openingCash,
    closingCash: last.closingCash,
    openingNetCash: first.openingNetCash,
    closingNetCash: last.closingNetCash,
    asOf: last.asOf,
    warnings: [...new Set(fs.flatMap((x) => x.warnings.map((w) => `${monthLabel(x.period)}: ${w}`)))],
  };
}

export function periodFlows(flows: CashFlow[], cols: PeriodCol[]): PeriodFlow[] {
  const by = new Map(flows.map((f) => [f.period, f]));
  return cols.map((col) => {
    const have = col.members.filter((m) => by.has(m)).map((m) => by.get(m)!);
    const missing = col.members.filter((m) => !by.has(m)).sort();
    const flow = sumFlows(have, col.label);
    if (flow && missing.length) flow.warnings = [`No cash flow for ${missing.map(monthLabel).join(', ')}: the column covers ${have.length} of ${col.members.length} months.`, ...flow.warnings];
    return { col, flow, missing };
  });
}

/**
 * Statements re-cut to the columns, for the tabs and the Excel / PDF: `period` = the column label. Columns with no
 * data at all are dropped (Trial Balances go back about 13 months, the P&L further).
 */
export function statementsForCols(built: { sheets: BalanceSheet[]; flows: CashFlow[] } | null, cols: PeriodCol[]): { sheets: BalanceSheet[]; flows: CashFlow[]; sheetNotes: Record<string, string>; flowMissing: Record<string, string[]> } {
  if (!built) return { sheets: [], flows: [], sheetNotes: {}, flowMissing: {} };
  const ps = periodSheets(built.sheets, cols).filter((p) => p.sheet);
  const pf = periodFlows(built.flows, cols).filter((p) => p.flow);
  const sheetNotes: Record<string, string> = {};
  for (const p of ps) if (p.note) sheetNotes[p.col.label] = p.note;
  const flowMissing: Record<string, string[]> = {};
  for (const p of pf) if (p.missing.length) flowMissing[p.col.label] = p.missing;
  return {
    sheets: ps.map((p) => ({ ...p.sheet!, period: p.col.label, warnings: p.note ? [p.note, ...p.sheet!.warnings] : p.sheet!.warnings })),
    flows: pf.map((p) => p.flow!),
    sheetNotes,
    flowMissing,
  };
}
