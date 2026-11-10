import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ceoSummary, type TbRowIn } from '../src/connectors/tally/ceoSummary.js';

const g = (name: string, bal: number): TbRowIn => ({ name, level: 'group', debit: bal > 0 ? bal : 0, credit: bal < 0 ? -bal : 0 });
const l = (name: string, bal: number): TbRowIn => ({ ...g(name, bal), level: 'ledger' });
// A real Tally TB: only the PRIMARY groups are 'group' rows; sub-groups (Bank Accounts, Bank OD A/c, Sundry Debtors …)
// come as 'ledger' rows right before their own ledgers (tb.ts). The old fixture made them groups and hid the null balances.
const parents = {
  'Bank Accounts': 'Current Assets', 'HDFC Bank': 'Bank Accounts', 'Sundry Debtors': 'Current Assets', 'Cust A': 'Sundry Debtors',
  'Bank OD A/c': 'Loans (Liability)', 'Central Bank OD': 'Bank OD A/c', 'Sundry Creditors': 'Current Liabilities', 'Vendor A': 'Sundry Creditors',
  'D2C Sales': 'Sales Accounts', 'Stock Transfers': 'Sales Accounts',
};
const tb = (sales: number, ind: number, bank: number, od: number, st = 0) => ({
  rows: [
    g('Sales Accounts', -(sales + st)), l('D2C Sales', -sales), l('Stock Transfers', -st), g('Purchase Accounts', st + 10),
    g('Indirect Expenses', ind),
    g('Current Assets', bank + 500), l('Bank Accounts', bank), l('HDFC Bank', bank), l('Sundry Debtors', 500), l('Cust A', 500),
    g('Loans (Liability)', -od), l('Bank OD A/c', -od), l('Central Bank OD', -od),
    g('Current Liabilities', -300), l('Sundry Creditors', -300), l('Vendor A', -300),
  ],
  difference: 0, basis: 'fy-to-date',
});

test('monthly flows from FY-to-date TBs, balances at month end', () => {
  const r = ceoSummary([
    { period: '2026-04', tb: tb(100, 40, 1000, 200), pnl: { nettProfit: 60, ledgerRows: [{ name: 'Rent', amount: 30 }, { name: 'Closing Stock', amount: 900 }] } },
    { period: '2026-05', tb: tb(250, 90, 1200, 100), pnl: { nettProfit: 100, ledgerRows: [{ name: 'Rent', amount: 30 }, { name: 'Salary', amount: 20 }, { name: 'Sales - Amazon', amount: 150 }] } },
  ], 13, { parents });
  const [apr, may] = r.months;
  assert.equal(apr.sales, 100);
  assert.equal(may.sales, 150);
  assert.equal(may.indirectExp, 50);
  assert.equal(may.netCash, 1100);
  assert.equal(may.cashBank, 1200);
  assert.equal(may.overdraft, 100);
  assert.equal(may.loans, 100);
  assert.equal(may.debtors, 500);
  assert.equal(may.creditors, 300);
  assert.equal(apr.closingStock, 900);
  assert.deepEqual(r.topExpenses?.rows.map((x) => x.ledger), ['Rent', 'Salary']);
});

test('a missing TB blanks the flow, never zero', () => {
  const r = ceoSummary([
    { period: '2026-05', tb: tb(250, 90, 1200, 100), pnl: null },
    { period: '2026-07', tb: tb(400, 120, 900, 0), pnl: null },
  ], 13, { parents });
  assert.equal(r.months[1].sales, null);
  assert.equal(r.months[1].cashBank, 900);
  assert.ok(r.notes.length);
});

test('balances are read without masters too (a sub-group row followed by its ledgers)', () => {
  const r = ceoSummary([{ period: '2026-05', tb: tb(250, 90, 1200, 100), pnl: null }]);
  assert.equal(r.months[0].cashBank, 1200);
  assert.equal(r.months[0].overdraft, 100);
  assert.equal(r.months[0].debtors, 500);
  assert.equal(r.months[0].creditors, 300);
});

test('sales and purchases exclude Stock Transfers (round 7 #1): GM ₹ unchanged', () => {
  const r = ceoSummary([
    { period: '2026-04', tb: tb(100, 40, 1000, 0, 60), pnl: null },
    { period: '2026-05', tb: tb(250, 90, 1000, 0, 93), pnl: null },
  ], 13, { parents });
  const [apr, may] = r.months;
  assert.equal(apr.sales, 100);         // not 160
  assert.equal(apr.purchases, 10);      // 70 − 60
  assert.equal(apr.stockTransfers, 60);
  assert.equal(may.sales, 150);         // 250 − 100, not 183
  assert.equal(may.stockTransfers, 33);
  assert.equal((apr.sales ?? 0) - (apr.purchases ?? 0), 160 - 70); // margin as booked
  assert.ok(r.notes.some((n) => /Stock Transfers/.test(n)));
});

test('complete: a running month or books copied < 5 days after month end are not whole months', () => {
  const r = ceoSummary([
    { period: '2026-09', tbAsOf: '2026-11-02T06:00:00Z', tb: tb(100, 40, 1000, 0), pnl: null },
    { period: '2026-10', tbAsOf: '2026-11-02T06:00:00Z', tb: tb(150, 60, 900, 0), pnl: null },
    { period: '2026-11', tbAsOf: '2026-11-02T06:00:00Z', tb: tb(160, 61, 890, 0), pnl: null },
  ], 13, { parents, today: '2026-11-10' });
  assert.deepEqual(r.months.map((m) => m.complete), [true, false, false]);
});
