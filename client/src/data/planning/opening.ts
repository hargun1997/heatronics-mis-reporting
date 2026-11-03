// Opening position of the plan from a Tally month-end balance sheet (Sep-26 for an Oct-26 start).
// Pure: takes the month as /api/tally/statements returns it and maps the balance sheet
// (client/src/data/statements/statements.ts) onto the planner's opening inputs. Nothing here writes to Tally.

import { balanceSheet, type BsLine, type StatementMonthIn } from '../statements/statements';
import type { PlanFx } from './engine';

type Opening = PlanFx['opening'];

const kids = (lines: BsLine[]) => lines.flatMap((l) => l.children ?? []);

/** The month before the plan starts: startMonth "2026-10" → "2026-09". */
export function monthBefore(startMonth: string): string {
  const [y, m] = startMonth.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function openingFromTally(month: StatementMonthIn, keep: Opening): { opening: Opening; warnings: string[] } | null {
  const bs = balanceSheet(month);
  if (!bs) return null;
  const warnings = [...bs.warnings];
  const sum = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0);
  const debt = sum(bs.liabilities.filter((l) => /loans? \(liability\)|secured loans|unsecured loans|bank od/i.test(l.label)));
  const debtors = sum(kids(bs.assets).filter((c) => /sundry debtors/i.test(c.label)));
  const creditors = sum(kids(bs.liabilities).filter((c) => /sundry creditors/i.test(c.label)));
  // debit balances inside Duties & Taxes (GST input credit) are an asset
  const gstAsset = -sum(kids(bs.liabilities).filter((c) => /gst|duties|input|igst|cgst|sgst/i.test(c.label) && c.amount < 0));
  const stock = bs.assets.find((l) => /^closing stock$/i.test(l.label))?.amount ?? 0;
  const retained = sum([...bs.equity, ...kids(bs.equity)].filter((l) => /profit\s*&\s*loss|profit for the year/i.test(l.label)));
  if (!debtors && !creditors) warnings.push('Sundry Debtors / Creditors were not split out of Current Assets / Liabilities — receivables and payables left at 0.');
  return {
    warnings,
    opening: {
      ...keep, on: true, cash: Math.max(0, bs.cash), receivables: Math.max(0, debtors), payables: Math.max(0, creditors), inventory: Math.max(0, stock),
      gstAsset: Math.max(0, gstAsset), debt: Math.max(0, debt), // tax losses (audited ITR computation) are kept: Tally only knows book losses
      accumulatedLosses: keep.accumulatedLosses || Math.max(0, -retained),
      source: 'tally', asOf: month.asOf ?? month.period,
      note: `Tally balance sheet ${month.period}. Accumulated tax losses stay at the audited FY26 figure (₹19.7 L) when set; otherwise book losses are used.`,
    },
  };
}
