// MIS period maths shared by Live MIS, its exports and the planning history (client/src/data/misDeck/analytics.ts),
// plus the export-free Live MIS source split out of liveMisExport (utils/liveMisSource.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fiscalYear, fiscalQuarter, shortMonth, monthlySeries, quarterlySeries, yearlySeries, seriesFor,
  periodGrowth, yoyGrowth, cagr, pct, marginsOf, channelMix, channelHHI, topChannel, channelsAbove,
  type PeriodMIS,
} from '../../client/src/data/misDeck/analytics.ts';
import { MONTHLY_MIS, SALES_CHANNELS } from '../../client/src/data/misDeck/misDeckData.ts';
import * as source from '../../client/src/utils/liveMisSource.ts';
import * as exportMod from '../../client/src/utils/liveMisExport.ts';

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const sum = (xs: PeriodMIS[], f: (p: PeriodMIS) => number) => xs.reduce((s, p) => s + f(p), 0);

test('Indian FY and quarters', () => {
  assert.deepEqual(fiscalYear(3, 2026), { key: 'FY 2025-26', start: 2025 });
  assert.deepEqual(fiscalYear(4, 2026), { key: 'FY 2026-27', start: 2026 });
  assert.deepEqual(fiscalYear(12, 2099), { key: 'FY 2099-00', start: 2099 });
  assert.deepEqual([4, 6, 7, 9, 10, 12, 1, 3].map((m) => fiscalQuarter(m).label), ['Q1', 'Q1', 'Q2', 'Q2', 'Q3', 'Q3', 'Q4', 'Q4']);
  assert.equal(shortMonth('Dec 2023'), "Dec '23");
});

test('quarters and FYs foot to the months (every P&L line, every channel)', () => {
  const months = monthlySeries();
  assert.equal(months.length, MONTHLY_MIS.length);
  for (const g of ['quarter', 'year'] as const) {
    const s = seriesFor(g);
    assert.equal(sum(s, (p) => p.monthsCount), months.length);
    for (const k of ['netRevenue', 'grossMargin', 'cm1', 'cm2', 'cm3', 'ebitda', 'netIncome', 'cogm', 'opex', 'nonOperating'] as const) {
      near(sum(s, (p) => p[k]), sum(months, (p) => p[k]));
    }
    for (const c of SALES_CHANNELS) near(sum(s, (p) => p.netByChannel[c]), sum(months, (p) => p.netByChannel[c]));
    for (let i = 1; i < s.length; i++) assert.ok(s[i].sortKey > s[i - 1].sortKey, 'sorted');
  }
  assert.deepEqual(yearlySeries().map((p) => p.key), [...new Set(MONTHLY_MIS.map((m) => fiscalYear(m.month, m.year).key))].sort());
  const q = quarterlySeries()[0];
  assert.match(q.label, /^FY\d\d Q[1-4]$/);
  for (const p of yearlySeries()) near(p.nonOpOther, p.nonOperating - p.costOfFundraising);
});

test('Amazon stays Amazon before Oct 2024 (founder, 10 Nov 2026): no month is moved to OEM', () => {
  for (const p of monthlySeries()) if (p.sortKey < 202410) assert.ok(p.netByChannel.Amazon > 0, p.key);
  const raw = MONTHLY_MIS.filter((m) => m.key < '2024-10');
  assert.equal(raw.length, 10);
  // every channel keeps its own share of the month: the series is the workbook's split, on the ex-GST basis
  for (const m of raw) {
    const p = monthlySeries().find((x) => x.key === m.key)!;
    const tot = SALES_CHANNELS.reduce((s, c) => s + (m.netByChannel[c] ?? 0), 0);
    near(p.netByChannel.Amazon / p.netRevenue, (m.netByChannel.Amazon ?? 0) / tot, 1e-4);
  }
});

test('growth, CAGR, margins, mix', () => {
  const s = [{ v: 100 }, { v: 0 }, { v: 50 }, { v: 75 }] as unknown as PeriodMIS[];
  const v = (p: PeriodMIS) => (p as unknown as { v: number }).v;
  assert.deepEqual(periodGrowth(s, v), [null, -1, null, 0.5]); // growth from 0 = null, never Infinity
  assert.deepEqual(yoyGrowth(s, v, 2), [null, null, -0.5, null]);
  near(cagr(100, 400, 2)!, 1);
  assert.equal(cagr(0, 10, 1), null);
  assert.equal(cagr(10, -1, 1), null);
  assert.equal(pct(5, 0), 0);
  const fy = yearlySeries().at(-1)!;
  const m = marginsOf(fy);
  near(m.grossMarginPct, fy.grossMargin / fy.netRevenue);
  const mix = channelMix(fy);
  near(Object.values(mix).reduce((a, b) => a + b, 0), 1);
  assert.ok(Object.values(mix).every((x) => x >= 0));
  const top = topChannel(fy);
  assert.equal(top.share, Math.max(...Object.values(mix)));
  assert.ok(channelHHI(fy) > 0 && channelHHI(fy) <= 10_000);
  assert.ok(channelsAbove(fy, 0) >= 1);
  // a negative channel (returns > sales) never counts towards the mix
  const neg = { ...fy, netByChannel: { ...fy.netByChannel, [top.channel]: -1 } };
  assert.equal(channelMix(neg)[top.channel], 0);
});

test('liveMisSource: liveMisExport re-exports the same things; sheet count; cash rows only on company', () => {
  assert.equal(exportMod.LIVE_EXPORT_EVERYTHING, source.LIVE_EXPORT_EVERYTHING);
  assert.equal(exportMod.liveMisFormatSource, source.liveMisFormatSource);
  assert.equal(exportMod.misSourceWithCash, source.misSourceWithCash);
  assert.equal(source.liveSheetCount(source.LIVE_EXPORT_EVERYTHING), 18);
  const none = Object.fromEntries(Object.entries(source.LIVE_EXPORT_EVERYTHING).map(([k, x]) => [k, typeof x === 'boolean' ? false : []])) as unknown as source.LiveExportOptions;
  assert.equal(source.liveSheetCount(none), 0);
  assert.equal(source.liveSheetCount({ ...none, granularities: ['year'], includeChannelPnl: true }), 3);

  const point = { closingCash: 1, openingCash: 2 } as never;
  const base = { fiscalYears: [], channels: [], label: () => '', title: 't', fileName: 'f', point: () => point } as unknown as Parameters<typeof source.misSourceWithCash>[0];
  const withCash = source.misSourceWithCash(base, []);
  // no Cash Flow for the months → the point is left as it was, company or channel
  assert.equal(withCash.point(['2026-10'], 'company'), point);
  assert.equal(withCash.point(['2026-10'], 'D2C' as never), point);
});
