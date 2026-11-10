// Server-side Tally books readers after the audit fixes (round 7 #1–#3, #7–#11, #15; round 10 A1–A3, A7, C1, D).
// Synthetic books only (made-up figures, Tally's own group names).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ceoSummary } from '../src/connectors/tally/ceoSummary.js';
import { bucketOfLedger, ceoSummaryV2, channelOfLedger, costsOut, expensesOf, fyOut, netCashMonths, type V2MonthIn } from '../src/connectors/tally/ceoSummaryV2.js';
import { booksComplete, leafDr, NOT_EXPENSE, salesPurchases, stockTransfers, subTotal, tbLeaves, type TbRow } from '../src/connectors/tally/tbRows.js';
import { buildRunway, netCashFlows } from '../src/services/cashRunway.js';
import { booksLabel, buildMorningBrief } from '../src/services/morningBrief.js';
import { keepCopy, tbBackfill } from '../src/connectors/tally/snapshots.js';
import { committedCopy, pickPnlCopy, pnlCopyGaps } from '../src/connectors/tally/pnlCopies.js';
import { serverItems } from '../src/services/issuesInbox.js';
import { scanIssues } from '../src/services/anomalyScan.js';
import { expenseRows } from '../src/routes/expenses.js';
import type { ExtractedReport } from '../src/ingest/objectStore.js';

const g = (name: string, bal: number): TbRow => ({ name, level: 'group', debit: bal > 0 ? bal : 0, credit: bal < 0 ? -bal : 0 });
const l = (name: string, bal: number): TbRow => ({ ...g(name, bal), level: 'ledger' });
const L = 100_000;

// ---- a tied book shaped like Tally's (round 7 t1): primary groups = 'group', sub-groups + ledgers = 'ledger'
const parents: Record<string, string> = {
  'Share Capital': 'Capital Account', 'Secured Loans': 'Loans (Liability)', 'Unsecured Loans': 'Loans (Liability)', 'Bank OD A/c': 'Loans (Liability)',
  'HDFC Term Loan': 'Secured Loans', 'Director Loan': 'Unsecured Loans', 'Central Bank OD': 'Bank OD A/c',
  'Sundry Creditors': 'Current Liabilities', 'Duties & Taxes': 'Current Liabilities', 'Vendor A': 'Sundry Creditors', GST: 'Duties & Taxes',
  'Bank Accounts': 'Current Assets', 'Sundry Debtors': 'Current Assets', 'HDFC Bank': 'Bank Accounts', 'ICICI Bank': 'Bank Accounts', 'Cust A': 'Sundry Debtors',
  Plant: 'Fixed Assets', 'D2C Sales': 'Sales Accounts', 'Stock Transfers': 'Sales Accounts', Salaries: 'Indirect Expenses', 'Finance Costs': 'Indirect Expenses', 'Interest on OD': 'Finance Costs',
};
interface S { cap: number; term: number; dir: number; od: number; cred: number; gst: number; bank: number; debt: number; fa: number; sales: number; st: number; purch: number; ind: number; fin: number; open: number }
function book(o: Partial<S> & { bank: number }) {
  const s: S = { cap: 500 * L, term: 20 * L, dir: 20 * L, od: 10 * L, cred: 30 * L, gst: -5 * L, debt: 40 * L, fa: 25 * L, sales: 0, st: 0, purch: 0, ind: 0, fin: 0, open: 117 * L, ...o };
  const pl = (s.fa + s.bank + s.debt + s.open + s.purch + s.st + s.ind + s.fin) - (s.cap + s.term + s.dir + s.od + s.cred + s.gst + s.sales + s.st);
  const rows: TbRow[] = [
    g('Capital Account', -s.cap), l('Share Capital', -s.cap),
    g('Loans (Liability)', -(s.term + s.dir + s.od)), l('Secured Loans', -s.term), l('HDFC Term Loan', -s.term), l('Unsecured Loans', -s.dir), l('Director Loan', -s.dir), l('Bank OD A/c', -s.od), l('Central Bank OD', -s.od),
    g('Current Liabilities', -(s.cred + s.gst)), l('Sundry Creditors', -s.cred), l('Vendor A', -s.cred), l('Duties & Taxes', -s.gst), l('GST', -s.gst),
    g('Fixed Assets', s.fa), l('Plant', s.fa),
    g('Current Assets', s.bank + s.debt), l('Bank Accounts', s.bank), l('HDFC Bank', s.bank * 0.6), l('ICICI Bank', s.bank * 0.4), l('Sundry Debtors', s.debt), l('Cust A', s.debt),
    g('Opening Stock', s.open),
    g('Sales Accounts', -(s.sales + s.st)), l('D2C Sales', -s.sales), l('Stock Transfers', -s.st),
    g('Purchase Accounts', s.purch + s.st),
    g('Indirect Expenses', s.ind + s.fin), l('Salaries', s.ind), l('Finance Costs', s.fin), l('Interest on OD', s.fin),
    g('Profit & Loss A/c', -pl),
  ];
  return { rows, difference: 0, basis: 'fy-to-date' };
}
const pnl = (np: number, sales: number) => ({ nettProfit: np, ledgerRows: [{ name: 'D2C Sales', amount: sales }, { name: 'Closing Stock', amount: 148 * L }, { name: 'Salaries', amount: 10 * L }] });
const sep = book({ bank: 30 * L, sales: 298 * L, st: 93 * L, purch: 142 * L, ind: 170 * L, fin: 3 * L });
const oct = book({ bank: 22 * L, od: 30 * L, debt: 48 * L, sales: 306 * L, st: 93 * L, purch: 142 * L, ind: 198 * L, fin: 3 * L });

test('tbRows: leaves skip a sub-group listed with its ledgers, with or without masters', () => {
  const names = (rs: TbRow[]) => rs.map((r) => r.name);
  for (const p of [parents, undefined]) {
    const leaves = names(tbLeaves(sep.rows, p));
    assert.ok(leaves.includes('Interest on OD') && !leaves.includes('Finance Costs'));
    assert.ok(leaves.includes('HDFC Bank') && !leaves.includes('Bank Accounts'));
    assert.equal(leafDr(sep.rows, /finance cost|interest/i, p), 3 * L); // not 6 L (round 7 #9)
  }
  assert.equal(subTotal(sep.rows, /^sundry debtors$/i, parents), 40 * L);
  assert.equal(subTotal([g('Current Assets', 9), l('Cust A', 4), l('Cust B', 5)], /^sundry debtors$/i, { 'Cust A': 'Sundry Debtors', 'Cust B': 'Sundry Debtors', 'Sundry Debtors': 'Current Assets' }), 9);
  assert.equal(stockTransfers(sep.rows, parents), 93 * L);
  const sp = salesPurchases(sep.rows, parents);
  assert.equal(sp.sales, 298 * L);
  assert.equal(sp.purchases, 142 * L);
});

test('FY block: sales = channel ledgers (no Stock Transfers), GM ₹ unchanged, finance cost leaf only (round 7 #1, #9)', () => {
  const fy = fyOut([{ period: '2026-09', tb: sep, pnl: pnl(0, 0) }] as V2MonthIn[], parents)!.current!;
  assert.equal(fy.sales, 298 * L);          // was 391 L
  assert.equal(fy.financeCost, 3 * L);      // was 6 L
  // GM ₹ = sales − (purchases + opening − closing) with both legs of the transfer out: 298 − (142 + 117 − 148) = 187 L
  assert.equal(fy.grossMargin, 187 * L);
});

test('v1 summary: balances from the Balance Sheet builder, loans counted once (round 7 #3, #7)', () => {
  const months = [
    { period: '2026-09', tb: sep, pnl: pnl(12 * L, 62 * L), tbAsOf: '2026-10-20T06:00:00Z' },
    { period: '2026-10', tb: oct, pnl: pnl(-20 * L, 8 * L), tbAsOf: '2026-11-08T06:00:00Z' },
  ];
  const v1 = ceoSummary(months, 13, { parents, today: '2026-11-10' });
  const o = v1.months[1];
  assert.equal(o.cashBank, 22 * L);
  assert.equal(o.overdraft, 30 * L);
  assert.equal(o.netCash, -8 * L);
  assert.equal(o.debtors, 48 * L);
  assert.equal(o.creditors, 30 * L);
  assert.equal(o.loans, 70 * L);   // term 20 + director 20 + OD 30
  assert.equal(o.sales, 8 * L);
  assert.equal(o.complete, true);
  const v2 = ceoSummaryV2({ today: '2026-11-10', months, parents });
  assert.equal(v2.balance?.loans, 70 * L); // was 110 L (sub-groups added again)
  assert.equal(v2.balance?.receivables, 48 * L);
});

test('cash runway: net cash incl. OD, whole months only, calendar neighbours (round 7 #2, #15)', () => {
  // OD-funded burn: bank Aug 80 → Sep 72 → Oct 64 → Nov(2 Nov) 63, OD 0 → 20 → 40 → 40: net cash falls 28 L a month.
  const s2 = (bank: number, od: number, exp: number, sales: number) => ({ rows: [
    g('Capital Account', -300 * L), g('Loans (Liability)', -od * L), l('Bank OD A/c', -od * L), l('Central Bank OD', -od * L),
    g('Current Assets', bank * L), l('Bank Accounts', bank * L), l('HDFC Bank', bank * L),
    g('Sales Accounts', -sales * L), g('Indirect Expenses', exp * L), g('Profit & Loss A/c', (300 + od - bank + sales - exp) * L),
  ], difference: 0, basis: 'fy-to-date' });
  const P = { 'Bank Accounts': 'Current Assets', 'HDFC Bank': 'Bank Accounts', 'Bank OD A/c': 'Loans (Liability)', 'Central Bank OD': 'Bank OD A/c' };
  const asOf = '2026-11-02T06:00:00Z';
  const m2: V2MonthIn[] = [
    { period: '2026-08', tb: s2(80, 0, 140, 100), pnl: pnl(-8 * L, 20 * L), tbAsOf: asOf },
    { period: '2026-09', tb: s2(72, 20, 188, 120), pnl: pnl(-28 * L, 20 * L), tbAsOf: asOf },
    { period: '2026-10', tb: s2(64, 40, 236, 140), pnl: pnl(-28 * L, 20 * L), tbAsOf: asOf },
    { period: '2026-11', tb: s2(63, 40, 238.5, 141.5), pnl: pnl(-1 * L, 1.5 * L), tbAsOf: asOf },
  ];
  const months = netCashMonths(m2, P, '2026-11-10');
  assert.deepEqual(months.map((m) => m.period), ['2026-08', '2026-09']); // Oct copied 2 days after month end, Nov running
  const flows = netCashFlows(months);
  assert.deepEqual(flows, [{ period: '2026-09', netChange: -28 * L }]);
  const v2 = ceoSummaryV2({ today: '2026-11-10', months: m2, parents: P });
  const w = v2.watch.find((x) => x.id === 'cash_runway')!;
  assert.equal(w.pct, 0.8);              // 23 L ÷ 28 L (was 4.1 months on gross bank)
  assert.equal(w.severity, 'high');
  // calendar neighbours only: Jun → Sep is not one month
  assert.deepEqual(netCashFlows([{ period: '2026-06', netCash: 90, loans: 0 }, { period: '2026-09', netCash: 30, loans: 0 }, { period: '2026-10', netCash: 10, loans: 0 }]), [{ period: '2026-10', netChange: -20 }]);
  // runway page note shows the as-of day for a part month
  const r = buildRunway({ today: '2026-11-10', netCash: 23 * L, balancePeriod: '2026-11', balanceAsOf: asOf, flows, gstPayable: null, odLimit: null });
  assert.ok(r.notes.some((n) => /books as of 2026-11-02/.test(n)));
  // Today: sales tile skips the running month and part months; net cash tile says "books as of 2 Nov"
  const v1 = ceoSummary(m2, 13, { parents: P, today: '2026-11-10' });
  const mb = buildMorningBrief({ today: '2026-11-10', now: '2026-11-10T08:00:00Z', balance: v2.balance, months: v1.months, watch: v2.watch, close: [], fix: [], tasks: [], tallyLastOkAt: asOf, prev: null });
  const tile = (id: string) => mb.tiles.find((t) => t.id === id)!;
  assert.equal(tile('sales').label, 'Sales Sep 2026');
  assert.match(tile('net_cash').sub, /books as of 2 Nov/);
  assert.equal(tile('runway').value, 0.8);
  assert.equal(booksLabel('2026-10', '2026-11-20T06:00:00Z'), 'Oct 2026 books');
  assert.equal(booksComplete('2026-10', '2026-11-06T06:00:00Z', '2026-11-10'), true);
});

test('Tally poll: an empty answer never overwrites a copy; TB backfill only for months with a P&L copy (round 7 #8, #11)', () => {
  assert.equal(keepCopy(0), false);
  assert.equal(keepCopy(12), true);
  const now = Date.parse('2026-11-16T06:00:00Z');
  const want = tbBackfill(now, { months: { '2026-11': 'x', '2026-10': 'x', '2026-08': 'x', '2026-06': 'x' }, tbMonths: { '2026-11': 'x' } }, ['2026-10']);
  assert.deepEqual(want, ['2026-08', '2026-06']); // Sep has no P&L copy → not pulled (stock would be unknown)
});

test('two P&L copies: the newer one is read, a Fix item names a gap over ₹1,000 (round 7 #10)', () => {
  const snap = { nettProfit: -898_780, ledgerRows: [{ name: 'D2C Sales', amount: 1 }], at: '2026-11-02T06:00:00Z' };
  const comm = committedCopy({ ledgerRows: [{ name: 'D2C Sales', amount: 1 }], nettProfit: -751_429 }, '2026-10-12T06:00:00Z')!;
  assert.equal(pickPnlCopy(snap, comm).source, 'snapshot');
  assert.equal(pickPnlCopy({ ...snap, at: '2026-10-01T00:00:00Z' }, comm).source, 'committed');
  assert.equal(pickPnlCopy(null, comm).source, 'committed');
  const gaps = pnlCopyGaps([{ period: '2026-08', snapshot: snap, committed: comm }, { period: '2026-09', snapshot: { ...snap, nettProfit: 100 }, committed: { ...comm, nettProfit: 600 } }]);
  assert.deepEqual(gaps.map((x) => [x.period, x.gap]), [['2026-08', -147_351]]);
  const items = serverItems({ today: '2026-11-10', health: null, chart: null, tb: null, tally: null, committed: new Set(), everUsed: new Set(), anomalies: [], pnlGaps: gaps });
  const it = items.find((i) => i.id === 'pnl-copies:2026-08')!;
  assert.match(it.title, /₹1,47,351/);
});

test('cost buckets: Sales & Marketing is marketing, group rows not counted twice, After-Sales is a cost (round 10 A1–A3, A7)', () => {
  assert.equal(bucketOfLedger('Sales & Marketing'), 'marketing');
  assert.equal(bucketOfLedger('Sales Promotion'), 'marketing');
  assert.equal(bucketOfLedger('Direct Expenses'), null);
  assert.equal(bucketOfLedger('Indirect Expenses'), null);
  assert.equal(bucketOfLedger('Sales - Amazon'), null);
  assert.equal(bucketOfLedger('Bank Charges'), 'other');
  assert.equal(bucketOfLedger('Interest on TDS'), 'other');
  assert.equal(bucketOfLedger('Interest on Term Loan'), 'finance');
  assert.equal(channelOfLedger('After-Sales & Warranty'), null);
  assert.notEqual(bucketOfLedger('After-Sales & Warranty'), null);
  assert.ok(NOT_EXPENSE.test('Stock Transfers'));
  const m: V2MonthIn = { period: '2026-09', tb: null, pnl: { nettProfit: 0, ledgerRows: [
    { name: 'D2C Sales', amount: 100 * L }, { name: 'Sales & Marketing', amount: 20 * L },
    { name: 'Direct Expenses', amount: 10 * L }, { name: 'Factory Rent', amount: 4 * L }, { name: 'Freight Inward', amount: 6 * L },
    { name: 'After-Sales & Warranty', amount: 1 * L },
  ] } };
  const c = costsOut([m])!.months[0];
  assert.equal(c.sales, 100 * L);   // After-Sales not read as a sale
  assert.equal(c.buckets.marketing, 20 * L);
  assert.equal(c.total, 25 * L);    // 20 + 4 + 1: the 10 L group row not added again, Freight Inward is COGM as on Live MIS
  assert.equal(bucketOfLedger('Factory Overheads'), null);
  assert.equal(expensesOf([m], '2026-09')!.total, 25 * L);
  assert.deepEqual(expenseRows({ ledgerRows: m.pnl!.ledgerRows }).map((r) => r.name), ['Sales & Marketing', 'Factory Rent', 'Freight Inward', 'After-Sales & Warranty']);
});

test('anomaly scan: cost spike, negative sales ledger, sales ledger wording; running month skipped (round 10 D)', () => {
  const rep = (p: string, rows: [string, number][]): ExtractedReport => ({ connectorId: 'tally', slotId: 'pnl', periodKey: p, payload: { ledgerRows: rows.map(([name, amount]) => ({ name, amount })) } });
  const r = scanIssues([
    rep('2026-04', [['Admin & General Expenses', 70_000], ['D2C Sales', 500_000]]),
    rep('2026-05', [['Admin & General Expenses', 72_000], ['D2C Sales', 500_000]]),
    rep('2026-06', [['Admin & General Expenses', 71_000], ['D2C Sales', 500_000], ['GT Sales', 80_000]]),
    rep('2026-07', [['Admin & General Expenses', 3_434_000], ['D2C Sales', -40_000]]),
  ]);
  const titles = r.issues.map((i) => i.title);
  assert.ok(titles.some((t) => /Admin & General Expenses" jumped/.test(t)));
  assert.ok(titles.some((t) => /D2C Sales" is negative/i.test(t)));
  const gt = r.issues.find((i) => /GT Sales" dropped to zero/i.test(i.title))!;
  assert.equal(gt.category, 'revenue');
  assert.match(gt.detail, /sales ledger/);
  const items = serverItems({ today: '2026-07-10', health: null, chart: null, tb: null, tally: null, committed: new Set(), everUsed: new Set(),
    anomalies: r.issues.map((i) => ({ ...i })) });
  assert.ok(!items.some((i) => i.area === 'mis' && i.period === '2026-07')); // the running month is not judged
});
