// The SKU layer made to foot (audit rounds 6 / 8 / 10, 10 Nov 2026): "Not mapped" cells, Tranzact FGs outside the FG master,
// modelled cells flagged, static cells on the books' basis, COGM shares with no impossible cells, period = sum of months,
// "Why it moved" without a source-gap reason, Meta product rows capped at the account total, plan-vs-actual unit basis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SkuCell } from '../../client/src/data/misDeck/skuChannelPnl.ts';
import {
  NOT_MAPPED, notMappedCells, markModelled, bookedStaticCells, cogmShares, sumChannelRows, estimatedUnits,
} from '../../client/src/data/misDeck/skuLayer.ts';
import { uncostedEstimate } from '../../client/src/data/misDeck/uncosted.ts';
import { computeSku, tranzactFgHit, CHANNEL_BY_PLATFORM } from '../../client/src/data/monthClose/skuRollup.ts';
import { emptySession } from '../../client/src/data/monthClose/schema.ts';
import { PRODUCTS } from '../../client/src/data/monthClose/skuMap.ts';
import { buildLiveDeck } from '../../client/src/data/misDeck/liveDeck.ts';
import { PUBLISHED_CELLS } from '../../client/src/data/misDeck/publishedBasis.ts';
import { aggregatePeriods, slicePnl } from '../../client/src/data/misDeck/liveAnalytics.ts';
import { anchoredChannelPnl, unifyChannels } from '../../client/src/data/misDeck/liveViews.ts';
import { topReasons, type Bridge } from '../../client/src/data/misDeck/bridge.ts';
import { metaProductFacts } from '../src/connectors/slots/map/ads.ts';
import { actualMonthsFromDeck, AMAZON_ORDERED_PER_SETTLED } from '../../client/src/data/planning/planVsActualLive.ts';

const close = (a: number, b: number, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const cell = (o: Partial<SkuCell>): SkuCell => ({ m: '2026-09', ch: 'D2C', p: 'P', rev: 0, cogs: 0, oth: 0, con: 0, u: 0, ...o });

test('notMappedCells: one cell per channel, no cost, nothing dropped', () => {
  const rows = [
    { platform: 'shopify', revenue: 1000, units: 2, fees: 50 },
    { platform: 'shopify', revenue: 500, units: 1 },
    { platform: 'b2b', revenue: 16_90_000, units: 4841 },
  ];
  const cells = notMappedCells(rows, '2026-09', (p) => CHANNEL_BY_PLATFORM[p as keyof typeof CHANNEL_BY_PLATFORM]);
  assert.equal(cells.length, 2);
  const d2c = cells.find((c) => c.ch === 'D2C')!;
  assert.deepEqual([d2c.p, d2c.rev, d2c.u, d2c.oth, d2c.noCost], [NOT_MAPPED, 1500, 3, 50, true]);
  assert.equal(cells.find((c) => c.ch === 'B2B')!.rev, 16_90_000);
  // the normalised COGM counts unmapped sales once (as unmappedRevenue), never again through the "Not mapped" cell
  const u = uncostedEstimate([cell({ rev: 1000, cogs: 300 }), ...cells], 1500 + 16_90_000);
  assert.equal(u.revenue, 1500 + 16_90_000);
});

test('tranzactFgHit / computeSku: a Tranzact FG outside the FG master is its own product and is costed by its BOM', () => {
  const fg = 'FG-0999';
  assert.equal(PRODUCTS[fg], undefined);
  assert.equal(tranzactFgHit({ key: 'HCORE-KNEE' }), null);
  assert.equal(tranzactFgHit({ key: Object.keys(PRODUCTS)[0] }), null, 'a known FG goes through the map');
  const s = emptySession('2026-09', 'Sep 2026');
  s.sources = [{
    id: 's', label: 'tranzact', kind: 'skuPnl', method: 'connector', addedAt: '', nodes: [], crossChecks: [], warnings: [],
    skuRows: [{ platform: 'b2b', key: fg, name: 'OEM pad (new item)', revenue: 10_000, units: 40, fees: 0 }],
    bomCosts: [{ fgId: fg, bomNumber: 'B1', bomName: 'x', costPerUnit: 100, provenance: { source: 't', label: 't', method: 'read', confidence: 1 } as never }],
  } as never];
  const r = computeSku(s);
  assert.equal(r.unmapped.length, 0);
  const a = r.aggregates[0];
  assert.deepEqual([a.fgId, a.deckName, a.channel, a.cogs], [fg, 'OEM pad (new item)', 'B2B', 4000]);
});

test('buildLiveDeck: unmapped sales show as a "Not mapped" cell (revenue and units never vanish)', () => {
  const fact = (sku: string, revenue: number, units: number) => ({ source: 'amazon', channel: 'Amazon', date: '2026-09-15', sku, skuKind: 'sku', revenue, units, orders: units, fees: 0 });
  const deck = buildLiveDeck([{ connectorId: 'amazon', slotId: 'unified-transaction', periodKey: '2026-09', payload: { facts: [fact('VW-H1GL-KTOZ', 3000, 2), fact('ZZ-NOT-A-REAL-SKU', 1200, 3)] } } as never]);
  const sep = deck.skuCells.filter((c) => c.m === '2026-09');
  const nm = sep.find((c) => c.p === NOT_MAPPED);
  assert.ok(nm, 'a Not mapped cell exists');
  assert.deepEqual([nm!.ch, nm!.rev, nm!.u, nm!.noCost], ['Amazon', 1200, 3, true]);
  close(sep.reduce((t, c) => t + c.rev, 0), 4200, 0.01);
});

test('markModelled / estimatedUnits: workbook OEM / Offline / Blinkit cells are flagged, measured ones are not', () => {
  const out = markModelled([cell({ ch: 'OEM', u: 10 }), cell({ ch: 'Offline' }), cell({ ch: 'Blinkit' }), cell({ ch: 'Amazon', u: 5 })]);
  assert.deepEqual(out.map((c) => !!c.modelled), [true, true, true, false]);
  assert.equal(estimatedUnits(out[0]), 10);
  assert.equal(estimatedUnits(out[3]), 0);
  assert.equal(estimatedUnits(cell({ u: 7, uEst: true })), 7);
  // the published history carries the flag; Amazon / D2C cells stay measured
  assert.ok(PUBLISHED_CELLS.filter((c) => c.ch === 'OEM').every((c) => c.modelled));
  assert.ok(PUBLISHED_CELLS.filter((c) => c.ch === 'D2C' || c.ch === 'Amazon').every((c) => !c.modelled));
});

test('bookedStaticCells: D2C ads ex-GST, ads kept up to booked S&M, fees give way so cells never cost more than booked', () => {
  const cs = [cell({ ch: 'D2C', rev: 1000, oth: 100, ad: 118 }), cell({ ch: 'Amazon', rev: 1000, oth: 400, ad: 50 })];
  const exGst = bookedStaticCells(cs, undefined, { exGst: 100, gross: 118 });
  close(exGst[0].ad!, 100, 0.01);
  assert.equal(exGst[1].ad, 50);
  close(exGst[0].con, 1000 - 100 - 100, 0.01);
  // booked C&F 200 + S&M 200 = 400 < cells 500 + 150: ads (150 ≤ 200) kept, fees cut to the 250 left
  const capped = bookedStaticCells(exGst, { channelFulfillment: 200, salesMarketing: 200 });
  close(capped.reduce((t, c) => t + (c.ad ?? 0), 0), 150, 0.01);
  close(capped.reduce((t, c) => t + c.oth + (c.ad ?? 0), 0), 400, 0.05);
  // under the books: unchanged
  assert.deepEqual(bookedStaticCells(exGst, { channelFulfillment: 1000, salesMarketing: 1000 }).map((c) => c.oth), [100, 400]);
});

test('cogmShares: no cells = company rate, ₹0 / negative sales = no COGM, shares sum to 1', () => {
  // channels: A cells cogs 300, B cells cogs 100, C sales but no cells, D negative sales with cells
  const sh = cogmShares([600, 200, 200, -50], [300, 100, 0, 40], [true, true, false, true], () => 0);
  close(sh[2], 0.2, 1e-9);
  assert.equal(sh[3], 0);
  close(sh[0], 0.6, 1e-9);
  close(sh.reduce((t, v) => t + v, 0), 1, 1e-9);
  assert.deepEqual(cogmShares([0, 0], [10, 10], [true, true], () => 1), [0, 0]);
});

test('sumChannelRows: a period is its months added up, shares re-derived', () => {
  const row = (channel: 'D2C' | 'B2B', revenue: number, cogm: number) => ({
    channel, revenue, cogm, grossMargin: revenue - cogm, channelFulfillment: 0, cm1: revenue - cogm, salesMarketing: 0, cm2: revenue - cogm,
    platformCosts: 0, cm3: revenue - cogm, opex: 0, ebitda: revenue - cogm, nonOperating: 0, costOfFundraising: 0, netIncome: revenue - cogm,
    revShare: 0, cogsShare: 0, smShare: 0, basis: 'tally' as const,
  });
  const out = sumChannelRows([[row('D2C', 100, 30), row('B2B', 100, 70)], [row('D2C', 300, 90)]], ['D2C', 'B2B']);
  assert.deepEqual(out.map((r) => [r.channel, r.revenue, r.cogm]), [['D2C', 400, 120], ['B2B', 100, 70]]);
  close(out[0].revShare, 0.8, 1e-9);
  close(out[0].cogsShare, 120 / 190, 1e-9);
});

// ---- On the published history (the Live MIS with nothing uploaded) ----
const deck = unifyChannels(buildLiveDeck([]));
const fys = aggregatePeriods(deck.months, deck.completeness, 'year').filter((p) => /FY2[45]-2[56]/.test(p.key));
const months = new Map(aggregatePeriods(deck.months, deck.completeness, 'month').map((p) => [p.key, p]));

test('period = sum of months: FY channel P&L and FY SKU P&L equal their months added up (R6 B6-6)', () => {
  for (const fy of fys) {
    const fyRows = anchoredChannelPnl(fy, deck.skuCells, deck.completeness);
    const keys = new Set(fy.members);
    const fySku = slicePnl(fy, deck.skuCells, keys, 'sku');
    const sumCogm = new Map<string, number>();
    const sumOpex = new Map<string, number>();
    for (const k of fy.members) {
      const m = months.get(k)!;
      for (const r of anchoredChannelPnl(m, deck.skuCells, deck.completeness)) sumCogm.set(r.channel, (sumCogm.get(r.channel) ?? 0) + r.cogm);
      for (const c of slicePnl(m, deck.skuCells, new Set([k]), 'sku').columns) sumOpex.set(c.key, (sumOpex.get(c.key) ?? 0) + c.opex);
    }
    for (const r of fyRows) close(r.cogm, sumCogm.get(r.channel) ?? 0, 0.5);
    for (const c of fySku.columns) close(c.opex, sumOpex.get(c.key) ?? 0, 0.5 * fy.members.length);
  }
});

test('no impossible channel cells: no COGM on ₹0 / negative sales, no 100 % GM on sales with a cost basis (R6 B6-7)', () => {
  for (const m of months.values()) {
    if (!m.cogm) continue;
    for (const r of anchoredChannelPnl(m, deck.skuCells, deck.completeness)) {
      if (r.revenue <= 0) assert.equal(r.cogm, 0, `${m.key} ${r.channel}`);
      else assert.ok(r.cogm > 0, `${m.key} ${r.channel}: sales ₹${r.revenue} at 100 % GM`);
    }
  }
});

test('static cells never carry more channel fees + ads than the month booked (R8 C1)', () => {
  for (const m of deck.months) {
    if (!deck.completeness[m.key]?.locked && !deck.completeness[m.key]?.published) continue;
    const cs = deck.skuCells.filter((c) => c.m === m.key);
    const on = cs.reduce((t, c) => t + Math.max(0, c.oth) + Math.max(0, c.ad ?? 0), 0);
    assert.ok(on <= Math.max(0, m.channelFulfillment) + Math.max(0, m.salesMarketing) + 2, `${m.key}: ${on}`);
  }
});

test('Why it moved: the cells-vs-books gap is shown but never one of the top reasons (R10 B2)', () => {
  const step = (id: string, value: number) => ({ id, label: id, value, lakh: value / 1e5, group: 'revenue' as const });
  const b = { steps: [step('revenue_other', -14_43_000), step('volume', -3_00_000), step('other', 9_00_000), step('opex', 50_000)] } as unknown as Bridge;
  assert.deepEqual(topReasons(b).map((r) => r.stepId), ['volume', 'opex']);
});

test('Meta product rows above the account total are scaled down to it (R8 C10)', () => {
  const r = metaProductFacts([{ product_id: '111, Knee', spend: 600 }, { product_id: '222, Neck', spend: 500 }] as never, 1000, '2026-06');
  close(r.facts!.reduce((t, f) => t + (f.spend ?? 0), 0), 1000, 0.02);
  assert.equal(r.warnings.length, 1);
});

test('plan vs actual: Amazon settled units put on the plan\'s ordered basis', () => {
  const d = { months: [], completeness: {}, skuCells: [cell({ m: '2026-10', ch: 'Amazon', u: 100 }), cell({ m: '2026-10', ch: 'D2C', u: 50 })] };
  const mk = { key: '2026-10', netRevenue: 1, grossMargin: 0, cm3: 0, ebitda: 0 } as never;
  const a = actualMonthsFromDeck({ ...d, months: [mk], completeness: { '2026-10': { level: 'full' } as never } } as never, '2026-10');
  assert.equal(a[0].units, Math.round(100 * AMAZON_ORDERED_PER_SETTLED + 50));
});
