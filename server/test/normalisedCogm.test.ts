// Normalised COGM basis (Live MIS P&L "Actual | Normalised", founder 5 Nov 2026): COGM = BOM cost of the units sold +
// factory overhead; Tally's purchase-timing difference is the "Stock build / drawdown" memo line. Made-up figures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseLiveMonths, monthSpans, liveMisPoint, NORMALISED_DEFINITION } from '../../client/src/data/misDeck/liveViews.ts';
import { aggregatePeriods } from '../../client/src/data/misDeck/liveAnalytics.ts';
import type { MonthlyMIS } from '../../client/src/data/misDeck/misDeckData.ts';
import type { PeriodCompleteness } from '../../client/src/data/misDeck/liveDeck.ts';
import type { SkuCell } from '../../client/src/data/misDeck/skuChannelPnl.ts';
import { MIS_SHEET_ROWS, MIS_SHEET_ROWS_NORMALISED } from '../../client/src/data/misDeck/misSheet.ts';
import { buildMisFormatWorkbook } from '../../client/src/utils/misFormatExport.ts';
import { buildLiveWorkbook, LIVE_EXPORT_EVERYTHING, liveMisFormatSource } from '../../client/src/utils/liveMisExport.ts';
import { buildLivePdf } from '../../client/src/utils/liveMisPdf.ts';
import { buildLiveDeck } from '../../client/src/data/misDeck/liveDeck.ts';
import type { DailyFact } from '../../client/src/data/liveMis/facts.ts';
import { conversionCost, stockUnposted } from '../../client/src/data/misDeck/conversion.ts';
import { buildBridge } from '../../client/src/data/misDeck/bridge.ts';
import { uncostedEstimate } from '../../client/src/data/misDeck/uncosted.ts';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A live Tally month with a known booked cascade; `variance` = Tally COGM − (BOM COGS + factory). */
function month(key: string, netRevenue: number, cogm: number, variance: number | null, extra: Partial<MonthlyMIS> = {}): MonthlyMIS {
  const [year, m] = key.split('-').map(Number);
  const grossMargin = netRevenue - cogm;
  const cm1 = grossMargin - 100, cm2 = cm1 - 50, cm3 = cm2 - 20, ebitda = cm3 - 200, netIncome = ebitda - 30;
  return {
    key, label: key, month: m, year,
    netByChannel: { D2C: netRevenue * 0.6, Amazon: netRevenue * 0.4 }, grossByChannel: {}, returnsByChannel: {},
    totalGrossRevenue: 0, totalReturns: 0, totalTaxes: 0, netRevenue, interBranch: 0, turnover: 0,
    grossMargin, cm1, cm2, cm3, ebitda, netIncome, cogm,
    channelFulfillment: 100, salesMarketing: 50, platformCosts: 20, opex: 200, nonOperating: 30, costOfFundraising: 0,
    cogmLines: {}, opexLines: {},
    ...(variance === null ? {} : { channelRecon: { revenueResidue: {}, cogmVariance: variance } }),
    ...extra,
  };
}
const full = (periodKey: string, over: Partial<PeriodCompleteness> = {}): PeriodCompleteness => ({
  periodKey, hasTally: true, cogmReal: true, level: 'full', sources: [], through: null, reconcileResidual: null, ...over,
});
const cell = (m: string, p: string, cogs: number, over: Partial<SkuCell> = {}): SkuCell => ({ m, ch: 'D2C', p, rev: 1000, cogs, oth: 0, con: 0, u: 10, ...over });

test('a month with variance +X restates COGM / GM / CM1..net income by X and keeps X as the memo', () => {
  const m = month('2026-07', 10000, 5000, 800);
  const { months, skipped, note } = normaliseLiveMonths([m], { '2026-07': full('2026-07') });
  const n = months[0];
  assert.equal(n.cogm, 4200);
  assert.equal(n.grossMargin, m.grossMargin + 800);
  assert.equal(n.cm1, m.cm1 + 800);
  assert.equal(n.cm2, m.cm2 + 800);
  assert.equal(n.cm3, m.cm3 + 800);
  assert.equal(n.ebitda, m.ebitda + 800);
  assert.equal(n.netIncome, m.netIncome + 800);
  assert.equal(n.stockVariance, 800);
  // everything else untouched
  assert.equal(n.netRevenue, 10000); assert.equal(n.channelFulfillment, 100); assert.equal(n.opex, 200);
  assert.deepEqual(skipped, []);
  assert.equal(note, NORMALISED_DEFINITION);
  assert.equal(m.stockVariance, undefined); // input not mutated
});

test('a drawdown (negative variance) raises COGM; a month without a recon is untouched and listed as skipped', () => {
  const draw = month('2026-08', 10000, 3000, -1500);
  const noRecon = month('2026-09', 10000, 5500, null);
  const { months, skipped, note } = normaliseLiveMonths([draw, noRecon], { '2026-08': full('2026-08'), '2026-09': full('2026-09') });
  assert.equal(months[0].cogm, 4500);
  assert.equal(months[0].stockVariance, -1500);
  assert.deepEqual(months[1], noRecon);
  assert.equal(months[1].stockVariance, undefined);
  assert.deepEqual(skipped, ['2026-09']);
  assert.match(note, /Sep 26 shown as booked — no BOM costing for it\./);
});

test('locked history, published months, top-line months and all-no-cost months stay as booked (never an FY average)', () => {
  const ms = [
    month('2026-01', 10000, 7000, 2000),                 // locked static history (has a recon here only to prove it is ignored)
    month('2026-02', 10000, 2000, -3000),                // published-only month
    month('2026-03', 10000, 0, 0),                       // top line
    month('2026-04', 10000, 6000, 1000),                 // every cell without a BOM cost
    month('2026-05', 10000, 6000, 1000),                 // fine
  ];
  const comp: Record<string, PeriodCompleteness> = {
    '2026-01': full('2026-01', { locked: true }),
    '2026-02': full('2026-02', { published: true }),
    '2026-03': full('2026-03', { level: 'topline', hasTally: false, cogmReal: false }),
    '2026-04': full('2026-04'),
    '2026-05': full('2026-05'),
  };
  const cells = [cell('2026-04', 'hCore X', 0, { noCost: true }), cell('2026-04', 'Accessory (excl)', 0), cell('2026-05', 'hCore X', 2000), cell('2026-05', 'hCore Y', 0, { costEst: true })];
  const out = normaliseLiveMonths(ms, comp, { skuCells: cells });
  assert.deepEqual(out.skipped, ['2026-01', '2026-02', '2026-03', '2026-04']);
  for (let i = 0; i < 4; i++) { assert.deepEqual(out.months[i], ms[i]); assert.equal(out.months[i].stockVariance, undefined); }
  assert.equal(out.months[4].cogm, 5000);
  assert.equal(out.months[4].stockVariance, 1000);
  assert.deepEqual(out.estimated, { '2026-05': 1 });
  assert.match(out.note, /Jan 26–Apr 26 shown as booked — no BOM costing for them\./);
  assert.match(out.note, /Cost estimated for 1 product in May 26\./);
  assert.ok(!/average/i.test(out.note));
});

test('a facts-only month costed to CM2 is already on the BOM basis: kept with a 0 variance, not skipped', () => {
  const m = month('2026-10', 10000, 4000, null);
  const out = normaliseLiveMonths([m], { '2026-10': full('2026-10', { hasTally: false, level: 'contribution' }) });
  assert.equal(out.months[0].cogm, 4000);
  assert.equal(out.months[0].stockVariance, 0);
  assert.deepEqual(out.skipped, []);
});

test('over a fiscal year: normalised net income − Σ variance = actual net income, and the FY aggregate carries the memo', () => {
  const vars = [1200, -400, 900, -2100, 300, 50, -600, 800, 1500, -900, 200, -700];
  const ms = vars.map((v, i) => { const k = `${i < 9 ? 2026 : 2027}-${String(((i + 3) % 12) + 1).padStart(2, '0')}`; return month(k, 10000 + i * 500, 5000 + v, v); });
  const comp = Object.fromEntries(ms.map((m) => [m.key, full(m.key)]));
  const out = normaliseLiveMonths(ms, comp);
  const actualNi = ms.reduce((s, m) => s + m.netIncome, 0);
  const normNi = out.months.reduce((s, m) => s + m.netIncome, 0);
  const sumVar = out.months.reduce((s, m) => s + (m.stockVariance ?? 0), 0);
  assert.equal(r2(normNi - sumVar), r2(actualNi));
  // GM% now moves with the month (the retired blend stamped one FY rate on every month)
  const gm = out.months.map((m) => m.grossMargin / m.netRevenue);
  assert.ok(new Set(gm.map((g) => g.toFixed(4))).size > 1);
  const [fy] = aggregatePeriods(out.months, comp, 'year');
  assert.equal(fy.members.length, 12);
  assert.equal(fy.normalisedMonths, 12);
  assert.equal(fy.stockVariance, r2(sumVar));
  assert.equal(r2(fy.netIncome - fy.stockVariance), r2(actualNi));
  const [fyActual] = aggregatePeriods(ms, comp, 'year');
  assert.equal(fyActual.stockVariance, 0);
  assert.equal(fyActual.normalisedMonths, 0);
});

test('MIS sheet: the memo row sits under GM% on the normalised rows only; the point carries it for restated periods; the Excel block writes it', () => {
  assert.ok(!MIS_SHEET_ROWS.some((r) => r.memo));
  const i = MIS_SHEET_ROWS_NORMALISED.findIndex((r) => r.label === 'GM%');
  assert.equal(MIS_SHEET_ROWS_NORMALISED[i + 1].label, 'Stock build / drawdown (purchase timing)');
  assert.equal(MIS_SHEET_ROWS_NORMALISED.length, MIS_SHEET_ROWS.length + 1);

  const ms = [month('2026-06', 10000, 5000, 800), month('2026-07', 10000, 4000, null)];
  const comp = { '2026-06': full('2026-06'), '2026-07': full('2026-07') };
  const norm = normaliseLiveMonths(ms, comp);
  const [jun, jul] = aggregatePeriods(norm.months, comp, 'month');
  assert.equal(liveMisPoint(jun, 'company', [], comp).stockVariance, 800);
  assert.equal(liveMisPoint(jul, 'company', [], comp).stockVariance, null); // as booked → blank
  assert.equal(liveMisPoint(aggregatePeriods(ms, comp, 'month')[0], 'company', [], comp).stockVariance, null); // actual basis → blank
  // channel points split the memo by their share of COGM and add back to the company figure
  const chs = ['D2C', 'Amazon'] as const;
  const split = chs.map((c) => liveMisPoint(jun, c, [], comp).stockVariance ?? 0);
  assert.equal(r2(split[0] + split[1]), 800);

  const deck = { months: norm.months, skuCells: [], completeness: comp, completeThrough: null, locks: {}, periods: ['2026-06', '2026-07'], traffic: {}, alternates: {} };
  const wb = buildMisFormatWorkbook({ ...liveMisFormatSource(deck, true), rows: MIS_SHEET_ROWS_NORMALISED });
  const ws = wb.Sheets['P&L Summary'];
  const labels = Object.keys(ws).filter((k) => /^A\d+$/.test(k)).map((k) => (ws[k] as { v: unknown }).v);
  const row = Object.keys(ws).find((k) => /^A\d+$/.test(k) && (ws[k] as { v: unknown }).v === 'Stock build / drawdown (purchase timing)');
  assert.ok(row, 'memo row written');
  assert.ok(labels.indexOf('Stock build / drawdown (purchase timing)') === labels.indexOf('GM%') + 1);
  const r = Number(row!.slice(1));
  assert.equal((ws[`B${r}`] as { v: unknown }).v, 0.01);      // Jun: ₹800 = 0.01 Lac
  assert.equal((ws[`C${r}`] as { v: unknown }).v, '');        // Jul as booked → blank
  assert.equal((ws[`D${r}`] as { v: unknown }).v, 0.01);      // FY total = Σ memo of the restated months
});

test('monthSpans folds consecutive months', () => {
  assert.equal(monthSpans(['2026-01', '2026-02', '2026-03', '2026-06', '2026-09', '2026-10']), 'Jan 26–Mar 26, Jun 26, Sep 26–Oct 26');
  assert.equal(monthSpans(['2025-12', '2026-01']), 'Dec 25–Jan 26');
  assert.equal(monthSpans([]), '');
});

test('a live deck end to end: the Excel / PDF exports on the normalised basis carry the memo line and the as-booked note', () => {
  // One Tally month with SKU facts and a BOM (Oct 2026); its COGM variance = purchases − BOM cost of the units sold.
  const f = (o: Partial<DailyFact>): DailyFact => ({ source: 'shopify', channel: 'D2C', date: '2026-10-05', revenue: 0, units: 0, orders: 0, fees: 0, ...o });
  const reports = [
    { connectorId: 'tally', slotId: 'pnl', periodKey: '2026-10', payload: { ledgerRows: [
      { name: 'D2C Sales', depth: 1, amount: 1_000_000 }, { name: 'Raw Material Purchases', depth: 1, amount: 600_000 },
      { name: 'Factory Overheads', depth: 1, amount: 80_000 }, { name: 'Channel Fees & Commissions', depth: 1, amount: 100_000 },
    ], nettProfit: null } },
    { connectorId: 'shopify', slotId: 'sales', periodKey: '2026-10', payload: { facts: [f({ sku: 'HCORE-NECK', skuName: 'hCore Neck', revenue: 1_000_000, units: 500 })] } },
    { connectorId: 'production', slotId: 'bom', periodKey: '2026-10', payload: { bomCosts: [{ fgId: 'FG-0008', bomNumber: '1', bomName: 'hCore Neck', costPerUnit: 400 }] } },
  ];
  const deck = buildLiveDeck(reports as never, [], {});
  const oct = deck.months.find((m) => m.key === '2026-10')!;
  assert.equal(oct.channelRecon!.cogmVariance, 400_000); // 600k + 80k − (500 × 400 + 80k)
  const norm = normaliseLiveMonths(deck.months, deck.completeness, deck);
  assert.equal(norm.months.find((m) => m.key === '2026-10')!.cogm, 280_000);
  assert.ok(norm.skipped.length > 0 && !norm.skipped.includes('2026-10')); // the static history stays as booked

  const wb = buildLiveWorkbook(deck, { ...LIVE_EXPORT_EVERYTHING, normaliseCogm: true }, null);
  const texts = (name: string) => Object.values(wb.Sheets[name]).map((c) => (c as { v?: unknown }).v).filter((v): v is string => typeof v === 'string');
  assert.ok(texts('Monthly P&L').includes('Memo: Stock build / drawdown (purchase timing)'));
  assert.ok(texts('Monthly P&L').some((t) => t.startsWith(NORMALISED_DEFINITION)));
  assert.ok(texts('Monthly P&L').some((t) => /shown as booked — no BOM costing/.test(t)));
  assert.ok(texts('MIS Sheet').includes('Stock build / drawdown (purchase timing)'));
  assert.ok(texts('MIS Sheet').some((t) => /normalised COGM/.test(t)));
  const actual = buildLiveWorkbook(deck, { ...LIVE_EXPORT_EVERYTHING, normaliseCogm: false }, null);
  assert.ok(!Object.values(actual.Sheets['Monthly P&L']).some((c) => (c as { v?: unknown }).v === 'Memo: Stock build / drawdown (purchase timing)'));
  assert.ok(!Object.values(actual.Sheets['MIS Sheet']).some((c) => (c as { v?: unknown }).v === 'Stock build / drawdown (purchase timing)'));

  const pdf = buildLivePdf(deck, { sections: ['trends', 'fyPnl', 'months', 'misSheet'], fyKeys: [], monthKeys: ['2026-10'], normaliseCogm: true, mergeChannels: true }, null);
  assert.ok(pdf.getNumberOfPages() >= 3);
});

// ---- Conversion cost inside the normalised COGM (10 Nov 2026) ---------------------------------------------------
// Normalised COGM = BOM material of the units sold + ALL conversion cost booked in Tally's Direct Expenses (factory
// overheads, manufacturing costs, inward freight …). The memo line then holds only the material purchase timing.

test('conversionCost: every Direct Expense ledger except raw material and stock movement is conversion', () => {
  const lines = {
    'Raw Material Purchases': -600_000, 'Factory Overheads': -80_000,
    'Manufacturing Costs (job work, wages, addl. charges)': -50_000, 'Inward Freight': -10_000, 'Some new direct ledger': -2_000,
    'Stock movement (Opening − Closing)': 30_000, 'TOTAL COGM': -712_000,
  };
  assert.deepEqual(conversionCost(lines, 80_000), { factory: 80_000, other: 62_000, total: 142_000 });
  assert.deepEqual(conversionCost({ 'Raw Material Purchases': -100 }, 10), { factory: 10, other: 0, total: 10 });
  assert.equal(stockUnposted(lines), false);
  assert.equal(stockUnposted({ 'Raw Material Purchases': -600_000, 'Stock movement (Opening − Closing)': 0 }), true);  // closing = opening, purchases booked
  assert.equal(stockUnposted({ 'Stock movement (Opening − Closing)': 0 }), false);                                     // nothing bought: nothing to value
  assert.equal(stockUnposted({ 'Raw Material Purchases': -600_000 }), false);                                          // no stock lines in the P&L at all
});

/** A synthetic Tally month + Shopify units + one BOM (₹400 material a unit). */
function tallyMonth(periodKey: string, o: { sales: number; units: number; rm: number; foh: number; mfg: number; freight: number; open: number; close: number; opex: number }) {
  const f = (x: Partial<DailyFact>): DailyFact => ({ source: 'shopify', channel: 'D2C', date: `${periodKey}-05`, revenue: 0, units: 0, orders: 0, fees: 0, ...x });
  const rows = [
    { name: 'D2C Sales', depth: 1, amount: o.sales }, { name: 'Opening Stock', depth: 1, amount: o.open },
    { name: 'Raw Material Purchases', depth: 1, amount: o.rm }, { name: 'Closing Stock', depth: 1, amount: o.close },
    ...(o.foh ? [{ name: 'Factory Overheads', depth: 1, amount: o.foh }] : []),
    ...(o.mfg ? [{ name: 'Manufacturing Costs', depth: 1, amount: o.mfg }] : []),
    ...(o.freight ? [{ name: 'Inward Freight', depth: 1, amount: o.freight }] : []),
    { name: 'Sales & Marketing', depth: 1, amount: o.opex },
  ];
  return [
    { connectorId: 'tally', slotId: 'pnl', periodKey, payload: { ledgerRows: rows, nettProfit: null } },
    { connectorId: 'shopify', slotId: 'sales', periodKey, payload: { facts: [f({ sku: 'HCORE-NECK', skuName: 'hCore Neck', revenue: o.sales, units: o.units })] } },
  ];
}
const BOM_REPORT = { connectorId: 'production', slotId: 'bom', periodKey: '2026-10', payload: { bomCosts: [{ fgId: 'FG-0008', bomNumber: '1', bomName: 'hCore Neck', costPerUnit: 400 }] } };

test('normalised COGM = BOM material + factory + manufacturing + inward freight; the memo is material timing only', () => {
  const o = { sales: 1_000_000, units: 500, rm: 600_000, foh: 80_000, mfg: 50_000, freight: 10_000, open: 900_000, close: 1_150_000, opex: 100_000 };
  const deck = buildLiveDeck([...tallyMonth('2026-06', o), BOM_REPORT] as never, [], {});
  const jun = deck.months.find((m) => m.key === '2026-06')!;
  assert.equal(jun.cogm, 600_000 + 80_000 + 50_000 + 10_000 + (900_000 - 1_150_000));   // 490,000 as booked
  assert.equal(jun.factory, 80_000);
  assert.equal(jun.conversion, 140_000);                                                 // FOH + Mfg + Inward
  assert.equal(jun.stockUnposted, undefined);
  // memo = material purchased + stock movement − BOM material of the units sold; no conversion cost in it
  assert.equal(jun.channelRecon!.cogmVariance, 600_000 + (900_000 - 1_150_000) - 500 * 400);
  const norm = normaliseLiveMonths(deck.months, deck.completeness, deck);
  const n = norm.months.find((m) => m.key === '2026-06')!;
  assert.equal(n.cogm, 500 * 400 + 80_000 + 50_000 + 10_000);                            // 340,000 (was 280,000 before the fix)
  assert.equal(n.grossMargin, 1_000_000 - 340_000);
  assert.equal(n.stockVariance, 150_000);
  assert.equal(r2(n.netIncome - n.stockVariance!), jun.netIncome);
  assert.deepEqual(norm.stockEstimated, []);
  const agg = aggregatePeriods([n], deck.completeness, 'month')[0];
  assert.equal(agg.conversion, 140_000);
  assert.equal(r2(agg.cogm - agg.conversion), 200_000);                                  // what the bridge calls "Product cost (BOM)"
});

test('seven months shaped like Apr–Oct 2026: the year reconciles and unposted closing stock is marked estimated', () => {
  // Made-up figures in the shape of the stored Tally copies: stock built Apr–Jun, drawn down in Jul, closing stock
  // left equal to opening in Sep and Oct, and a thin Oct with no factory ledger.
  const set: [string, Parameters<typeof tallyMonth>[1]][] = [
    ['2026-04', { sales: 4_000_000, units: 4000, rm: 2_800_000, foh: 380_000, mfg: 620_000, freight: 24_000, open: 11_700_000, close: 12_350_000, opex: 3_000_000 }],
    ['2026-05', { sales: 6_800_000, units: 7000, rm: 2_600_000, foh: 406_000, mfg: 700_000, freight: 32_000, open: 12_350_000, close: 14_300_000, opex: 8_000_000 }],
    ['2026-06', { sales: 4_900_000, units: 5000, rm: 3_400_000, foh: 397_000, mfg: 1_026_000, freight: 50_000, open: 14_300_000, close: 16_330_000, opex: 3_800_000 }],
    ['2026-07', { sales: 4_600_000, units: 4800, rm: 1_500_000, foh: 396_000, mfg: 670_000, freight: 37_000, open: 16_330_000, close: 14_540_000, opex: 2_500_000 }],
    ['2026-08', { sales: 3_000_000, units: 3100, rm: 1_000_000, foh: 402_000, mfg: 491_000, freight: 19_000, open: 14_540_000, close: 14_820_000, opex: 2_100_000 }],
    ['2026-09', { sales: 6_300_000, units: 6500, rm: 2_800_000, foh: 398_000, mfg: 365_000, freight: 32_000, open: 14_820_000, close: 14_820_000, opex: 1_400_000 }],
    ['2026-10', { sales: 760_000, units: 800, rm: 1_250_000, foh: 0, mfg: 14_000, freight: 0, open: 14_820_000, close: 14_820_000, opex: 240_000 }],
  ];
  const deck = buildLiveDeck([...set.flatMap(([k, o]) => tallyMonth(k, o)), BOM_REPORT] as never, [], {});
  const keys = set.map(([k]) => k);
  const norm = normaliseLiveMonths(deck.months, deck.completeness, deck);
  let sumNi = 0, sumMemo = 0, sumTally = 0;
  for (const [k, o] of set) {
    const booked = deck.months.find((m) => m.key === k)!;
    const n = norm.months.find((m) => m.key === k)!;
    const factory = o.foh || r2(0.1 * o.sales);                                          // no ledger → the labelled 10 % fallback
    assert.equal(n.cogm, r2(o.units * 400 + factory + o.mfg + o.freight), `${k} normalised COGM`);
    // The memo carries no manufacturing cost or freight: only material (and, in a month with no factory ledger, the assumed factory charge).
    assert.equal(n.stockVariance, r2(o.rm + (o.open - o.close) - o.units * 400 - (o.foh ? 0 : factory)), `${k} memo`);
    assert.equal(r2(booked.grossMargin + n.stockVariance!), n.grossMargin, `${k} GM + memo`);
    sumNi += n.netIncome; sumMemo += n.stockVariance!; sumTally += booked.netIncome;
  }
  assert.equal(r2(sumNi - sumMemo), r2(sumTally));                                       // Σ normalised NI − Σ memo = Tally NI
  const fy = aggregatePeriods(norm.months.filter((m) => keys.includes(m.key)), deck.completeness, 'fy')[0];
  assert.equal(r2(fy.netIncome - fy.stockVariance), r2(sumTally));
  assert.equal(fy.conversion, r2(set.reduce((s, [, o]) => s + (o.foh || 0.1 * o.sales) + o.mfg + o.freight, 0)));
  // Sep and Oct: closing = opening with purchases booked → estimated, said in the note; the others are clean.
  assert.deepEqual(norm.stockEstimated, ['2026-09', '2026-10']);
  assert.match(norm.note, /Sep 26–Oct 26 estimated — closing stock not posted in Tally yet/);
  assert.equal(deck.months.find((m) => m.key === '2026-08')!.stockUnposted, undefined);
});

test('bridge: manufacturing cost and inward freight are their own step, not inside "Product cost (BOM)"', () => {
  const a = { sales: 1_000_000, units: 500, rm: 600_000, foh: 80_000, mfg: 50_000, freight: 10_000, open: 900_000, close: 1_150_000, opex: 100_000 };
  const b = { ...a, mfg: 90_000, freight: 20_000 };
  const deck = buildLiveDeck([...tallyMonth('2026-06', a), ...tallyMonth('2026-07', b), BOM_REPORT] as never, [], {});
  const pick = (ms: MonthlyMIS[], k: string) => aggregatePeriods(ms.filter((m) => m.key === k), deck.completeness, 'month')[0];
  const norm = normaliseLiveMonths(deck.months, deck.completeness, deck);
  const r = buildBridge({
    base: pick(deck.months, '2026-06'), cur: pick(deck.months, '2026-07'),
    baseNorm: pick(norm.months, '2026-06'), curNorm: pick(norm.months, '2026-07'), cells: deck.skuCells,
  });
  assert.equal(r.status, 'ok');
  if (r.status !== 'ok') return;
  const step = (id: string) => (r.steps.find((s) => s.id === id)?.value ?? NaN) + 0;
  assert.equal(step('bom_cost'), 0);
  assert.equal(step('factory'), 0);
  assert.equal(step('direct_other'), -50_000);
  assert.equal(step('stock_timing'), 0);
  assert.ok(Math.abs(r.steps.reduce((t, x) => t + x.value, 0) - r.delta) < 1);
});

// ---- Sales with no BOM cost never enter the normalised COGM at ₹0 (10 Nov 2026, audit round 6 A6-1 / A6-9) ----------

test('uncostedEstimate: no-cost cells + unmapped sales costed at the month\'s own BOM material rate', () => {
  const cs = [cell('2026-09', 'hCore X', 400), cell('2026-09', 'hCore Y', 200), cell('2026-09', 'Cushion', 0, { noCost: true }), cell('2026-09', 'Accessory (excl)', 0)];
  const u = uncostedEstimate(cs, 3000);
  assert.equal(u.revenue, 4000);                  // 1,000 no-cost cell + 3,000 unmapped
  assert.equal(u.unmappedRevenue, 3000);
  assert.equal(u.rate, 0.3);                       // 600 ÷ 2,000 of the costed cells
  assert.equal(u.estCost, 1200);
  assert.equal(r2(u.share), r2(4000 / 6000));
  assert.deepEqual(uncostedEstimate([cell('2026-09', 'hCore X', 400)]), { revenue: 0, unmappedRevenue: 0, rate: 0.4, estCost: 0, share: 0 });
  assert.equal(uncostedEstimate([cell('2026-09', 'A', 0, { noCost: true })], 0).estCost, null);
});

test('unmapped sales and no-BOM cells add their estimated material to the normalised COGM; the identity holds; the note says so', () => {
  // Sep: cells 3 × ₹1,000 (two costed at 30 %, one no-BOM) + ₹1,000 unmapped → ₹2,000 not costed → +₹600 material.
  const sep = month('2026-09', 10000, 5000, 800, { unmappedRevenue: 1000 });
  const cs = [cell('2026-09', 'hCore X', 400), cell('2026-09', 'hCore Y', 200), cell('2026-09', 'Cushion', 0, { noCost: true })];
  const out = normaliseLiveMonths([sep], { '2026-09': full('2026-09') }, { skuCells: cs });
  const n = out.months[0];
  assert.equal(n.cogm, 5000 - 800 + 600);         // before the fix: 4,200 (the ₹2,000 of sales at ₹0 cost)
  assert.equal(n.stockVariance, 200);
  assert.equal(r2(n.netIncome - n.stockVariance!), sep.netIncome);
  assert.deepEqual(out.uncosted, { '2026-09': { revenue: 2000, estCost: 600 } });
  assert.match(out.note, /Not costed by BOM \(no BOM \/ not mapped\): ₹0\.02 L of sales in Sep 26 — material estimated/);
  assert.deepEqual(out.skipped, []);
});

test('a month where most sales have no BOM cost stays as booked, with its own reason', () => {
  const oct = month('2026-10', 10000, 5000, 800, { unmappedRevenue: 5000 });
  const out = normaliseLiveMonths([oct], { '2026-10': full('2026-10') }, { skuCells: [cell('2026-10', 'hCore X', 400)] });
  assert.deepEqual(out.months[0], oct);
  assert.deepEqual(out.skipped, ['2026-10']);
  assert.match(out.note, /Oct 26 shown as booked — most sales have no BOM cost/);
  assert.ok(!/no BOM costing for it/.test(out.note));
});

test('a live deck: unmapped B2B-style sales are carried on the month and costed in the normalised COGM', () => {
  const o = { sales: 1_000_000, units: 500, rm: 600_000, foh: 80_000, mfg: 50_000, freight: 10_000, open: 900_000, close: 1_150_000, opex: 100_000 };
  const extra = { connectorId: 'shopify', slotId: 'sales2', periodKey: '2026-06', payload: { facts: [
    { source: 'shopify', channel: 'D2C', date: '2026-06-06', revenue: 200_000, units: 100, orders: 0, fees: 0, sku: 'ZZQ-NOT-A-PRODUCT-9', skuName: 'Qwxz gizmo 9' },
  ] } };
  const deck = buildLiveDeck([...tallyMonth('2026-06', o), extra, BOM_REPORT] as never, [], {});
  const jun = deck.months.find((m) => m.key === '2026-06')!;
  assert.equal(jun.unmappedRevenue, 200_000);
  const cellsJun = deck.skuCells.filter((c) => c.m === '2026-06' && !c.noCost);
  const rate = cellsJun.reduce((t, c) => t + c.cogs, 0) / cellsJun.reduce((t, c) => t + c.rev, 0);
  const norm = normaliseLiveMonths(deck.months, deck.completeness, deck);
  const n = norm.months.find((m) => m.key === '2026-06')!;
  assert.equal(n.cogm, r2(jun.cogm - jun.channelRecon!.cogmVariance + r2(rate * jun.unmappedRevenue)));
  assert.equal(r2(n.netIncome - n.stockVariance!), jun.netIncome);
  assert.ok(norm.uncosted['2026-06']);
});
