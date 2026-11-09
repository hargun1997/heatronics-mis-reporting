// "Why it moved" bridge (Live MIS Overview): contribution steps from one month to the next. Made-up figures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBridge, splitRevenue, topReasons, wordCount, comparisonKeys, moveWords, LAKH } from '../../client/src/data/misDeck/bridge.ts';
import { aggregatePeriods } from '../../client/src/data/misDeck/liveAnalytics.ts';
import { normaliseLiveMonths } from '../../client/src/data/misDeck/liveViews.ts';
import type { MonthlyMIS } from '../../client/src/data/misDeck/misDeckData.ts';
import type { PeriodCompleteness } from '../../client/src/data/misDeck/liveDeck.ts';
import type { SkuCell } from '../../client/src/data/misDeck/skuChannelPnl.ts';

function month(key: string, rev: number, cogm: number, o: Partial<MonthlyMIS> = {}, variance: number | null = 0): MonthlyMIS {
  const [year, m] = key.split('-').map(Number);
  const fulf = 100000, mk = 200000, plat = 50000, opex = 300000;
  const gm = rev - cogm, cm1 = gm - fulf, cm2 = cm1 - mk, cm3 = cm2 - plat, ebitda = cm3 - opex;
  return {
    key, label: key, month: m, year, netByChannel: { D2C: rev * 0.5, Amazon: rev * 0.5 }, grossByChannel: {}, returnsByChannel: {},
    totalGrossRevenue: 0, totalReturns: 0, totalTaxes: 0, netRevenue: rev, interBranch: 0, turnover: 0,
    grossMargin: gm, cm1, cm2, cm3, ebitda, netIncome: ebitda, cogm, channelFulfillment: fulf, salesMarketing: mk,
    platformCosts: plat, opex, nonOperating: 0, costOfFundraising: 0, cogmLines: {}, opexLines: {}, factory: 100000,
    marketingByPlatform: { 'Amazon Ads': mk * 0.6, Meta: mk * 0.4 },
    ...(variance === null ? {} : { channelRecon: { revenueResidue: {}, cogmVariance: variance } }),
    ...o,
  };
}
const comp = (k: string, level: PeriodCompleteness['level'] = 'full'): PeriodCompleteness => ({ periodKey: k, hasTally: true, cogmReal: true, level, sources: [], through: null, reconcileResidual: null });
const cell = (m: string, ch: SkuCell['ch'], p: string, u: number, rev: number): SkuCell => ({ m, ch, p, rev, cogs: u * 100, oth: 0, con: 0, u });

function setup(a: MonthlyMIS, b: MonthlyMIS, cells: SkuCell[], levels: [PeriodCompleteness['level'], PeriodCompleteness['level']] = ['full', 'full']) {
  const completeness = { [a.key]: comp(a.key, levels[0]), [b.key]: comp(b.key, levels[1]) };
  const actual = aggregatePeriods([a, b], completeness, 'month');
  const norm = normaliseLiveMonths([a, b], completeness, { skuCells: cells });
  const normP = aggregatePeriods(norm.months, completeness, 'month');
  return buildBridge({ base: actual[0], cur: actual[1], baseNorm: normP[0], curNorm: normP[1], cells });
}

const cells = [
  cell('2026-09', 'D2C', 'A', 100, 1000000), cell('2026-09', 'Amazon', 'A', 100, 1200000),
  cell('2026-10', 'D2C', 'A', 80, 880000), cell('2026-10', 'Amazon', 'A', 150, 1650000),
];

test('steps add up to the EBITDA change, bars end on the later month', () => {
  const a = month('2026-09', 2000000, 800000, {}, 20000);
  const b = month('2026-10', 2530000, 1000000, { salesMarketing: 420000, marketingByPlatform: { 'Amazon Ads': 340000, Meta: 80000 } }, 50000);
  const r = setup(a, b, cells);
  assert.equal(r.status, 'ok');
  if (r.status !== 'ok') return;
  const sum = r.steps.reduce((s, x) => s + x.value, 0);
  assert.ok(Math.abs(sum - r.delta) < 1, `${sum} vs ${r.delta}`);
  assert.equal(r.bars[0].kind, 'total');
  assert.equal(r.bars[r.bars.length - 1].to, r.end);
  assert.ok(r.steps.find((s) => s.id === 'stock_timing'));
  assert.ok(r.steps.find((s) => s.id === 'bom_cost'));
  assert.equal(r.steps.find((s) => s.id === 'volume')!.lakh, Math.round((r.steps.find((s) => s.id === 'volume')!.value / LAKH) * 100) / 100);
});

test('revenue split: volume + channel mix + price/mix = cell revenue change', () => {
  const s = splitRevenue(cells.filter((c) => c.m === '2026-09'), cells.filter((c) => c.m === '2026-10'))!;
  assert.ok(Math.abs(s.volume + s.channelMix + s.priceMix - s.cellDelta) < 1e-6);
  assert.ok(s.volume > 0); // 200 -> 230 units
  assert.ok(s.channelMix > 0); // units moved to Amazon, which sells at a higher price here
});

test('no units in a month = revenue is not split (one step), never a made-up split', () => {
  const a = month('2026-09', 2000000, 800000), b = month('2026-10', 2300000, 900000);
  const r = setup(a, b, []);
  assert.equal(r.status, 'ok');
  if (r.status !== 'ok') return;
  assert.ok(r.steps.some((s) => s.id === 'revenue'));
  assert.ok(!r.steps.some((s) => s.id === 'volume'));
  assert.ok(r.notes.some((n) => /unit/i.test(n)));
});

test('a month without BOM costing keeps COGM as one step', () => {
  const a = month('2026-09', 2000000, 800000, {}, null), b = month('2026-10', 2300000, 900000, {}, 10000);
  const r = setup(a, b, cells);
  assert.equal(r.status, 'ok');
  if (r.status !== 'ok') return;
  assert.ok(r.steps.some((s) => s.id === 'cogm'));
  assert.ok(!r.steps.some((s) => s.id === 'bom_cost'));
});

test('top-line month = not enough data; contribution month ends on CM2', () => {
  const a = month('2026-09', 2000000, 800000), b = month('2026-10', 2300000, 900000);
  const t = setup(a, b, cells, ['full', 'topline']);
  assert.equal(t.status, 'not_enough_data');
  const c = setup(a, b, cells, ['contribution', 'full']);
  assert.equal(c.status, 'ok');
  if (c.status !== 'ok') return;
  assert.equal(c.endRow, 'cm2');
  assert.ok(!c.steps.some((s) => s.id === 'opex'));
});

test('story: 3 reasons, each at most 10 words, biggest first, ads named by platform', () => {
  const a = month('2026-09', 2000000, 800000, {}, 0);
  const b = month('2026-10', 2000000, 800000, { salesMarketing: 620000, marketingByPlatform: { 'Amazon Ads': 520000, Meta: 100000 }, opex: 330000 }, 0);
  const r = setup(a, b, []);
  assert.equal(r.status, 'ok');
  if (r.status !== 'ok') return;
  assert.ok(r.reasons.length <= 3 && r.reasons.length >= 1);
  for (const x of r.reasons) assert.ok(wordCount(x.text) <= 10, x.text);
  assert.equal(r.reasons[0].text, 'Amazon ads up ₹4.0 L');
  const abs = r.reasons.map((x) => Math.abs(x.lakh));
  assert.deepEqual([...abs].sort((p, q) => q - p), abs);
  assert.deepEqual(topReasons(r), r.reasons);
});

test('comparisonKeys finds previous month and same month last year only when present', () => {
  const keys = ['2025-10', '2026-01', '2026-09', '2026-10'];
  assert.deepEqual(comparisonKeys(keys, '2026-10'), { previous: '2026-09', lastYear: '2025-10' });
  assert.deepEqual(comparisonKeys(keys, '2026-01'), { previous: null, lastYear: null });
  assert.equal(moveWords(-1.234).words, 'down ₹1.2 L');
});
