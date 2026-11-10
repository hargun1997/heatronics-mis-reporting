// CEO summary v2 (Cash Overwatch) over synthetic Tally snapshots — made-up figures, Tally's own group names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { balanceOut, bucketOfLedger, ceoSummaryV2, channelOfLedger, channelsOut, closeOut, costsOut, expensesOf, fyOut, ledgerTrend, type V2Input, type V2MonthIn } from '../src/connectors/tally/ceoSummaryV2.js';
import { connectorSalesOf } from '../src/connectors/tally/ceoSummaryLoad.js';
import type { TbRowIn } from '../src/connectors/tally/ceoSummary.js';

const g = (name: string, bal: number): TbRowIn => ({ name, level: 'group', debit: bal > 0 ? bal : 0, credit: bal < 0 ? -bal : 0 });
const l = (name: string, bal: number): TbRowIn => ({ ...g(name, bal), level: 'ledger' });

/** A tied FY-to-date TB. Dr positive. */
function tb(o: { bank: number; od?: number; debtors: number; creditors: number; gst?: number; fa: number; loans: number; capital: number; sales: number; purchases: number; direct: number; indirect: number; dep: number; interest: number; opening: number }) {
  const od = o.od ?? 0, gst = o.gst ?? 0;
  const rows: TbRowIn[] = [
    g('Capital Account', -o.capital), l('Share Capital', -o.capital),
    g('Loans (Liability)', -o.loans - od), l('Term Loan', -o.loans), ...(od ? [l('Central Bank OD A/c', -od)] : []),
    g('Current Liabilities', -o.creditors - gst), l('Sundry Creditors', -o.creditors), ...(gst ? [l('Duties & Taxes', -gst)] : []),
    g('Fixed Assets', o.fa), l('Plant & Machinery', o.fa),
    g('Current Assets', o.bank + o.debtors), l('Bank Accounts', o.bank), l('HDFC Bank', o.bank * 0.6), l('ICICI Bank', o.bank * 0.4), l('Sundry Debtors', o.debtors),
    g('Sales Accounts', -o.sales), g('Purchase Accounts', o.purchases), g('Direct Expenses', o.direct), g('Opening Stock', o.opening),
    g('Indirect Expenses', o.indirect), l('Depreciation', o.dep), l('Interest Paid', o.interest), l('Salary & Wages', o.indirect - o.dep - o.interest),
  ];
  const sum = rows.filter((r) => r.level === 'group').reduce((s, r) => s + r.debit - r.credit, 0);
  if (Math.abs(sum) > 0.001) rows.push(g('Suspense A/c', -sum));
  return { rows, difference: 0, basis: 'fy-to-date' };
}
const parents = { 'HDFC Bank': 'Bank Accounts', 'ICICI Bank': 'Bank Accounts', 'Bank Accounts': 'Current Assets', 'Sundry Debtors': 'Current Assets', 'Sundry Creditors': 'Current Liabilities', 'Duties & Taxes': 'Current Liabilities', 'Central Bank OD A/c': 'Loans (Liability)', 'Term Loan': 'Loans (Liability)' };

const pnl = (o: { amazon: number; d2c: number; flipkart?: number; gt?: number; salary: number; ads: number; rent: number; freight: number; fees: number; interest: number; dep: number; stock: number; net: number }) => ({
  nettProfit: o.net,
  ledgerRows: [
    { name: 'Ecommerce Sales', amount: o.amazon }, { name: 'D2C Sales', amount: o.d2c },
    ...(o.flipkart != null ? [{ name: 'Flipkart Sales', amount: o.flipkart }] : []), ...(o.gt != null ? [{ name: 'Offline Sales', amount: o.gt }] : []),
    { name: 'Stock Transfers', amount: 50_000 }, { name: 'Raw Material Purchases', amount: 400_000 }, { name: 'Closing Stock', amount: o.stock },
    { name: 'Employee Cost - Indirect', amount: o.salary }, { name: 'Cost of Advertising', amount: o.ads }, { name: 'Rent', amount: o.rent },
    { name: 'Freight Charges Shiprocket', amount: o.freight }, { name: 'Amazon Channel Fees', amount: o.fees }, { name: 'Interest Paid', amount: o.interest }, { name: 'Depreciation', amount: o.dep },
  ],
});

// FY26-27: Aug, Sep, Oct 2026 stored, plus Oct 2025 for YoY.
const months: V2MonthIn[] = [
  { period: '2025-10', tb: tb({ bank: 900_000, debtors: 300_000, creditors: 500_000, fa: 2_000_000, loans: 1_000_000, capital: 5_000_000, sales: 6_000_000, purchases: 3_000_000, direct: 500_000, indirect: 2_400_000, dep: 100_000, interest: 60_000, opening: 800_000 }),
    pnl: { nettProfit: 50_000, ledgerRows: [{ name: 'Ecommerce Sales', amount: 700_000 }, { name: 'Closing Stock', amount: 900_000 }] }, pnlAsOf: '2025-11-10T10:00:00Z' },
  { period: '2026-08', tb: tb({ bank: 1_500_000, od: 200_000, debtors: 400_000, creditors: 600_000, gst: 100_000, fa: 2_500_000, loans: 1_200_000, capital: 8_000_000, sales: 5_000_000, purchases: 2_500_000, direct: 400_000, indirect: 2_000_000, dep: 120_000, interest: 50_000, opening: 1_000_000 }),
    pnl: pnl({ amazon: 800_000, d2c: 400_000, flipkart: 100_000, salary: 300_000, ads: 200_000, rent: 100_000, freight: 80_000, fees: 150_000, interest: 10_000, dep: 24_000, stock: 1_100_000, net: 20_000 }), pnlAsOf: '2026-09-09T10:00:00Z' },
  { period: '2026-09', tb: tb({ bank: 1_200_000, od: 300_000, debtors: 500_000, creditors: 700_000, gst: 120_000, fa: 2_600_000, loans: 1_200_000, capital: 8_000_000, sales: 6_500_000, purchases: 3_200_000, direct: 520_000, indirect: 2_600_000, dep: 144_000, interest: 60_000, opening: 1_000_000 }),
    pnl: pnl({ amazon: 900_000, d2c: 500_000, flipkart: 100_000, salary: 300_000, ads: 250_000, rent: 100_000, freight: 90_000, fees: 160_000, interest: 10_000, dep: 24_000, stock: 1_150_000, net: 30_000 }), pnlAsOf: '2026-10-09T10:00:00Z' },
  { period: '2026-10', tb: tb({ bank: 800_000, od: 400_000, debtors: 700_000, creditors: 2_000_000, gst: 300_000, fa: 2_600_000, loans: 1_200_000, capital: 8_000_000, sales: 8_000_000, purchases: 3_900_000, direct: 640_000, indirect: 3_200_000, dep: 168_000, interest: 70_000, opening: 1_000_000 }),
    pnl: pnl({ amazon: 1_000_000, d2c: 300_000, flipkart: 200_000, salary: 320_000, ads: 300_000, rent: 100_000, freight: 100_000, fees: 170_000, interest: 10_000, dep: 24_000, stock: 1_200_000, net: 10_000 }), pnlAsOf: '2026-11-03T10:00:00Z' },
];
const input: V2Input = {
  today: '2026-11-07', months, parents,
  locks: { '2026-08': { lockedAt: '2026-09-12T10:00:00Z', lockedBy: 'hargun@heatronics.in', worstResidualPct: 0.4 }, '2026-09': { lockedAt: '2026-10-14T10:00:00Z', lockedBy: 'hargun@heatronics.in', worstResidualPct: 2.3, overrideReason: 'Flipkart settlement late' } },
  committed: ['flipkart|settlement|2026-08', 'flipkart|settlement|2026-09', 'blinkit|order-charges|2026-08', 'tally|pnl|2026-10'],
  connectorSales: { '2026-10': { Amazon: 1_010_000, D2C: 290_000, Flipkart: 400_000 } },
  manualSlots: [{ connectorId: 'flipkart', slotId: 'settlement', label: 'Flipkart settled transactions' }, { connectorId: 'blinkit', slotId: 'order-charges', label: 'Blinkit payout' }, { connectorId: 'snapmint', slotId: 'settlement', label: 'Snapmint settlement' }],
};

test('server statements builder is the client file from the first banner line down', () => {
  const client = readFileSync(new URL('../../client/src/data/statements/statements.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../src/connectors/tally/statementsCore.ts', import.meta.url), 'utf8');
  const from = (s: string) => s.slice(s.indexOf('// ---'));
  assert.equal(from(server), from(client));
});

test('ledger → channel follows the close map, rules and plain names; costs never count sales or stock', () => {
  assert.equal(channelOfLedger('Ecommerce Sales'), 'Amazon');
  assert.equal(channelOfLedger('D2C Sales'), 'D2C');
  assert.equal(channelOfLedger('Blinkit - Sales'), 'Blinkit');
  assert.equal(channelOfLedger('Zepto Sales Account'), 'Blinkit');
  assert.equal(channelOfLedger('Offline Sales'), 'GT');
  assert.equal(channelOfLedger('OEM Sales'), 'B2B');
  assert.equal(channelOfLedger('Blinkit Channel Fees'), null);
  assert.equal(channelOfLedger('Stock Transfers'), null);
  assert.equal(channelOfLedger('Amazon Damage Refunds'), null);
  assert.equal(channelOfLedger('Export Sales'), 'Export');
  assert.equal(channelOfLedger('Misc Sales'), 'Other');
  // a stored rule wins over the heuristics
  assert.equal(channelOfLedger('Hyperlocal Sales', [{ pattern: 'hyperlocal', line: 'rev_blinkit' }]), 'Blinkit');
  assert.equal(bucketOfLedger('Employee Cost - Indirect'), 'employee');
  assert.equal(bucketOfLedger('Cost of Advertising'), 'marketing');
  assert.equal(bucketOfLedger('Freight Charges Shiprocket'), 'logistics');
  assert.equal(bucketOfLedger('Amazon Channel Fees'), 'channelFees');
  assert.equal(bucketOfLedger('Factory Overheads'), null); // COGM on Live MIS, not opex (round 10 A2)
  assert.equal(bucketOfLedger('Factory Rent'), 'rentFactory');
  assert.equal(bucketOfLedger('Interest Paid'), 'finance');
  assert.equal(bucketOfLedger('Depreciation'), 'depreciation');
  assert.equal(bucketOfLedger('Professional Fees'), 'professional');
  assert.equal(bucketOfLedger('Miscellaneous Expenses'), 'other');
  assert.equal(bucketOfLedger('Raw Material Purchases'), null);
  assert.equal(bucketOfLedger('Closing Stock'), null);
  assert.equal(bucketOfLedger('Ecommerce Sales'), null);
});

test('FY to date from the newest FY-to-date TB, YoY from the same month last FY', () => {
  const fy = fyOut(months, parents)!;
  const c = fy.current!;
  assert.equal(c.fy, 'FY26-27');
  assert.equal(c.through, '2026-10');
  assert.equal(c.monthsCovered, 7);
  assert.equal(c.sales, 8_000_000);
  // COGS = purchases + direct + opening − closing stock
  assert.equal(c.cogs, 3_900_000 + 640_000 + 1_000_000 - 1_200_000);
  assert.equal(c.grossMargin, 8_000_000 - c.cogs!);
  assert.equal(c.grossMarginPct, 45.8);
  assert.equal(c.depreciation, 168_000);
  assert.equal(c.financeCost, 70_000);
  // net profit = the balance sheet's FY profit; EBITDA adds depreciation + finance cost back
  assert.equal(c.netProfit, -(-8_000_000 + 3_900_000 + 640_000 + 1_000_000 + 3_200_000) + 1_200_000);
  assert.equal(c.ebitda, c.netProfit! + 168_000 + 70_000);
  assert.equal(fy.lastFy!.fy, 'FY25-26');
  assert.equal(fy.lastFy!.sales, 6_000_000);
  assert.equal(fy.yoyPct!.sales, 33.3);
});

test('channels: sales per ledger channel, MoM, share; costs: buckets, MoM, % of sales', () => {
  const ch = channelsOut(months)!;
  const oct = ch.months[ch.months.length - 1];
  assert.equal(oct.period, '2026-10');
  assert.deepEqual(oct.sales, { Amazon: 1_000_000, D2C: 300_000, Flipkart: 200_000 });
  assert.equal(oct.total, 1_500_000);
  assert.equal(ch.momPct.D2C, -40);
  assert.equal(ch.momPct.Flipkart, 100);
  assert.equal(ch.sharePct.Amazon, 66.7);
  assert.equal(ch.ledgers['Ecommerce Sales'], 'Amazon');
  const co = costsOut(months)!;
  const o = co.months[co.months.length - 1];
  assert.equal(o.sales, 1_500_000);
  assert.equal(o.buckets.employee, 320_000);
  assert.equal(o.buckets.marketing, 300_000);
  assert.equal(o.buckets.logistics, 100_000);
  assert.equal(o.buckets.channelFees, 170_000);
  assert.equal(o.buckets.rentFactory, 100_000);
  assert.equal(o.buckets.professional, null); // never 0 when nothing was booked
  assert.equal(o.pctOfSales.marketing, 20);
  assert.equal(co.momPct.marketing, 20);
});

test('balance sheet: cash per bank ledger, OD, net cash, debtors / creditors / stock / loans / GST; cash flow ties to Δ cash', () => {
  const { balance, cashflow } = balanceOut(months, parents);
  assert.equal(balance!.period, '2026-10');
  assert.deepEqual(balance!.cash, [{ ledger: 'HDFC Bank', amount: 480_000 }, { ledger: 'ICICI Bank', amount: 320_000 }]);
  assert.equal(balance!.cashBank, 800_000);
  assert.equal(balance!.overdraft, 400_000);
  assert.equal(balance!.netCash, 400_000);
  assert.equal(balance!.receivables, 700_000);
  assert.equal(balance!.payables, 2_000_000);
  assert.equal(balance!.inventory, 1_200_000);
  assert.equal(balance!.loans, 1_600_000);
  assert.equal(balance!.gstNet, 300_000);
  assert.equal(cashflow.length, 2); // Sep (vs Aug) and Oct (vs Sep); Oct 2025 has no month before
  for (const f of cashflow) assert.equal(f.operating + f.investing + f.financing + f.retained + f.other, f.netChange);
  assert.equal(cashflow[1].netChange, -400_000);
});

test('close: lock → locked + tie; P&L copy → ready; missing manual uploads only for channels ever used; channel gap vs connectors', () => {
  const close = closeOut(input);
  assert.deepEqual(close.map((c) => c.period), ['2025-10', '2026-08', '2026-09', '2026-10']);
  const [, aug, sep, oct] = close;
  assert.equal(aug.status, 'locked'); assert.equal(aug.breach, false);
  assert.equal(sep.status, 'locked'); assert.equal(sep.breach, true); assert.equal(sep.overrideReason, 'Flipkart settlement late');
  assert.equal(oct.status, 'ready'); assert.equal(oct.tieResidualPct, null); assert.equal(oct.breach, null);
  assert.deepEqual(sep.missingUploads, ['Blinkit payout']); // snapmint never used → not nagged
  assert.deepEqual(oct.missingUploads, ['Flipkart settled transactions', 'Blinkit payout']);
  assert.equal(oct.tallySales, 1_500_000);
  assert.equal(oct.connectorSales, 1_700_000);
  assert.deepEqual(oct.channelGap.find((c) => c.channel === 'Flipkart'), { channel: 'Flipkart', tally: 200_000, connector: 400_000, gap: -200_000 });
  assert.equal(oct.channelGapTotal, 10_000 + 10_000 + 200_000);
  assert.equal(oct.daysAfterMonthEnd, 2);
  assert.equal(aug.daysAfterMonthEnd, 8);
  assert.equal(oct.tbTies, true);
});

test('watch: runway, debtors, creditors, GST, tie breach, channel drop, early copy, uploads, channel gap — each with a reason', () => {
  const r = ceoSummaryV2(input);
  const ids = r.watch.map((w) => w.id);
  const w = (id: string) => r.watch.find((x) => x.id === id)!;
  assert.ok(ids.includes('cash_runway'));
  assert.equal(w('cash_runway').pct, 1); // net cash 4 L (bank − OD) ÷ Sep's fall in net cash 4 L; Oct (copied 3 Nov) is not a whole month
  assert.equal(w('cash_runway').severity, 'high');
  assert.equal(w('debtors_up').pct, 40);
  assert.ok(ids.includes('creditors_high'));
  assert.ok(ids.includes('gst_spike'));
  assert.ok(ids.includes('tie_breach:2026-09'));
  assert.ok(ids.includes('channel_down:D2C'));
  assert.ok(ids.includes('pnl_early:2026-10'));
  assert.ok(ids.includes('uploads:2026-10'));
  assert.ok(ids.includes('channel_gap:2026-10'));
  assert.ok(!ids.includes('tb_diff'));
  for (const x of r.watch) { assert.ok(x.title.length > 5); assert.ok(x.reason.length > 10); }
  assert.equal(r.amazonStock, null);
  assert.ok(r.notes.some((n) => /amazonStock is null/.test(n)));
});

test('a month without data gives nulls, never zeros; no TB → no fy / balance', () => {
  const r = ceoSummaryV2({ today: '2026-11-07', months: [{ period: '2026-10', tb: null, pnl: null }] });
  assert.equal(r.fy, null);
  assert.equal(r.balance, null);
  assert.equal(r.channels, null);
  assert.equal(r.costs, null);
  assert.deepEqual(r.cashflow, []);
  assert.equal(r.close[0].status, 'open');
  assert.equal(r.close[0].tallySales, null);
  assert.equal(r.close[0].daysAfterMonthEnd, null);
  assert.ok(r.watch.some((x) => x.id === 'pnl_missing:2026-10'));
});

test('ledger trend + expenses of a month', () => {
  const t = ledgerTrend(months, 'advertising');
  assert.equal(t.length, 1);
  assert.deepEqual(t[0].months.map((m) => m.amount), [0, 200_000, 250_000, 300_000]);
  assert.equal(t[0].total, 750_000);
  const e = expensesOf(months, '2026-10')!;
  assert.equal(e.rows[0].ledger, 'Employee Cost - Indirect');
  assert.equal(e.rows[0].before, 300_000);
  assert.equal(e.rows[0].bucket, 'employee');
  assert.ok(!e.rows.some((r) => /sales|stock|purchases/i.test(r.ledger)));
  assert.equal(expensesOf(months, '2026-07'), null);
});

test('connector facts → ex-GST sales per channel like the close tie', () => {
  const s = connectorSalesOf([
    { source: 'shopify', channel: 'D2C', date: '2026-10-01', revenue: 1050, gmv: 1050 }, // GMV ÷ 1.05 (product GST 5 %)
    { source: 'shopify', channel: 'D2C', date: '2026-10-02', revenue: 1180, gmv: 1180, netExGst: 1000 },
    { source: 'flipkart', channel: 'Flipkart', date: '2026-10-02', revenue: 500 },
    { source: 'meta', channel: 'Meta Ads', date: '2026-10-02', revenue: 0, spend: 300 } as never,
  ], 'shopify');
  assert.equal(Math.round(s.D2C!), 2000);
  assert.equal(s.Flipkart, 500);
  assert.equal(Object.keys(s).length, 2);
});
