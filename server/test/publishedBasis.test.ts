// The published (workbook) history on the live basis (10 Nov 2026): channel rows ex-GST, Amazon shown as Amazon from
// Dec 2023, one basis for YoY / like-for-like, and the AI context built from the deck the screen shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MONTHLY_MIS, SALES_CHANNELS, type MonthlyMIS, type SalesChannel } from '../../client/src/data/misDeck/misDeckData.ts';
import { SKU_CELLS, type SkuCell } from '../../client/src/data/misDeck/skuChannelPnl.ts';
import {
  exGstChannels, recutAmazonCells, publishedGap, publishedGapRows, PUBLISHED_MONTHS, PUBLISHED_CELLS, AMAZON_NO_SKU_SPLIT,
} from '../../client/src/data/misDeck/publishedBasis.ts';
import { buildLiveDeck, LIVE_BOUNDARY } from '../../client/src/data/misDeck/liveDeck.ts';
import { aggregatePeriods } from '../../client/src/data/misDeck/liveAnalytics.ts';
import { anchoredChannelPnl, liveLikeForLike, unifyChannels } from '../../client/src/data/misDeck/liveViews.ts';
import { buildLiveMisContext, contextMonths, fySummaryOf } from '../../client/src/data/chat/misContext.ts';

const sumCh = (o: Partial<Record<SalesChannel, number>>) => SALES_CHANNELS.reduce((s, c) => s + (o[c] ?? 0), 0);
const close = (a: number, b: number, tol = 0.02) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const deck = buildLiveDeck([]); // the published history, as the Live MIS shows it with nothing uploaded
const legacy = deck.months.filter((m) => m.key < LIVE_BOUNDARY);

test('exGstChannels: rows scaled to net revenue, GMV kept, idempotent, nothing to do = same object', () => {
  const base = MONTHLY_MIS[0];
  const m: MonthlyMIS = { ...base, netRevenue: 1000, totalTaxes: -50, netByChannel: { Amazon: 630, OEM: 420, Blinkit: 0 } };
  const x = exGstChannels(m);
  assert.deepEqual(x.netByChannel, { Amazon: 600, OEM: 400, Blinkit: 0 });
  assert.deepEqual(x.gmvByChannel, m.netByChannel);
  assert.equal(x.netRevenue, 1000);
  assert.equal(exGstChannels(x), x);
  const odd = exGstChannels({ ...m, netRevenue: 100, netByChannel: { Amazon: 35, OEM: 35, D2C: 35 } });
  close(sumCh(odd.netByChannel), 100, 1e-9); // rounding paise go on one channel
  const footed: MonthlyMIS = { ...base, netRevenue: 500, totalTaxes: 0, netByChannel: { D2C: 500 } };
  assert.equal(exGstChannels(footed), footed);
  // rows already ex-GST but rounded (taxes 0): footed, and no GMV is claimed
  const rounded = exGstChannels({ ...footed, netRevenue: 501 });
  assert.equal(rounded.netByChannel.D2C, 501);
  assert.equal(rounded.gmvByChannel, undefined);
  const empty: MonthlyMIS = { ...base, netByChannel: {} };
  assert.equal(exGstChannels(empty), empty);
});

test('every published month: Σ channels = net revenue (deck and every reader of the history)', () => {
  assert.equal(legacy.length, 28); // Dec 2023 → Mar 2026
  for (const m of [...deck.months, ...PUBLISHED_MONTHS]) close(sumCh(m.netByChannel), m.netRevenue);
  // the workbook rows carried GST: the gap that was removed is the month's GST line (exact to Dec 2025)
  for (const raw of MONTHLY_MIS.filter((m) => m.key <= '2025-12')) {
    const m = legacy.find((x) => x.key === raw.key)!;
    close(sumCh(m.gmvByChannel!) - m.netRevenue, Math.abs(raw.totalTaxes), 1);
    assert.deepEqual(m.gmvByChannel, raw.netByChannel);
    assert.deepEqual(m.grossByChannel, raw.grossByChannel); // the build-up stays as booked
    assert.equal(m.netRevenue, raw.netRevenue);
  }
});

test('Amazon is Amazon for Dec 2023 – Sep 2024; FY totals read the workbook', () => {
  const early = legacy.filter((m) => m.key < '2024-10');
  assert.equal(early.length, 10);
  for (const m of early) assert.ok((m.netByChannel.Amazon ?? 0) > 0, m.key);
  close(early.reduce((s, m) => s + (m.gmvByChannel!.Amazon ?? 0), 0), 10_064_541, 1); // the ₹1.01 Cr that had been moved to OEM

  const fy = Object.fromEntries(aggregatePeriods(deck.months, deck.completeness, 'year').map((y) => [y.key, y]));
  const fy25 = fy['FY24-25'], fy26 = fy['FY25-26'];
  close(fy25.netRevenue, 37_951_040, 1);
  const gmv25 = legacy.filter((m) => m.key >= '2024-04' && m.key <= '2025-03').reduce((s, m) => s + (m.gmvByChannel!.Amazon ?? 0), 0);
  close(gmv25, 26_086_729, 1);                                   // workbook: Amazon ₹2.61 Cr incl. GST
  close((fy25.netByChannel.Amazon ?? 0) / fy25.netRevenue, 0.654, 0.001); // 65 % of net revenue
  close(fy26.netRevenue, 58_339_080, 1);
  close(((fy26.netByChannel.Amazon ?? 0) - (fy25.netByChannel.Amazon ?? 0)) / (fy25.netByChannel.Amazon ?? 0), -0.222, 0.001);
  close(fy['FY23-24'].netRevenue, 13_411_341, 1);
});

test('channel P&L of a published year adds up to the company (revenue, EBITDA, net income)', () => {
  for (const y of aggregatePeriods(deck.months, deck.completeness, 'year').filter((p) => p.key <= 'FY25-26')) {
    const rows = anchoredChannelPnl(y, deck.skuCells, deck.completeness);
    const tot = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
    close(tot((r) => r.revenue), y.netRevenue, 1);
    close(tot((r) => r.ebitda), y.ebitda, 1);
    close(tot((r) => r.netIncome), y.netIncome, 1);
  }
});

test('like-for-like: one basis, and only months that have a prior-year month', () => {
  const u = unifyChannels(deck);
  const years = Object.fromEntries(aggregatePeriods(u.months, u.completeness, 'year').map((y) => [y.key, y]));
  const fy25 = liveLikeForLike(years['FY24-25'], u.months);
  assert.equal(fy25.curScope, "Dec '24–Mar '25");               // 4 of the 12 months have a year-ago month
  assert.equal(fy25.priorComplete, false);
  close(fy25.revenueGrowth!, 0.223, 0.001);                      // was +183 % (12 months against 4)
  const fy26 = liveLikeForLike(years['FY25-26'], u.months);
  assert.equal(fy26.priorComplete, true);
  close(fy26.rows.reduce((s, r) => s + r.prior, 0), fy26.priorRevenue, 1); // rows and headline on the same basis
  close(fy26.rows.reduce((s, r) => s + r.cur, 0), fy26.curRevenue, 1);
  close(fy26.rows.find((r) => r.channel === 'Amazon')!.growth!, -0.222, 0.001);
  close(fy26.rows.find((r) => r.channel === 'B2B')!.growth!, 0.544, 0.001);
  const none = liveLikeForLike(years['FY23-24'], u.months);
  assert.equal(none.revenueGrowth, null);
  assert.ok(none.curRevenue > 0);                                // no prior year: the period itself is still shown
});

test('SKU cells: early Amazon is its own cell, cut out of the OEM model cell', () => {
  const total = (cells: SkuCell[], f: (c: SkuCell) => number) => cells.reduce((s, c) => s + f(c), 0);
  close(total(SKU_CELLS, (c) => c.cogs) - total(PUBLISHED_CELLS, (c) => c.cogs), 4_537_000, 60_000); // only the phantom OEM-model cost on Amazon goes
  for (const raw of MONTHLY_MIS.filter((m) => m.key < '2024-10')) {
    const cells = PUBLISHED_CELLS.filter((c) => c.m === raw.key);
    const amz = cells.filter((c) => c.ch === 'Amazon');
    assert.equal(amz.length, 1, raw.key);
    assert.equal(amz[0].p, AMAZON_NO_SKU_SPLIT);
    assert.equal(amz[0].costEst, true);
    assert.equal(amz[0].uEst, true);                             // units estimated, flagged
    const pub = PUBLISHED_MONTHS.find((m) => m.key === raw.key)!;
    close(amz[0].rev, pub.netByChannel.Amazon!, 0.01);            // ex-GST, like the channel row
    close(total(cells.filter((c) => c.ch === 'OEM'), (c) => c.rev), pub.netByChannel.OEM!, 2);
  }
  // months with their own Amazon cells are untouched
  const oct = SKU_CELLS.filter((c) => c.m === '2024-10');
  assert.equal(recutAmazonCells(oct, MONTHLY_MIS.find((m) => m.key === '2024-10')), oct);
  // synthetic: an OEM cell that does not hold OEM + Amazon is left alone
  const base = MONTHLY_MIS[0];
  const cell: SkuCell = { m: 'x', ch: 'OEM', p: 'P', rev: 100, cogs: 60, oth: 0, con: 40, u: 10 };
  const m = (o: Partial<Record<SalesChannel, number>>): MonthlyMIS => ({ ...base, netByChannel: o });
  assert.deepEqual(recutAmazonCells([cell], m({ OEM: 100, Amazon: 50 })), [cell]);
  const cut = recutAmazonCells([cell], m({ OEM: 60, Amazon: 40 }));
  assert.deepEqual(cut.map((c) => [c.ch, c.rev, c.cogs, c.u]), [['OEM', 60, 36, 6], ['Amazon', 40, 24, 0]]);
});

test('AI context = the deck the screen shows (months and fiscal years), not the raw workbook', () => {
  const { context } = buildLiveMisContext(null); // no live deck yet = the published history, same basis
  assert.equal(context, buildLiveMisContext(deck).context);
  const json = (tag: string) => JSON.parse(context.split(`${tag} (JSON):\n`)[1].split('\n')[0]);
  const months = json('MONTHS') as { key: string; netRevenue: number; netIncome: number; netByChannel: Record<string, number>; gmvByChannelInclGst?: Record<string, number> }[];
  assert.equal(months.length, deck.months.length);
  for (const m of deck.months) {
    const c = months.find((x) => x.key === m.key)!;
    assert.equal(c.netRevenue, Math.round(m.netRevenue));
    assert.equal(c.netIncome, Math.round(m.netIncome));
    for (const ch of SALES_CHANNELS) assert.equal(c.netByChannel[ch] ?? 0, Math.round(m.netByChannel[ch] ?? 0) || 0, `${m.key} ${ch}`);
    assert.ok(Math.abs(Object.values(c.netByChannel).reduce((s, v) => s + v, 0) - c.netRevenue) <= SALES_CHANNELS.length, m.key);
  }
  assert.ok((months.find((x) => x.key === '2024-06')!.netByChannel.Amazon ?? 0) > 0);
  assert.ok(months.find((x) => x.key === '2024-06')!.gmvByChannelInclGst);

  const fys = json('FISCAL_YEAR_SUMMARY') as ReturnType<typeof fySummaryOf>;
  const years = aggregatePeriods(deck.months, deck.completeness, 'year');
  assert.deepEqual(fys.map((f) => f.name.replace('FY 20', 'FY')), years.map((y) => y.key));
  for (const [i, y] of years.entries()) {
    const f = fys[i];
    assert.equal(f.netRevenue, Math.round(y.netRevenue));
    assert.equal(f.netIncome, Math.round(y.netIncome));
    assert.equal(f.ebitda, Math.round(y.ebitda));
    assert.equal(f.months, y.members.length);
    for (const ch of SALES_CHANNELS) assert.equal(f.netByChannel[ch] ?? 0, Math.round(y.netByChannel[ch] ?? 0) || 0);
  }
  assert.equal(fys[0].months, 4);                                 // FY 2023-24 = Dec–Mar only, and says so
  assert.equal(fys[0].from, 'Dec 2023');
  assert.ok(!context.includes('10900000'));                      // the stale stored FY 2026-27 summary is gone
  assert.ok(!/PUBLISHED_HISTORY/.test(context));

  // margins only over months with a full P&L; none = null (never 0)
  const m0 = deck.months[0];
  const top = fySummaryOf([m0], { [m0.key]: { ...deck.completeness[m0.key], level: 'topline' } });
  assert.equal(top[0].fullPnlMonths, 0);
  assert.equal(top[0].ebitdaPct, null);
  assert.equal(top[0].netIncome, null);
});

test('months now from Tally carry the ₹ change vs the published workbook', () => {
  const pub = { ...MONTHLY_MIS[0], netRevenue: 100, netIncome: 10 }, live = { ...pub, netRevenue: 90.5, netIncome: -5 };
  assert.deepEqual(publishedGap(pub, live), { netRevenue: 100, netIncome: 10, dNetRevenue: -9.5, dNetIncome: -15 });
  const g = publishedGap(pub, live);
  assert.deepEqual(publishedGapRows({ '2026-05': { vsPublished: g }, '2026-04': { vsPublished: g }, '2026-03': {} }).map((r) => r.key), ['2026-04', '2026-05']);
  assert.deepEqual(publishedGapRows(deck.completeness), []);      // nothing live = no note
  const m = deck.months[deck.months.length - 1];
  const [row] = contextMonths([m], { [m.key]: { ...deck.completeness[m.key], vsPublished: g } });
  assert.deepEqual(row.vsPublishedWorkbook, { netRevenueChange: -9, netIncomeChange: -15 });
});

test('a month now from Tally that differs from the published MIS by ≥ ₹10,000 is a Fix item (low), not a banner', async () => {
  const { deckItems } = await import('../../client/src/data/issues/inbox.ts');
  const big = { netRevenue: 2_000_000, netIncome: 100_000, dNetRevenue: -25_000, dNetIncome: 40_000 };
  const small = { ...big, dNetRevenue: 500, dNetIncome: -900 };
  const items = deckItems({ completeness: { '2026-04': { vsPublished: big }, '2026-05': { vsPublished: small } } as never, productGaps: undefined as never });
  const pub = items.filter((i) => i.id.startsWith('published:'));
  assert.deepEqual(pub.map((i) => i.id), ['published:2026-04']);
  assert.equal(pub[0].severity, 'low');
  assert.match(pub[0].title, /−₹25,000.*\+₹40,000/);
});

test('SKU cells cut from the workbook rows are ex-GST: they sum to the ex-GST channel row; early Amazon has estimated units', async () => {
  const { exGstCells, earlyAmazonAsp } = await import('../../client/src/data/misDeck/publishedBasis.ts');
  const rawBy = new Map(MONTHLY_MIS.map((m) => [m.key, m]));
  let checked = 0;
  for (const pub of PUBLISHED_MONTHS) {
    const raw = rawBy.get(pub.key)!;
    for (const ch of SALES_CHANNELS) {
      const rawCells = SKU_CELLS.filter((c) => c.m === pub.key && c.ch === ch);
      const rawSum = rawCells.reduce((s, c) => s + c.rev, 0);
      const gross = raw.netByChannel[ch] ?? 0;
      const fromRows = (gross && rawCells.length && Math.abs(rawSum - gross) <= 2) || (pub.key < '2024-10' && ch === 'Amazon');
      if (!fromRows || !pub.gmvByChannel) continue;
      const sum = PUBLISHED_CELLS.filter((c) => c.m === pub.key && c.ch === ch).reduce((s, c) => s + c.rev, 0);
      close(sum, pub.netByChannel[ch] ?? 0, 1); checked++;
    }
  }
  assert.ok(checked >= 30, `checked ${checked}`);
  // Dec 2023 – Sep 2024: every cell is cut from the rows, so Σ cells = net revenue
  for (const pub of PUBLISHED_MONTHS.filter((m) => m.key < '2024-10')) {
    close(PUBLISHED_CELLS.filter((c) => c.m === pub.key).reduce((s, c) => s + c.rev, 0), pub.netRevenue, 1);
  }
  for (const c of PUBLISHED_CELLS) close(c.con, c.rev - c.cogs - c.oth, 0.02);
  // a group from another source (not equal to the row) is left as booked
  const m = { ...MONTHLY_MIS[0], netRevenue: 95, totalTaxes: -5, netByChannel: { D2C: 100 } };
  const cell: SkuCell = { m: m.key, ch: 'D2C', p: 'x', rev: 80, cogs: 10, oth: 5, con: 65, u: 1 };
  assert.deepEqual(exGstCells([cell], m, exGstChannels(m)), [cell]);
  assert.equal(exGstCells([{ ...cell, rev: 100 }], m, exGstChannels(m))[0].rev, 95);
  const asp = earlyAmazonAsp(PUBLISHED_CELLS)!;
  for (const c of PUBLISHED_CELLS.filter((x) => x.p === AMAZON_NO_SKU_SPLIT)) {
    assert.equal(c.uEst, true); close(c.u, c.rev / asp, 0.01); assert.ok(c.u > 0);
  }
});

test('early Amazon cells are costed at Amazon’s own rate, not the OEM model’s (round 6 B6-1/2)', async () => {
  const { earlyAmazonCogsRate } = await import('../../client/src/data/misDeck/publishedBasis.ts');
  const rate = earlyAmazonCogsRate(PUBLISHED_CELLS)!;
  assert.ok(rate > 0.15 && rate < 0.35, `rate ${rate}`);
  const gm = (cs: SkuCell[]) => 1 - cs.reduce((s, c) => s + c.cogs, 0) / cs.reduce((s, c) => s + c.rev, 0);
  let amzCogs = 0;
  for (const pub of PUBLISHED_MONTHS.filter((m) => m.key < '2024-10')) {
    const cells = PUBLISHED_CELLS.filter((c) => c.m === pub.key), raw = SKU_CELLS.filter((c) => c.m === pub.key);
    const amz = cells.filter((c) => c.ch === 'Amazon'), oem = cells.filter((c) => c.ch === 'OEM');
    close(amz[0].cogs, amz[0].rev * rate, 0.02);
    assert.ok(oem.every((c) => c.costEst), pub.key);
    assert.ok(Math.abs(gm(amz) - gm(oem)) > 0.2, `${pub.key}: Amazon GM ${gm(amz)} vs OEM ${gm(oem)}`);
    // the model cost on the Amazon revenue is dropped, never moved to OEM: cell COGS only go down
    assert.ok(cells.reduce((s, c) => s + c.cogs, 0) <= raw.reduce((s, c) => s + c.cogs, 0) + 0.01, pub.key);
    close(oem.reduce((s, c) => s + c.cogs, 0), raw.filter((c) => c.ch === 'OEM').reduce((s, c) => s + c.cogs, 0) * (1 - (MONTHLY_MIS.find((m) => m.key === pub.key)!.netByChannel.Amazon! / raw.filter((c) => c.ch === 'OEM').reduce((s, c) => s + c.rev, 0))), 1);
    amzCogs += amz[0].cogs;
  }
  close(amzCogs, 2_276_000, 60_000);                               // ≈ ₹22.8 L (was ₹68.1 L at the OEM model rate)
});
