import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ceoSummary, type TbRowIn } from '../src/connectors/tally/ceoSummary.js';

const g = (name: string, bal: number): TbRowIn => ({ name, level: 'group', debit: bal > 0 ? bal : 0, credit: bal < 0 ? -bal : 0 });
const tb = (sales: number, ind: number, bank: number, od: number) => ({
  rows: [g('Sales Accounts', -sales), g('Indirect Expenses', ind), g('Bank Accounts', bank), g('Bank OD A/c', -od), g('Sundry Debtors', 500), g('Sundry Creditors', -300)],
  difference: 0, basis: 'fy-to-date',
});

test('monthly flows from FY-to-date TBs, balances at month end', () => {
  const r = ceoSummary([
    { period: '2026-04', tb: tb(100, 40, 1000, 200), pnl: { nettProfit: 60, ledgerRows: [{ name: 'Rent', amount: 30 }, { name: 'Closing Stock', amount: 900 }] } },
    { period: '2026-05', tb: tb(250, 90, 1200, 100), pnl: { nettProfit: 100, ledgerRows: [{ name: 'Rent', amount: 30 }, { name: 'Salary', amount: 20 }, { name: 'Sales - Amazon', amount: 150 }] } },
  ]);
  const [apr, may] = r.months;
  assert.equal(apr.sales, 100);
  assert.equal(may.sales, 150);
  assert.equal(may.indirectExp, 50);
  assert.equal(may.netCash, 1100);
  assert.equal(may.debtors, 500);
  assert.equal(may.creditors, 300);
  assert.equal(apr.closingStock, 900);
  assert.deepEqual(r.topExpenses?.rows.map((x) => x.ledger), ['Rent', 'Salary']);
});

test('a missing TB blanks the flow, never zero', () => {
  const r = ceoSummary([
    { period: '2026-05', tb: tb(250, 90, 1200, 100), pnl: null },
    { period: '2026-07', tb: tb(400, 120, 900, 0), pnl: null },
  ]);
  assert.equal(r.months[1].sales, null);
  assert.equal(r.months[1].cashBank, 900);
  assert.ok(r.notes.length);
});
