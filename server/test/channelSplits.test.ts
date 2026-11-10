// Channel splits on one method (audit rounds 8 + 9, 10 Nov 2026). Synthetic data only.
//   B1a MIS Sheet channel = the Channels tab row · B1b a year = Σ months · B2 fees / platform never on B2B / GT by revenue
//   A9-2 COGM on the booked revenue · R8 C8 no "leftover → Blinkit" · SKU × channel cells foot to the Channel P&L.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateChannelCost, cogsWeights, sumChannelRows } from '../../client/src/data/misDeck/channelAlloc.ts';
import { footChannelCells, footCellsToChannels, NOT_MAPPED } from '../../client/src/data/misDeck/channelFoot.ts';
import { buildLiveDeck } from '../../client/src/data/misDeck/liveDeck.ts';
import { aggregatePeriods } from '../../client/src/data/misDeck/liveAnalytics.ts';
import { anchoredChannelPnl, liveMisPoint, liveSkuChannelMatrix, tallyAnchoredRows, unifyChannels } from '../../client/src/data/misDeck/liveViews.ts';
import { channelPnl } from '../../client/src/data/misDeck/analytics.ts';
import { lookupLedger } from '../../client/src/data/monthClose/ledgerMap.ts';

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1, `${msg ?? ''} ${a} vs ${b}`);
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

test('allocateChannelCost: attributed fees stay, the rest goes to consumer channels only', () => {
  const ch = ['D2C', 'Amazon', 'B2B', 'GT'] as const;
  const a = allocateChannelCost(ch, 1000, [200, 300, 0, 0], [100, 300, 5000, 600]);
  near(sum(a.values), 1000); assert.equal(a.values[2], 0); assert.equal(a.values[3], 0);
  near(a.values[0], 200 + 500 * 0.25); near(a.values[1], 300 + 500 * 0.75); assert.equal(a.basis, 'estimated');
  // reports above the books: capped, nothing on B2B
  const c = allocateChannelCost(ch, 300, [200, 400, 0, 0], [1, 1, 1, 1]);
  near(c.values[0], 100); near(c.values[1], 200); assert.equal(c.values[2], 0); assert.equal(c.basis, 'attributed');
  // a fee a report puts on B2B (e.g. freight tagged to B2B) is kept
  near(allocateChannelCost(ch, 500, [0, 0, 100, 0], [1, 1, 1, 1]).values[2], 100);
  // no consumer channel at all → every channel by revenue
  const n = allocateChannelCost(['B2B', 'GT'], 100, [0, 0], [300, 100]);
  near(n.values[0], 75); near(n.values[1], 25);
});

test('cogsWeights: material per ₹ applied to the booked revenue; no cells / no BOM = estimated, never ₹0', () => {
  const w = cogsWeights(['D2C', 'B2B', 'GT'], [1000, 2000, 500], [
    { cogs: 300, cellRev: 1000, uncostedRev: 0 },     // fully covered
    { cogs: 400, cellRev: 1000, uncostedRev: 0 },     // SKU data = half of booked → cost doubled
    { cogs: 0, cellRev: 0, uncostedRev: 0 },          // booked, no cells → month rate (700 / 2000)
  ]);
  near(w.weights[0], 300); near(w.weights[1], 800); near(w.weights[2], 500 * 0.35);
  assert.deepEqual(w.estimated, [false, true, true]);
  assert.ok(w.notes.some((n) => n.startsWith('B2B: SKU data covers 50%')));
  // cost-less sales costed at the rate
  const u = cogsWeights(['D2C'], [1000], [{ cogs: 300, cellRev: 1000, uncostedRev: 400 }]);
  near(u.weights[0], 300 + 400 * (300 / 600)); assert.equal(u.estimated[0], true);
});

test('sumChannelRows adds numbers per channel', () => {
  const r = sumChannelRows([[{ channel: 'D2C' as const, a: 1, t: 'x' }], [{ channel: 'D2C' as const, a: 2, t: 'y' }, { channel: 'B2B' as const, a: 5, t: 'z' }]]);
  assert.deepEqual(r, [{ channel: 'D2C', a: 3, t: 'x' }, { channel: 'B2B', a: 5, t: 'z' }]);
});

// ---- Hand-built Tally month ---------------------------------------------------
function period(key: string, o: { b2bRev: number; cf: number; sm: number; pf: number; cogm: number }) {
  const rev = { D2C: 2_000_000, Amazon: 3_000_000, B2B: o.b2bRev, GT: 500_000 };
  const net = sum(Object.values(rev));
  const gm = net - o.cogm, cm1 = gm - o.cf, cm2 = cm1 - o.sm, cm3 = cm2 - o.pf, ebitda = cm3 - 100_000;
  return { key, label: key, members: [key], level: 'full', hasTally: true, netRevenue: net, netByChannel: rev, tallyLines: [],
    cogm: o.cogm, grossMargin: gm, channelFulfillment: o.cf, cm1, salesMarketing: o.sm, cm2, platformCosts: o.pf, cm3, opex: 100_000, ebitda,
    nonOperating: 0, costOfFundraising: 0, netIncome: ebitda } as never;
}
const cells = (m: string, b2bCellRev: number) => [
  { m, ch: 'D2C', p: 'Knee', rev: 2_000_000, cogs: 400_000, oth: 150_000, con: 0, u: 1000, ad: 600_000 },
  { m, ch: 'Amazon', p: 'Knee', rev: 3_000_000, cogs: 600_000, oth: 500_000, con: 0, u: 1500, ad: 300_000 },
  { m, ch: 'B2B', p: 'Pad', rev: b2bCellRev, cogs: b2bCellRev * 0.68, oth: 0, con: 0, u: 3000, ad: 0 },
  { m, ch: 'GT', p: 'Knee', rev: 500_000, cogs: 100_000, oth: 0, con: 0, u: 300, ad: 0 },
] as never[];
const LINES = ['revenue', 'cogm', 'grossMargin', 'channelFulfillment', 'cm1', 'salesMarketing', 'cm2', 'platformCosts', 'cm3', 'opex', 'ebitda', 'netIncome'] as const;
const CO: Record<string, string> = { revenue: 'netRevenue' };
const foots = (rows: Record<string, number>[], p: Record<string, number>) => { for (const k of LINES) near(sum(rows.map((r) => r[k])), p[CO[k] ?? k], `Σ channels ${k}`); };

test('Tally month: B2B carries its own material cost on ALL booked revenue, no fees / platform / marketing; foots', () => {
  const p = period('2099-05', { b2bRev: 4_000_000, cf: 800_000, sm: 1_000_000, pf: 50_000, cogm: 4_000_000 });
  const rows = tallyAnchoredRows(p, cells('2099-05', 2_000_000), {});
  const by = Object.fromEntries(rows.map((r) => [r.channel, r]));
  foots(rows as never, p);
  // B2B weight = 0.68 × 2.0 L cells × (40 L booked / 20 L cells) = 27.2 L of 27.2 + 4 + 6 + 1 = 38.2 L
  near(by.B2B.cogm, 4_000_000 * 27.2 / 38.2);
  assert.ok(by.B2B.grossMargin / by.B2B.revenue < 0.35, 'B2B GM is its own (≈ 29 %), not the company 60 %');
  assert.ok(by.B2B.estimatedLines?.includes('cogm'));
  for (const ch of ['B2B', 'GT']) { assert.equal(by[ch].channelFulfillment, 0); assert.equal(by[ch].platformCosts, 0); assert.equal(by[ch].salesMarketing, 0); }
});

test('a year = Σ months: costs booked in H2 never land on a channel that sold only in H1', () => {
  const h1 = period('2099-04', { b2bRev: 4_000_000, cf: 0, sm: 0, pf: 0, cogm: 3_000_000 });
  const h2 = period('2099-10', { b2bRev: 0, cf: 900_000, sm: 0, pf: 0, cogm: 1_000_000 });
  (h2 as { netByChannel: Record<string, number> }).netByChannel.B2B = 0;
  const year = { ...(period('FY', { b2bRev: 4_000_000, cf: 900_000, sm: 0, pf: 0, cogm: 4_000_000 }) as object), members: ['2099-04', '2099-10'], memberAggs: [h1, h2] } as never;
  const c = [...cells('2099-04', 4_000_000), ...cells('2099-10', 1)];
  const rows = anchoredChannelPnl(year, c, {});
  const months = [h1, h2].map((m) => anchoredChannelPnl(m, c, {}));
  for (const ch of ['D2C', 'Amazon', 'B2B', 'GT']) for (const k of ['cogm', 'channelFulfillment', 'cm2', 'netIncome'] as const) {
    near(rows.find((r) => r.channel === ch)![k], sum(months.map((ms) => ms.find((r) => r.channel === ch)?.[k] ?? 0)), `${ch} ${k}`);
  }
  assert.equal(rows.find((r) => r.channel === 'B2B')!.channelFulfillment, 0);
});

// ---- Through the real deck --------------------------------------------------
const L = (name: string, amount: number) => ({ name, depth: 1, amount });
const fact = (m: string, o: Record<string, unknown>) => ({ date: `${m}-15`, revenue: 0, units: 0, orders: 0, fees: 0, ...o });
function deck() {
  const m = '2026-08';
  const facts = [
    fact(m, { source: 'amazon', channel: 'Amazon', sku: 'BP-E09Z-J064', skuName: 'x', revenue: 700_000, units: 500, fees: 150_000 }),
    fact(m, { source: 'amazonads', channel: 'Amazon', spend: 300_000 }),
    fact(m, { source: 'meta', channel: 'D2C', spend: 400_000 }),
    fact(m, { source: 'shiprocket', channel: 'D2C', fees: 60_000 }),
    fact(m, { source: 'tranzactgt', channel: 'GT', sku: 'FG-0040', skuName: 'x', revenue: 500_000, units: 900 }),
    fact(m, { source: 'tranzactb2b', channel: 'B2B', sku: 'FG-0040', skuName: 'x', revenue: 2_400_000, units: 6_500 }),
  ];
  const rows = [L('D2C Sales', 300_000), L('Ecommerce Sales', 700_000), L('OEM Sales', 4_800_000), L('Offline Sales', 500_000),
    L('Opening Stock', 1_000_000), L('Raw Material Purchases', 2_800_000), L('Closing Stock', 1_000_000), L('Factory Overheads', 400_000),
    L('Admin & General Expenses', 20_000), L('Employee Cost - Indirect', 200_000), L('Channel Fees & Commissions', 400_000),
    L('Sales & Marketing', 900_000), L('Operations Platform Subscriptions', 18_000)];
  const bom = { connectorId: 'production', slotId: 'bom', periodKey: m, payload: { bomCosts: ['FG-0016', 'FG-0006', 'FG-0004', 'FG-0040'].map((fgId) => ({ fgId, bomNumber: '1', bomName: fgId, costPerUnit: 200 })) } };
  return unifyChannels(buildLiveDeck([{ connectorId: 'upl', slotId: 'facts', periodKey: m, payload: { facts } },
    { connectorId: 'tally', slotId: 'pnl', periodKey: m, payload: { ledgerRows: rows, nettProfit: 0 } }, bom] as never,
  [fact(m, { source: 'shopify', channel: 'D2C', sku: 'HCORE-KNEE', skuName: 'x', revenue: 300_000, units: 150 }),
    fact(m, { source: 'shopflo', channel: 'D2C', fees: 18_000 })] as never, {}));
}

test('MIS Sheet channel view = the Channels tab row (one method), B2B GM is its own', () => {
  const d = deck();
  const p = aggregatePeriods(d.months, d.completeness, 'month').find((x) => x.key === '2026-08')!;
  const row = anchoredChannelPnl(p, d.skuCells, d.completeness).find((r) => r.channel === 'B2B')!;
  const pt = liveMisPoint(p, 'B2B', d.skuCells, d.completeness);
  near(pt.cogs!, row.cogm); near(pt.logistics!, row.channelFulfillment); near(pt.cm2!, row.cm2);
  assert.equal(pt.logistics, 0); assert.equal(pt.marketing, 0);
  assert.ok(Math.abs(pt.grossMargin! / pt.netRevenue! - p.grossMargin / p.netRevenue) > 0.01, 'not the company GM %');
});

test('Shopflo / platform subscriptions land on Platform & Payment (D2C), not opex', () => {
  assert.equal(lookupLedger({ name: 'Operations Platform Subscriptions', path: [] } as never, {}).lineKey, 'pf_platform');
  const d = deck();
  const p = aggregatePeriods(d.months, d.completeness, 'month').find((x) => x.key === '2026-08')!;
  near(p.platformCosts, 18_000, 'P&P');
  const by = Object.fromEntries(anchoredChannelPnl(p, d.skuCells, d.completeness).map((r) => [r.channel, r]));
  near(by.D2C.platformCosts, 18_000); assert.equal(by.B2B.platformCosts, 0);
});

test('legacy channelPnl: no "leftover → Blinkit", fees not on OEM / Offline', () => {
  const p = { key: '2025-07', netRevenue: 1000, netByChannel: { D2C: 200, Amazon: 300, Blinkit: 100, OEM: 300, Offline: 100 },
    cogm: 400, channelFulfillment: 100, salesMarketing: 250, platformCosts: 10, opex: 50, nonOperating: 0 } as never;
  const rows = Object.fromEntries(channelPnl(p, { d2c: 50, amazon: 50 }).map((r) => [r.channel, r]));
  assert.ok(rows.Blinkit.salesMarketing < 150 / 2, `Blinkit S&M ${rows.Blinkit.salesMarketing} is its ad share, not the leftover`);
  assert.equal(rows.OEM.salesMarketing, 0); assert.equal(rows.OEM.channelFulfillment, 0); assert.equal(rows.Offline.channelFulfillment, 0);
  near(sum(Object.values(rows).map((r) => r.channelFulfillment)), 100); near(sum(Object.values(rows).map((r) => r.salesMarketing)), 250);
});

test('SKU × channel cells foot to the Channel P&L (fees capped, ads out of fees, conversion + not-mapped sales allocated)', () => {
  const out = footChannelCells([
    { m: '2099-01', ch: 'Amazon', p: 'A', rev: 600, cogs: 100, oth: 400, con: 0, u: 1 },   // published cell: ads inside fees
    { m: '2099-01', ch: 'Amazon', p: 'B', rev: 200, cogs: 50, oth: 100, con: 0, u: 1, noCost: false },
  ], { revenue: 1000, cogm: 400, channelFulfillment: 200, salesMarketing: 150 }, '2099-01', 'Amazon');
  near(sum(out.map((c) => c.rev)), 1000); near(sum(out.map((c) => c.cogs + (c.fac ?? 0))), 400);
  near(sum(out.map((c) => c.oth)), 200); near(sum(out.map((c) => c.ad ?? 0)), 150);
  near(sum(out.map((c) => c.con)), 1000 - 400 - 200 - 150);
  assert.ok(out.some((c) => c.p === NOT_MAPPED && Math.abs(c.rev - 200) < 1));
  assert.ok(out.every((c) => c.footed));
  // through the deck: every channel column = its Channel P&L CM2
  const d = deck();
  const months = aggregatePeriods(d.months, d.completeness, 'month').filter((x) => x.key === '2026-08');
  const keys = new Set(['2026-08']);
  const mx = liveSkuChannelMatrix(footCellsToChannels(d.skuCells, months, d.completeness), keys);
  for (const r of anchoredChannelPnl(months[0], d.skuCells, d.completeness)) near(mx.channelTotal(r.channel).con, r.cm2, `${r.channel} CM2`);
  near(mx.grand.con, months[0].cm2, 'Σ = company CM2');
});
