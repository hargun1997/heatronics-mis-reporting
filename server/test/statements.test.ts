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
  ({ period, asOf: new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 10)).toISOString(), tb: { rows, difference: 0, basis: 'fy-to-date' }, closingStock, depreciation, nettProfit: null });

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
  // Tally's 28 reserved groups (15 primary + 13 sub-groups) and the rows its Trial Balance adds.
  const want: Record<string, string> = {
    'Branch / Divisions': 'other', 'Capital Account': 'equity', 'Current Assets': 'asset', 'Current Liabilities': 'liability',
    'Direct Expenses': 'pnl', 'Direct Incomes': 'pnl', 'Fixed Assets': 'asset', 'Indirect Expenses': 'pnl', 'Indirect Incomes': 'pnl',
    'Investments': 'asset', 'Loans (Liability)': 'liability', 'Misc. Expenses (ASSET)': 'asset', 'Purchase Accounts': 'pnl',
    'Sales Accounts': 'pnl', 'Suspense A/c': 'other',
    'Bank Accounts': 'asset', 'Bank OD A/c': 'liability', 'Bank OCC A/c': 'liability', 'Cash-in-Hand': 'asset', 'Deposits (Asset)': 'asset',
    'Duties & Taxes': 'liability', 'Loans & Advances (Asset)': 'asset', 'Provisions': 'liability', 'Reserves & Surplus': 'equity',
    'Secured Loans': 'liability', 'Stock-in-Hand': 'asset', 'Sundry Creditors': 'liability', 'Sundry Debtors': 'asset', 'Unsecured Loans': 'liability',
    'Opening Stock': 'pnl', 'Profit & Loss A/c': 'equity', 'Difference in opening balances': 'other',
  };
  for (const [name, side] of Object.entries(want)) assert.equal(sideOf(name), side, name);
  assert.equal(sideOf('  current   assets '), 'asset');
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
  const cash = misCashRows(flows, '2026-10', '2026-12-01')!;
  assert.equal(cash.funding, 500);
  assert.equal(cash.cashBurn, -100); // 300 + 500 equity − 900: more cash came in than equity alone
  assert.equal(misCashRows(flows, '2026-09', '2026-12-01'), null);
  assert.equal(misCashRows(flows, '2026-10', '2026-10-20'), null); // the running month is never a whole month
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

// ---- 2 Nov 2026 review fixes ---------------------------------------------------------------------------------------

/** A tied TB (Dr positive) from free rows: the last group balances it as Opening Stock (a P&L item). */
function tied(rows: TbRowIn[]): TbRowIn[] {
  const sum = rows.filter((x) => x.level === 'group').reduce((s, x) => s + x.debit - x.credit, 0);
  return sum ? [...rows, g('Opening Stock', -sum)] : rows;
}
const fy = (period: string, rows: TbRowIn[], closingStock: number | null, extra: Partial<StatementMonthIn> = {}): StatementMonthIn =>
  ({ period, asOf: null, tb: { rows, difference: 0, basis: 'fy-to-date' }, closingStock, depreciation: 0, nettProfit: null, ...extra });

test('stock the TB carries under Current Assets (Tally: opening stock) is replaced by the P&L closing stock', () => {
  // Sales 1,000 − purchases 600; opening stock 400 sits under Current Assets → Stock-in-Hand; closing stock 500;
  // earlier years' loss 400 in P&L A/c. Tied: Dr 900 + 600 + 400 = Cr 900 + 1,000.
  const rows = [
    g('Capital Account', -900), g('Current Assets', 900), l('Bank Accounts', 500), l('Stock-in-Hand', 400),
    g('Sales Accounts', -1000), g('Purchase Accounts', 600), g('Profit & Loss A/c', 400),
  ];
  const b = balanceSheet(fy('2026-09', rows, 500))!;
  assert.equal(b.tbStock, 400);
  assert.equal(b.fyProfit, 500); // 1,000 − (400 opening + 600 purchases) + 500 closing
  assert.ok(b.assets.some((a) => a.label === 'Current Assets' && a.amount === 500)); // stock taken out of Current Assets
  assert.ok(b.assets.some((a) => a.label === 'Closing Stock' && a.amount === 500));
  assert.equal(b.cash, 500);
  assert.equal(b.totalAssets, b.totalEquityLiabilities);
  // Same books with Opening Stock as its own P&L row → same profit.
  const rows2 = [g('Capital Account', -900), g('Current Assets', 500), l('Bank Accounts', 500), g('Opening Stock', 400), g('Sales Accounts', -1000), g('Purchase Accounts', 600), g('Profit & Loss A/c', 400)];
  assert.equal(balanceSheet(fy('2026-09', rows2, 500))!.fyProfit, 500);
  // No P&L copy → the TB's stock stays, with a warning.
  const nb = balanceSheet(fy('2026-09', rows, null))!;
  assert.equal(nb.fyProfit, 400); // closing taken = opening 400 → sales − purchases
  assert.equal(nb.totalAssets, nb.totalEquityLiabilities);
  assert.match(nb.warnings.join(' '), /No closing stock/);
});

test('sub-groups listed with their own ledgers are not counted twice (masters, and without them)', () => {
  const rows = tied([
    g('Capital Account', -2000),
    g('Current Assets', 1000), l('Bank Accounts', 500), l('HDFC Bank', 300), l('ICICI Bank', 200), l('Sundry Debtors', 500), l('Shop A', 500),
    g('Loans (Liability)', -700), l('Bank OD A/c', -400), l('Central Bank CC', -400), l('Term Loan', -300),
    g('Fixed Assets', 1000),
  ]);
  const parents = {
    'Bank Accounts': 'Current Assets', 'HDFC Bank': 'Bank Accounts', 'ICICI Bank': 'Bank Accounts', 'Sundry Debtors': 'Current Assets',
    'Shop A': 'Sundry Debtors', 'Bank OD A/c': 'Loans (Liability)', 'Central Bank CC': 'Bank OD A/c', 'Term Loan': 'Loans (Liability)',
  };
  const withM = balanceSheet(fy('2026-09', rows, 0), parents)!;
  assert.equal(withM.cash, 500);
  assert.equal(withM.bankOd, 400);
  const caM = withM.assets.find((a) => a.label === 'Current Assets')!;
  assert.deepEqual(caM.children!.map((c) => c.label), ['Bank Accounts', 'Sundry Debtors']);
  assert.deepEqual(caM.children![0].children!.map((c) => c.label), ['HDFC Bank', 'ICICI Bank']);
  assert.deepEqual(withM.warnings, []);
  // No masters: a row followed by rows that add up to it is a sub-group and its ledgers.
  const noM = balanceSheet(fy('2026-09', rows, 0))!;
  assert.equal(noM.cash, 500);
  assert.equal(noM.bankOd, 400);
  assert.deepEqual(noM.warnings, []);
});

test('cash: a bank ledger filed straight under Current Assets counts; deposits, OD and debtors do not', () => {
  const rows = tied([
    g('Capital Account', -1000),
    g('Current Assets', 1000), l('HDFC Bank', 250), l('Petty Cash', 50), l('Fixed Deposit - HDFC Bank', 300), l('Godrej Traders', 400),
  ]);
  const b = balanceSheet(fy('2026-09', rows, 0))!;
  assert.equal(b.cash, 300);
  // With masters, a ledger under Bank Accounts counts whatever its name; one under Sundry Debtors never does.
  const b2 = balanceSheet(fy('2026-09', tied([g('Capital Account', -100), g('Current Assets', 100), l('Kotak 1234', 60), l('Bank of Baroda Traders', 40)])),
    { 'Kotak 1234': 'Bank Accounts', 'Bank Accounts': 'Current Assets', 'Bank of Baroda Traders': 'Sundry Debtors', 'Sundry Debtors': 'Current Assets' })!;
  assert.equal(b2.cash, 60);
});

test('FY boundary: April resets profit, the carry-forward into P&L A/c is not "other"; a prior-period entry is shown', () => {
  // March end: retained 1,000 Cr, FY profit 300 (sales 800 − exp 500), bank 2,300.
  const mar = fy('2027-03', [g('Capital Account', -1000), g('Profit & Loss A/c', -1000), g('Current Assets', 2300), l('Bank Accounts', 2300), g('Sales Accounts', -800), g('Indirect Expenses', 500)], 0, { nettProfit: 40 });
  // April end: Tally carried 300 into P&L A/c (1,300); April profit 50 (sales 100 − exp 50); bank 2,350.
  const apr = fy('2027-04', [g('Capital Account', -1000), g('Profit & Loss A/c', -1300), g('Current Assets', 2350), l('Bank Accounts', 2350), g('Sales Accounts', -100), g('Indirect Expenses', 50)], 0, { nettProfit: 50 });
  const { flows } = statements([mar, apr]);
  const f = flows[0];
  assert.equal(f.profit, 50);
  assert.equal(f.retained, 0);
  assert.equal(f.other, 0);
  assert.equal(f.netChange, 50);
  assert.deepEqual(f.warnings, []);
  // A prior-period adjustment of −20 booked straight to P&L A/c in May (cash paid) → its own line, not unexplained.
  const may = fy('2027-05', [g('Capital Account', -1000), g('Profit & Loss A/c', -1280), g('Current Assets', 2330), l('Bank Accounts', 2330), g('Sales Accounts', -100), g('Indirect Expenses', 50)], 0, { nettProfit: 0 });
  const f2 = statements([apr, may]).flows[0];
  assert.equal(f2.profit, 0);
  assert.equal(f2.retained, -20);
  assert.equal(f2.other, 0);
});

test('cross-checks: monthly profit vs the P&L copy, a large unexplained movement, and an old month-start copy', () => {
  const sep = fy('2026-09', [g('Capital Account', -1000), g('Current Assets', 1000), l('Bank Accounts', 1000)], 0);
  const oct = fy('2026-10', [g('Capital Account', -1000), g('Suspense A/c', -50_000), g('Current Assets', 51_000), l('Bank Accounts', 51_000)], 0, { nettProfit: 5_000 });
  const f = statements([sep, oct]).flows[0];
  assert.equal(f.profit, 0);
  assert.equal(f.pnlProfit, 5000);
  assert.equal(f.other, 50_000);
  assert.equal(f.warnings.length, 2);
  assert.match(f.warnings[0], /differs from the month's P&L/);
  assert.match(f.warnings[1], /isn't explained/);
  const old = balanceSheet({ ...oct, tb: { ...oct.tb!, basis: null } })!;
  assert.match(old.warnings.join(' '), /month start/);
});

test('MIS cash rows: burn and runway (quarters) over consecutive calendar months only', () => {
  const flow = (period: string, open: number, close: number, equity = 0, asOf: string | null = null) => ({ period, openingCash: open, closingCash: close, openingNetCash: open, closingNetCash: close, equity, asOf }) as unknown as import('../../client/src/data/statements/statements.ts').CashFlow;
  const flows = [flow('2026-05', 900, 800), flow('2026-08', 600, 500), flow('2026-09', 500, 400), flow('2026-10', 400, 1200, 1000)];
  const T = '2026-11-20';
  const oct = misCashRows(flows, '2026-10', T)!;
  assert.equal(oct.cashBurn, 200); // 400 + 1,000 − 1,200
  assert.equal(oct.runway, 3);     // 1,200 ÷ (3 × avg burn of Aug–Oct 133.33)
  const aug = misCashRows(flows, '2026-08', T)!; // May is not one of the 2 months before August → only August counts
  assert.equal(aug.runway, r(500 / 300));
  assert.equal(misCashRows([flow('2026-10', 100, 300)], '2026-10', T)!.runway, null); // not burning
  // books copied 2 days after month end: not a whole month (round 7 #2)
  assert.equal(misCashRows([flow('2026-10', 400, 300, 0, '2026-11-02T06:00:00Z')], '2026-10', T), null);
});

test('MIS cash rows are on NET cash: an overdraft-funded burn shows (round 7 #2)', () => {
  const P = { 'Bank Accounts': 'Current Assets', 'Central Bank OD A/c': 'Loans (Liability)' };
  // Aug bank 80 / OD 0 → Sep bank 72 / OD 20: gross cash fell 8, net cash fell 28.
  const aug = m('2026-08', tb({ bank: 80, debtors: 0, creditors: 0, fa: 0, loans: 0, capital: 300, sales: 100, exp: 140 }), 0);
  const sep = m('2026-09', tb({ bank: 72, od: 20, debtors: 0, creditors: 0, fa: 0, loans: 0, capital: 300, sales: 120, exp: 188 }), 0);
  const { flows } = statements([aug, sep], P);
  const rows = misCashRows(flows, '2026-09', '2026-11-10')!;
  assert.equal(rows.openingCash, 80);
  assert.equal(rows.closingCash, 52);
  assert.equal(rows.cashBurn, 28);
});

test('a month without its P&L copy and no TB stock: stock unknown, no 0 printed, no cash flow (round 7 #8)', () => {
  const sep = m('2026-09', tb({ bank: 300, debtors: 200, creditors: 150, fa: 1000, loans: 400, capital: 1000, sales: 800, exp: 650 }), 250);
  const oct = { ...m('2026-10', tb({ bank: 900, debtors: 260, creditors: 190, fa: 1100, loans: 500, capital: 1500, sales: 1000, exp: 780 }), 0), closingStock: null };
  const { sheets, flows } = statements([sep, oct]);
  const b = sheets.find((x) => x.period === '2026-10')!;
  assert.equal(b.stockUnknown, true);
  assert.ok(!b.assets.some((x) => x.label === 'Closing Stock'));
  assert.ok(b.warnings.some((w) => /Stock unknown/.test(w)));
  assert.equal(flows.length, 0);
});

test('MIS Sheet splits OpEx with the right signs (opexLines are effect-signed: costs negative, income positive)', async () => {
  const { liveMisPoint } = await import('../../client/src/data/misDeck/liveViews.ts');
  const p = {
    members: ['2026-04'], level: 'full', netRevenue: 1000, opex: 494, ebitda: -100, cm3: 394,
    opexLines: { 'Payroll (Employee Cost – Indirect)': -275, 'Professional Fees': -17, 'Other Income (Indirect Incomes)': 10, 'Admin & General Expenses': -212 },
  } as any;
  // Only the company branch's opex split is under test; stub the rest of PeriodAgg loosely.
  let pt: any;
  try { pt = liveMisPoint({ ...p, netByChannel: {}, grossByChannel: {}, returnsByChannel: {}, ordersByChannel: {}, estOrdersByChannel: {}, totalGrossRevenue: 0, totalReturns: 0, totalTaxes: 0, hasBuildUp: false, cogm: 0, grossMargin: 0, channelFulfillment: 0, cm1: 0, salesMarketing: 0, cm2: 0, platformCosts: 0, ordersMonths: 1 }, 'company', [], {}); }
  catch (e) { throw new Error(`liveMisPoint threw on the stub: ${(e as Error).message}`); }
  assert.equal(pt.payroll, 275);
  assert.equal(pt.profFee, 17);
  assert.equal(pt.otherIncome, 10);
  assert.equal(pt.otherExpense, 212);
  assert.equal(pt.payroll + pt.profFee + pt.otherExpense - pt.otherIncome, 494);
});
