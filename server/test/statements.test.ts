// Live Balance Sheet + Cash Flow from stored Tally Trial Balances (made-up figures; Tally's group names).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceSheet, cashFlow, misCashRows, sideOf, statements, type StatementMonthIn, type TbRowIn } from '../../client/src/data/statements/statements.ts';

const g = (name: string, bal: number): TbRowIn => ({ name, level: 'group', debit: bal > 0 ? bal : 0, credit: bal < 0 ? -bal : 0 });
const l = (name: string, bal: number): TbRowIn => ({ ...g(name, bal), level: 'ledger' });

// A tied TB (Σ Dr = Σ Cr). Dr positive.
function tb(o: { bank: number; debtors: number; creditors: number; fa: number; loans: number; capital: number; sales: number; exp: number; od?: number }): TbRowIn[] {
  const rows = [
    g('Capital Account', -o.capital), l('Share Capital', -o.capital),
    g('Loans (Liability)', -o.loans - (o.od ?? 0)), l('Term Loan', -o.loans), ...(o.od ? [l('Central Bank OD A/c', -o.od)] : []),
    g('Current Liabilities', -o.creditors), l('Sundry Creditors', -o.creditors),
    g('Fixed Assets', o.fa), l('Plant & Machinery', o.fa),
    g('Current Assets', o.bank + o.debtors), l('Bank Accounts', o.bank), l('Sundry Debtors', o.debtors),
    g('Sales Accounts', -o.sales), g('Indirect Expenses', o.exp),
  ];
  const sum = rows.filter((r) => r.level === 'group').reduce((s, r) => s + r.debit - r.credit, 0);
  if (sum !== 0) rows.push(g('Opening Stock', -sum)); // balancing figure for the test, a P&L item
  return rows;
}
const m = (period: string, rows: TbRowIn[], closingStock: number, depreciation = 0): StatementMonthIn =>
  ({ period, asOf: `${period}-28T10:00:00Z`, tb: { rows, difference: 0 }, closingStock, depreciation, nettProfit: null });

test('groups land on the right side', () => {
  assert.equal(sideOf('Capital Account'), 'equity');
  assert.equal(sideOf('Profit & Loss A/c'), 'equity');
  assert.equal(sideOf('Loans (Liability)'), 'liability');
  assert.equal(sideOf('Current Liabilities'), 'liability');
  assert.equal(sideOf('Fixed Assets'), 'asset');
  assert.equal(sideOf('Current Assets'), 'asset');
  assert.equal(sideOf('Indirect Expenses'), 'pnl');
  assert.equal(sideOf('Opening Stock'), 'pnl');
  assert.equal(sideOf('Suspense A/c'), 'other');
});

test('Balance Sheet ties, splits cash and OD, profit to date includes closing stock', () => {
  const b = balanceSheet(m('2026-09', tb({ bank: 300, debtors: 200, creditors: 150, fa: 1000, loans: 400, capital: 1000, sales: 800, exp: 650, od: 100 }), 250))!;
  assert.equal(b.totalAssets, b.totalEquityLiabilities);
  assert.equal(b.cash, 300);
  assert.equal(b.bankOd, 100);
  assert.deepEqual(b.warnings, []);
  assert.ok(b.assets.some((a) => a.label === 'Closing Stock' && a.amount === 250));
  assert.ok(b.equity.some((e) => e.label === 'Profit for the year to date'));
});

test('Cash Flow: sections add up to the change in cash; equity and loans are financing; depreciation added back', () => {
  const sep = m('2026-09', tb({ bank: 300, debtors: 200, creditors: 150, fa: 1000, loans: 400, capital: 1000, sales: 800, exp: 650 }), 250);
  const oct = m('2026-10', tb({ bank: 900, debtors: 260, creditors: 190, fa: 1100, loans: 500, capital: 1500, sales: 1000, exp: 780 }), 230, 20);
  const { sheets, flows } = statements([oct, sep]);
  assert.equal(sheets.length, 2);
  assert.equal(flows.length, 1);
  const f = flows[0];
  assert.equal(f.period, '2026-10');
  assert.equal(f.netChange, 600);
  assert.equal(r(f.operating + f.investing + f.financing + f.other), 600);
  assert.equal(f.equity, 500);
  assert.equal(f.loans, 100);
  assert.equal(f.depreciation, 20);
  assert.equal(f.capex, -120);              // ΔFA 100 + depreciation 20
  assert.equal(Math.abs(f.other) < 1, true); // everything explained
  const c = cashFlow(sheets[0], sheets[1], 20);
  assert.equal(c.closingCash, 900);
  const cash = misCashRows(flows, '2026-10')!;
  assert.equal(cash.funding, 500);
  assert.equal(cash.cashBurn, -100); // 300 + 500 equity − 900: more cash came in than equity alone
  assert.equal(misCashRows(flows, '2026-09'), null);
});

test('a TB that does not tie shows its difference instead of hiding it', () => {
  const rows = tb({ bank: 300, debtors: 200, creditors: 150, fa: 1000, loans: 400, capital: 1000, sales: 800, exp: 650 });
  rows.push(g('Fixed Assets', 7)); // stray debit
  const b = balanceSheet(m('2026-09', rows, 250))!;
  assert.ok(b.liabilities.some((x) => x.label === 'Difference in Trial Balance'));
  assert.equal(b.totalAssets, b.totalEquityLiabilities);
  assert.match(b.warnings[0], /doesn't tie/);
});

const r = (n: number) => Math.round(n * 100) / 100;
