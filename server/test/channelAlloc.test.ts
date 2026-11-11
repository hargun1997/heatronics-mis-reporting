// Channel P&L cost allocation (client/src/data/misDeck/channelAlloc.ts + tallyAnchoredRows). Synthetic months only.
//   1. Marketing sits where it was spent; the rest of Tally's S&M goes to the consumer channels only (never B2B / GT).
//   2. Reports above Tally's line are capped at Tally's total (nothing negative lands on other channels) + a Fix item.
//   3. Σ channels = the company P&L, line by line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateMarketing, capTallyLines, capToTotal, overAttributions, spreadWithCap } from '../../client/src/data/misDeck/channelAlloc.ts';
import { buildLiveDeck } from '../../client/src/data/misDeck/liveDeck.ts';
import { aggregatePeriods } from '../../client/src/data/misDeck/liveAnalytics.ts';
import { anchoredChannelPnl, tallyAnchoredRows, unifyChannels } from '../../client/src/data/misDeck/liveViews.ts';
import { channelAdWeight } from '../../client/src/data/misDeck/analytics.ts';
import { deckItems } from '../../client/src/data/issues/inbox.ts';

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1, `${msg ?? ''} ${a} vs ${b}`);
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

test('capToTotal: scales pro rata to the booked total, reports the excess', () => {
  const { values, excess } = capToTotal([60, 260, 0], 160);
  near(sum(values), 160); near(excess, 160);
  near(values[1] / values[0], 260 / 60);
  assert.deepEqual(capToTotal([10, 20], 100), { values: [10, 20], excess: 0 });
  near(sum(capToTotal([10, 20], -5).values), 0, 'a credit line takes no attributed cost');
});

test('spreadWithCap: a negative rest is never spread', () => {
  const out = spreadWithCap(100, [150, 50, 0, 0], (i) => [0.1, 0.1, 0.3, 0.5][i]);
  near(sum(out), 100); assert.equal(out[2], 0); assert.equal(out[3], 0);
  near(sum(spreadWithCap(100, [20, 0], (i) => [0.5, 0.5][i])), 100);
});

test('allocateMarketing: rest follows consumer ad spend, never B2B / GT', () => {
  const ch = ['D2C', 'Amazon', 'GT', 'B2B'] as const;
  const a = allocateMarketing(ch, 1000, [300, 100, 0, 0], [100, 100, 500, 5000]);
  assert.equal(a.basis, 'spend'); near(sum(a.values), 1000);
  near(a.values[0], 750); near(a.values[1], 250); assert.equal(a.values[2], 0); assert.equal(a.values[3], 0);
  // no ad-spend split → consumer channels by revenue, labelled estimated
  const e = allocateMarketing(ch, 1000, [0, 0, 0, 0], [100, 300, 500, 5000]);
  assert.equal(e.basis, 'estimated'); near(e.values[0], 250); near(e.values[1], 750); assert.equal(e.values[3], 0);
  // a rule / tag that puts spend on B2B is kept, but B2B gets none of the rest
  const r = allocateMarketing(ch, 1000, [300, 100, 0, 200], [1, 1, 1, 1]);
  near(r.values[3], 200); near(r.values[0], 300 + 400 * 0.75);
  // spend above the books: capped, still foots
  const o = allocateMarketing(ch, 300, [300, 100, 0, 0], [1, 1, 1, 1]);
  near(sum(o.values), 300); assert.equal(o.values[2], 0);
  // consumer channel with no Tally revenue: falls back to its connector sales, not to B2B
  const f = allocateMarketing(['D2C', 'B2B'], 500, [0, 0], [0, 9000], [100, 9000]);
  near(f.values[0], 500); assert.equal(f.values[1], 0);
});

test('capTallyLines: Σ byChannel + blended = total, over keeps what was cut', () => {
  const line = { lineKey: 'ff_channel_fees', label: 'Channel Fees & Commissions', bucket: 'fulfillment', cascadeLine: 'channel_fulfilment',
    total: -160_000, byChannel: { D2C: -60_000, Amazon: -260_000 }, blended: 160_000 } as never;
  const [c] = capTallyLines([line]);
  near((c.byChannel.D2C ?? 0) + (c.byChannel.Amazon ?? 0), -160_000); assert.equal(c.blended, 0);
  near((c.over?.D2C ?? 0) + (c.over?.Amazon ?? 0), 160_000);
  const ok = { ...(line as object), total: -400_000, blended: -80_000 } as never;
  assert.equal(capTallyLines([ok])[0], ok, 'a line within the books is untouched');
  const o = overAttributions([{ key: '2026-09', tallyLines: [c] }]);
  assert.equal(o.length, 1); assert.equal(o[0].channel, 'Amazon'); near(o[0].excess, 160_000); near(o[0].tally, 160_000); near(o[0].reported, 320_000);
});

// ---- A synthetic live month through the real deck ---------------------------
const L = (name: string, amount: number) => ({ name, depth: 1, amount });
const fact = (m: string, o: Record<string, unknown>) => ({ date: `${m}-15`, revenue: 0, units: 0, orders: 0, fees: 0, ...o });
function month(m: string, o: { tallyFees: number; amazonFees: number; tallySm: number; amazonAds: number; meta: number }) {
  const facts = [
    fact(m, { source: 'amazon', channel: 'Amazon', sku: 'BP-E09Z-J064', skuName: 'x', revenue: 700_000, units: 500, fees: o.amazonFees }),
    fact(m, { source: 'amazonads', channel: 'Amazon', spend: o.amazonAds }),
    fact(m, { source: 'meta', channel: 'D2C', spend: o.meta }),
    fact(m, { source: 'shiprocket', channel: 'D2C', fees: 60_000 }),
    fact(m, { source: 'tranzactgt', channel: 'GT', sku: 'FG-0040', skuName: 'x', revenue: 500_000, units: 900 }),
    fact(m, { source: 'tranzactb2b', channel: 'B2B', sku: 'FG-0040', skuName: 'x', revenue: 4_800_000, units: 13_000 }),
  ];
  const rows = [L('D2C Sales', 200_000), L('Ecommerce Sales', 700_000), L('OEM Sales', 4_800_000), L('Offline Sales', 500_000),
    L('Opening Stock', 1_000_000), L('Raw Material Purchases', 2_800_000), L('Closing Stock', 1_000_000), L('Factory Overheads', 400_000),
    L('Admin & General Expenses', 20_000), L('Employee Cost - Indirect', 200_000),
    L('Channel Fees & Commissions', o.tallyFees), L('Sales & Marketing', o.tallySm)];
  return {
    reports: [{ connectorId: 'upl', slotId: 'facts', periodKey: m, payload: { facts } },
      { connectorId: 'tally', slotId: 'pnl', periodKey: m, payload: { ledgerRows: rows, nettProfit: 0 } }],
    live: [fact(m, { source: 'shopify', channel: 'D2C', sku: 'HCORE-KNEE', skuName: 'x', revenue: 300_000, units: 150 })],
  };
}
const bom = { connectorId: 'production', slotId: 'bom', periodKey: '2026-09', payload: { bomCosts: ['FG-0016', 'FG-0006', 'FG-0004', 'FG-0040'].map((fgId) => ({ fgId, bomNumber: '1', bomName: fgId, costPerUnit: 200 })) } };
function build(...ms: ReturnType<typeof month>[]) {
  return unifyChannels(buildLiveDeck([...ms.flatMap((x) => x.reports), bom] as never, ms.flatMap((x) => x.live) as never, {}));
}
const LINES = ['revenue', 'cogm', 'grossMargin', 'channelFulfillment', 'cm1', 'salesMarketing', 'cm2', 'platformCosts', 'cm3', 'opex', 'ebitda', 'nonOperating', 'costOfFundraising', 'netIncome'] as const;
const COMPANY: Record<(typeof LINES)[number], string> = { revenue: 'netRevenue', cogm: 'cogm', grossMargin: 'grossMargin', channelFulfillment: 'channelFulfillment', cm1: 'cm1',
  salesMarketing: 'salesMarketing', cm2: 'cm2', platformCosts: 'platformCosts', cm3: 'cm3', opex: 'opex', ebitda: 'ebitda', nonOperating: 'nonOperating', costOfFundraising: 'costOfFundraising', netIncome: 'netIncome' };
function foots(rows: ReturnType<typeof anchoredChannelPnl>, p: Record<string, unknown>) {
  for (const k of LINES) near(sum(rows.map((r) => r[k])), p[COMPANY[k]] as number, `Σ channels = company for ${k}:`);
}

test('live month: B2B / GT marketing = 0, ads on their channel, every line foots', () => {
  const deck = build(month('2026-08', { tallyFees: 400_000, amazonFees: 180_000, tallySm: 1_600_000, amazonAds: 650_000, meta: 630_000 }));
  const p = aggregatePeriods(deck.months, deck.completeness, 'month').find((x) => x.key === '2026-08')!;
  assert.ok(p.hasTally);
  const rows = anchoredChannelPnl(p, deck.skuCells, deck.completeness);
  const by = Object.fromEntries(rows.map((r) => [r.channel, r]));
  assert.equal(by.B2B.salesMarketing, 0); assert.equal(by.GT.salesMarketing, 0);
  // rest 3,20,000 by ad spend: Amazon 650 / 1280, D2C 630 / 1280
  near(by.Amazon.salesMarketing, 650_000 + 320_000 * 650 / 1280); near(by.D2C.salesMarketing, 630_000 + 320_000 * 630 / 1280);
  assert.equal(by.Amazon.basis, 'tally');
  foots(rows, p as never);
  assert.equal(deckItems(deck as never).filter((i) => i.id.startsWith('over:')).length, 0);
});

test('Sep-style overshoot: Amazon fees above Tally are capped, nothing negative on B2B / GT, Fix item raised', () => {
  const deck = build(month('2026-09', { tallyFees: 160_000, amazonFees: 260_000, tallySm: 900_000, amazonAds: 560_000, meta: 250_000 }));
  const p = aggregatePeriods(deck.months, deck.completeness, 'month').find((x) => x.key === '2026-09')!;
  const rows = tallyAnchoredRows(p, deck.skuCells, deck.completeness);
  const by = Object.fromEntries(rows.map((r) => [r.channel, r]));
  assert.equal(by.B2B.channelFulfillment, 0); assert.equal(by.GT.channelFulfillment, 0);
  near(by.Amazon.channelFulfillment, 160_000 * 260 / 320); near(by.D2C.channelFulfillment, 160_000 * 60 / 320);
  for (const r of rows) assert.ok(r.channelFulfillment >= 0 && r.salesMarketing >= 0, `${r.channel} has no negative cost`);
  foots(rows, p as never);
  const item = deckItems(deck as never).find((i) => i.id === 'over:2026-09:ff_channel_fees')!;
  assert.ok(item, 'Fix item');
  assert.match(item.title, /Amazon fees in the report exceed Tally by ₹1,60,000: check the books/);
  assert.equal(item.severity, 'high');
});

test('two months together: one month\'s overshoot is not hidden by the other, and the period still foots', () => {
  const deck = build(month('2026-08', { tallyFees: 400_000, amazonFees: 180_000, tallySm: 1_600_000, amazonAds: 650_000, meta: 630_000 }),
    month('2026-09', { tallyFees: 160_000, amazonFees: 260_000, tallySm: 900_000, amazonAds: 560_000, meta: 250_000 }));
  const q = aggregatePeriods(deck.months, deck.completeness, 'quarter').find((x) => x.members.includes('2026-09'))!;
  const rows = anchoredChannelPnl(q, deck.skuCells, deck.completeness);
  const by = Object.fromEntries(rows.map((r) => [r.channel, r]));
  foots(rows, q as never);
  assert.equal(by.B2B.salesMarketing, 0);
  // Amazon fees: Aug 1,80,000 as reported + Sep capped at 1,30,000 (+ its share of Aug's unattributed rest, which goes to
  // the consumer channels only: Amazon 7 of the 9 lakh consumer revenue). The quarter is Σ months, never split once.
  const augRest = 400_000 - (180_000 + 60_000);
  const mon = (k: string) => Object.fromEntries(anchoredChannelPnl(aggregatePeriods(deck.months, deck.completeness, 'month').find((x) => x.key === k)!, deck.skuCells, deck.completeness).map((r) => [r.channel, r]));
  near(mon('2026-08').Amazon.channelFulfillment, 180_000 + augRest * 7 / 9);
  near(mon('2026-09').Amazon.channelFulfillment, 130_000);
  near(by.Amazon.channelFulfillment, q.members.reduce((t, k) => t + (mon(k).Amazon?.channelFulfillment ?? 0), 0), 'quarter = Σ months');
  assert.equal(by.B2B.channelFulfillment, 0); assert.equal(by.GT.channelFulfillment, 0);
});

test('legacy months: marketing follows the published ad feeds; B2B / GT carry none', () => {
  const deck = unifyChannels(buildLiveDeck([], [], {}));
  for (const p of aggregatePeriods(deck.months, deck.completeness, 'year')) {
    const rows = anchoredChannelPnl(p, deck.skuCells, deck.completeness);
    if (!rows.length) continue;
    // Cost lines foot. (Legacy channel REVENUE is gross of GST in the published data, a separate audit item, so margins are not checked here.)
    for (const k of ['cogm', 'channelFulfillment', 'salesMarketing', 'platformCosts', 'opex'] as const) near(sum(rows.map((r) => r[k])), (p as never)[k], `${p.key} ${k}`);
    if (!rows.some((r) => ['D2C', 'Amazon', 'Flipkart', 'Blinkit'].includes(r.channel))) {   // a year with no consumer channel at all
      assert.ok(rows.every((r) => r.basis === 'estimated'), `${p.key} is labelled estimated`);
      continue;
    }
    for (const r of rows) if (['B2B', 'GT', 'OEM', 'Offline', 'Export'].includes(r.channel)) assert.equal(r.salesMarketing, 0, `${p.key} ${r.channel}`);
  }
});

test('legacy month with no platform split: consumer channels by revenue, basis estimated', () => {
  const period = { members: ['2099-01'], hasTally: true, netRevenue: 1000, netByChannel: { D2C: 100, Amazon: 300, B2B: 600 }, tallyLines: [],
    cogm: 400, grossMargin: 600, channelFulfillment: 50, cm1: 550, salesMarketing: 200, cm2: 350, platformCosts: 10, cm3: 340, opex: 40, ebitda: 300,
    nonOperating: 5, costOfFundraising: 0, netIncome: 295 } as never;
  const rows = anchoredChannelPnl(period, [], { '2099-01': { locked: true } } as never);
  const by = Object.fromEntries(rows.map((r) => [r.channel, r]));
  near(by.D2C.salesMarketing, 50); near(by.Amazon.salesMarketing, 150); assert.equal(by.B2B.salesMarketing, 0);
  assert.ok(rows.every((r) => r.basis === 'estimated'));
  foots(rows, period);
});

test('locked month with connector ads AND published feeds: the spend is counted once', () => {
  const deck = build(month('2026-08', { tallyFees: 400_000, amazonFees: 180_000, tallySm: 1_600_000, amazonAds: 650_000, meta: 630_000 }));
  const p = aggregatePeriods(deck.months, deck.completeness, 'month').find((x) => x.key === '2026-08')!;
  const open = Object.fromEntries(tallyAnchoredRows(p, deck.skuCells, deck.completeness).map((r) => [r.channel, r]));
  const lockedComp = { ...deck.completeness, '2026-08': { ...deck.completeness['2026-08'], locked: true } };
  const rows = tallyAnchoredRows(p, deck.skuCells, lockedComp as never);
  const by = Object.fromEntries(rows.map((r) => [r.channel, r]));
  foots(rows, p as never);
  assert.equal(by.B2B.salesMarketing, 0); assert.equal(by.GT.salesMarketing, 0);
  // ad spend before the rest is spread can only grow to the larger of the two sources, so Amazon + D2C never exceed Tally's line
  near(by.Amazon.salesMarketing + by.D2C.salesMarketing, 1_600_000);
  assert.ok(by.Amazon.salesMarketing > 0 && open.Amazon.salesMarketing > 0);
});

test('mixed period: a feed-only locked month + a tags-only live month keep BOTH months\' ad spend (per month, per channel)', () => {
  const pubAmz = channelAdWeight('Amazon', ['2025-10']); const pubD2c = channelAdWeight('D2C', ['2025-10']);
  assert.ok(pubAmz > 0 && pubD2c > 0, 'published feeds exist for Oct 25');
  const tagAmz = 900_000, tagD2c = 300_000;
  const total = pubAmz + pubD2c + tagAmz + tagD2c;              // rest = 0, so each channel's S&M = its recognised ad spend
  const period = { members: ['2025-10', '2025-11'], hasTally: true, netRevenue: 10_000_000,
    netByChannel: { D2C: 2_000_000, Amazon: 3_000_000, B2B: 5_000_000 },
    tallyLines: [{ lineKey: 'sm', label: 'Sales & Marketing', bucket: 'sm', cascadeLine: 'sales_marketing', total: -total,
      byChannel: { Amazon: -tagAmz, D2C: -tagD2c }, blended: -(total - tagAmz - tagD2c) }],
    smTagsByMonth: { '2025-11': { Amazon: tagAmz, D2C: tagD2c } },
    cogm: 0, grossMargin: 10_000_000, channelFulfillment: 0, cm1: 10_000_000, salesMarketing: total, cm2: 10_000_000 - total,
    platformCosts: 0, cm3: 10_000_000 - total, opex: 0, ebitda: 10_000_000 - total, nonOperating: 0, costOfFundraising: 0, netIncome: 10_000_000 - total } as never;
  const rows = tallyAnchoredRows(period, [], { '2025-10': { locked: true } } as never);
  const by = Object.fromEntries(rows.map((r) => [r.channel, r]));
  near(by.Amazon.salesMarketing, pubAmz + tagAmz); near(by.D2C.salesMarketing, pubD2c + tagD2c); assert.equal(by.B2B.salesMarketing, 0);
  near(sum(rows.map((r) => r.salesMarketing)), total);
});
