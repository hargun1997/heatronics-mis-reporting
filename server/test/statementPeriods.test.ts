// Statements on the Live MIS period row (PR 3, 22 Nov 2026): Balance Sheet at each period end, Cash Flow summed over
// the period's months, missing months flagged, empty columns dropped. Pure, made-up figures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodFlows, periodSheets, statementsForCols, sumFlows } from '../../client/src/data/statements/statementPeriods.ts';
import type { BalanceSheet, CashFlow } from '../../client/src/data/statements/statements.ts';

const bs = (period: string, cash: number): BalanceSheet => ({ period, asOf: null, equity: [], liabilities: [], assets: [], totalEquityLiabilities: 0, totalAssets: 0, cash, bankOd: 0, fyProfit: 0, retained: 0, tbStock: 0, workingCapital: 0, warnings: [] });
const cf = (period: string, open: number, change: number): CashFlow => ({
  period, profit: change, pnlProfit: change, depreciation: 1, workingCapital: [{ label: 'Debtors', amount: -1 }], operating: change, capex: 0, investments: 0, investing: 0,
  equity: 0, loans: 0, financing: 0, retained: 0, other: 0, netChange: change, openingCash: open, closingCash: open + change, openingNetCash: open, closingNetCash: open + change, asOf: null, warnings: [],
});
const sheets = [bs('2026-07', 10), bs('2026-08', 12), bs('2026-09', 15), bs('2026-10', 11)];
const flows = [cf('2026-08', 10, 2), cf('2026-09', 12, 3), cf('2026-10', 15, -4)];
const q2 = { key: 'q2', label: 'Q2 FY27', members: ['2026-07', '2026-08', '2026-09'] };
const q3 = { key: 'q3', label: 'Q3 FY27', members: ['2026-10', '2026-11', '2026-12'] };
const old = { key: 'q1-25', label: 'Q1 FY26', members: ['2025-04', '2025-05', '2025-06'] };

test('Balance Sheet of a period = its last month end with a TB; a later month without one is named', () => {
  const [a, b, c] = periodSheets(sheets, [q2, q3, old]);
  assert.equal(a.sheet?.cash, 15);
  assert.equal(a.note, null);
  assert.equal(b.sheet?.cash, 11);
  assert.equal(b.asOfMonth, '2026-10');
  assert.match(b.note ?? '', /end of Oct 26: no Trial Balance for Nov 26, Dec 26/);
  assert.equal(c.sheet, null);
});

test('Cash Flow of a period = the sum of its months; opening = first, closing = last; ties to the net change', () => {
  const s = sumFlows([flows[1], flows[0]], 'Aug–Sep')!; // order does not matter
  assert.equal(s.netChange, 5);
  assert.equal(s.openingCash, 10);
  assert.equal(s.closingCash, 15);
  assert.equal(s.openingCash + s.netChange, s.closingCash);
  assert.deepEqual(s.workingCapital, [{ label: 'Debtors', amount: -2 }]);
  assert.equal(s.depreciation, 2);
  assert.equal(sumFlows([{ ...flows[0], pnlProfit: null }, flows[1]], 'x')!.pnlProfit, null);
  const [p2] = periodFlows(flows, [q2]);
  assert.deepEqual(p2.missing, ['2026-07']); // July has no flow (no June TB)
  assert.match(p2.flow!.warnings[0], /No cash flow for Jul 26: the column covers 2 of 3 months/);
});

test('statementsForCols: columns labelled, empty ones dropped, notes kept', () => {
  const v = statementsForCols({ sheets, flows }, [old, q2, q3]);
  assert.deepEqual(v.sheets.map((x) => x.period), ['Q2 FY27', 'Q3 FY27']);
  assert.deepEqual(v.flows.map((x) => x.period), ['Q2 FY27', 'Q3 FY27']);
  assert.ok(v.sheetNotes['Q3 FY27']);
  assert.deepEqual(v.flowMissing['Q2 FY27'], ['2026-07']);
  assert.deepEqual(statementsForCols(null, [q2]).sheets, []);
  // Monthly columns: one month each, same numbers as the month itself.
  const m = statementsForCols({ sheets, flows }, [{ key: '2026-09', label: 'Sep 26', members: ['2026-09'] }]);
  assert.equal(m.sheets[0].cash, 15);
  assert.equal(m.flows[0].netChange, 3);
});
