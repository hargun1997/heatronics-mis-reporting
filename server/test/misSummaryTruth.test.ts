// MIS summary fixes (founder, 23 Nov 2026): internal transfers are transfers, not sales; last year comes from the published MIS
// when the Tally company has no books for it; a running month or a month with gaps is not "ready" to lock; monthly figures sit
// flat on each row so the MCP table view keeps them. Synthetic data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { internalTransfers, salesPurchases } from '../src/connectors/tally/tbRows.js';
import { ceoSummary, type TbRowIn } from '../src/connectors/tally/ceoSummary.js';
import { channelsOut, closeOut, costsOut, fyOut, ledgerTrend, publishedFyBlock, type V2MonthIn } from '../src/connectors/tally/ceoSummaryV2.js';
import { PUBLISHED_MONTHS, TALLY_BOOKS_START } from '../src/connectors/tally/publishedMonths.js';
import { PUBLISHED_MONTHS as CLIENT_PUBLISHED } from '../../client/src/data/misDeck/publishedBasis.ts';

const g = (name: string, bal: number): TbRowIn => ({ name, level: 'group', debit: bal > 0 ? bal : 0, credit: bal < 0 ? -bal : 0 });
const l = (name: string, bal: number): TbRowIn => ({ ...g(name, bal), level: 'ledger' });

// Sales Accounts −10,00,000: channel sales 8,00,000 + Stock Transfers 50,000 + Internal Transfer Sales 1,50,000 (group + same-name ledger).
const rows: TbRowIn[] = [
  g('Sales Accounts', -1_000_000), l('D2C Sales', -300_000), l('Ecommerce Sales', -500_000), l('Stock Transfers', -50_000),
  l('Internal Transfer Sales', -150_000), l('Internal Transfer Sales', -150_000),
  g('Purchase Accounts', 450_000), l('Stock Transfer', 50_000), l('Raw Material Purchases', 400_000),
];
const parents = { 'Internal Transfer Sales': 'Internal Transfer Sales', 'Stock Transfers': 'Sales Accounts', 'Stock Transfer': 'Purchase Accounts' };

test('internal transfers: counted once, out of sales, purchases untouched', () => {
  assert.equal(internalTransfers(rows, parents), 150_000);
  assert.deepEqual(salesPurchases(rows, parents), { sales: 800_000, purchases: 400_000, stockTransfers: 50_000, internalTransfers: 150_000 });
  // A transfer ledger under a differently named transfer group is not counted twice.
  const nested = [g('Sales Accounts', -200_000), l('Internal Transfer Sales', -100_000), l('Internal Transfer - Haryana', -100_000), l('D2C Sales', -100_000)];
  assert.equal(internalTransfers(nested, { 'Internal Transfer - Haryana': 'Internal Transfer Sales' }), 100_000);
});

test('the monthly summary reports internal transfers and blanks months before the Tally books start', () => {
  const tb = { rows, difference: 0, basis: 'fy-to-date' };
  const r = ceoSummary([
    { period: '2026-03', tb, pnl: null },
    { period: '2026-04', tb, pnl: null },
  ], 13, { parents, today: '2026-11-23' });
  const [mar, apr] = r.months;
  assert.equal(apr.sales, 800_000);
  assert.equal(apr.internalTransfers, 150_000);
  assert.equal(mar.cashBank, null); assert.equal(mar.tbDiff, null); assert.equal(mar.sales, null);
  assert.ok(r.notes.some((n) => /Internal Transfer Sales/.test(n)));
  assert.ok(r.notes.some((n) => /before 2026-04 are blank/.test(n)));
});

test('published months are up to date with the client history and stop where Tally starts', () => {
  const r0 = Math.round;
  const want = CLIENT_PUBLISHED.filter((m) => m.key < TALLY_BOOKS_START).map((m) => ({ period: m.key, netRevenue: r0(m.netRevenue), cogm: r0(m.cogm), grossMargin: r0(m.grossMargin), ebitda: r0(m.ebitda), netIncome: r0(m.netIncome) }));
  assert.deepEqual(PUBLISHED_MONTHS, want, 'run: node --import tsx scripts/export-published-months.ts');
  assert.ok(PUBLISHED_MONTHS.every((m) => m.period < TALLY_BOOKS_START));
});

test('last year: published MIS for the same months when Tally has no books; never ₹0', () => {
  const ly = publishedFyBlock('2025-10')!;
  const want = PUBLISHED_MONTHS.filter((m) => m.period >= '2025-04' && m.period <= '2025-10');
  assert.equal(want.length, 7);
  assert.equal(ly.sales, want.reduce((a, m) => a + m.netRevenue, 0));
  assert.equal(ly.netProfit, want.reduce((a, m) => a + m.netIncome, 0));
  assert.equal(ly.source, 'published');
  assert.equal(publishedFyBlock('2027-01'), null, 'not covered = null');

  const empty = { rows: [g('Capital Account', -100), g('Current Assets', 100)], difference: 0, basis: 'fy-to-date' };
  const live = { rows: [...rows, g('Closing Stock', 0)], difference: 0, basis: 'fy-to-date' };
  const months: V2MonthIn[] = [
    { period: '2025-10', tb: empty, pnl: null, tbAsOf: '2026-11-22T10:00:00Z' },
    { period: '2026-10', tb: live, pnl: { nettProfit: 1, ledgerRows: [{ name: 'Closing Stock', amount: 10 }] }, tbAsOf: '2026-11-22T10:00:00Z' },
    { period: '2026-11', tb: live, pnl: { nettProfit: 1, ledgerRows: [{ name: 'Closing Stock', amount: 10 }] }, tbAsOf: '2026-11-22T10:00:00Z' },
  ];
  const fy = fyOut(months, parents, '2026-11-23')!;
  assert.equal(fy.current?.through, '2026-10', 'the running month is not part of FY to date');
  assert.equal(fy.current?.source, 'tally');
  assert.equal(fy.lastFy?.source, 'published');
  assert.equal(fy.lastFy?.through, '2025-10');
});

test('close: a running month is open; an ended clean month is ready; gaps are named', () => {
  const pnlRows = [{ name: 'D2C Sales', amount: 1_000_000 }];
  const tb = { rows: [], difference: 0, basis: 'fy-to-date' };
  const close = closeOut({
    today: '2026-11-23',
    months: [
      { period: '2026-09', tb, pnl: { nettProfit: 0, ledgerRows: pnlRows }, pnlAsOf: '2026-10-12T10:00:00Z' },
      { period: '2026-10', tb, pnl: { nettProfit: 0, ledgerRows: pnlRows }, pnlAsOf: '2026-11-20T10:00:00Z' },
      { period: '2026-11', tb, pnl: { nettProfit: 0, ledgerRows: pnlRows }, pnlAsOf: '2026-11-22T10:00:00Z' },
    ],
    connectorSales: { '2026-10': { D2C: 800_000 } },
  });
  const [sep, oct, nov] = close;
  assert.equal(sep.status, 'ready'); assert.deepEqual(sep.blockers, []);
  assert.equal(oct.status, 'open'); assert.match(oct.blockers[0], /differ by ₹2,00,000 \(20%\); most in D2C/);
  assert.equal(nov.status, 'open'); assert.deepEqual(nov.blockers, ['The month is still running.']);
});

test('monthly figures sit flat on each row (MCP table view)', () => {
  const months: V2MonthIn[] = [
    { period: '2026-09', tb: null, pnl: { nettProfit: 0, ledgerRows: [{ name: 'D2C Sales', amount: 100 }, { name: 'Ecommerce Sales', amount: 200 }, { name: 'Cost of Advertising', amount: 30 }] } },
    { period: '2026-10', tb: null, pnl: { nettProfit: 0, ledgerRows: [{ name: 'D2C Sales', amount: 150 }, { name: 'Cost of Advertising', amount: 40 }] } },
  ];
  const ch = channelsOut(months)!;
  assert.equal(ch.months[0].Amazon, 200); assert.equal(ch.months[1].D2C, 150);
  const co = costsOut(months)!;
  assert.equal(co.months[1].marketing, 40);
  const t = ledgerTrend(months, 'D2C Sales');
  assert.equal(t[0]['2026-09'], 100); assert.equal(t[0]['2026-10'], 150);
});
