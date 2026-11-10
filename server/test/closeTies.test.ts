// Month close: manual lock, ties to Tally, per-month BOM, Tally factory overhead, channel P&L on Tally ledgers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLockRequest, LockError } from '../src/ingest/closeLocks.js';
import { shopifyLineSales } from '../src/connectors/sources/shopify.js';
import { buildCloseTie, connectorSales } from '../../client/src/data/misDeck/closeTies.ts';
import { buildLiveDeck, pickBom, swapAlternates } from '../../client/src/data/misDeck/liveDeck.ts';
import { aggregatePeriods, slicePnl } from '../../client/src/data/misDeck/liveAnalytics.ts';
import { anchoredChannelPnl } from '../../client/src/data/misDeck/liveViews.ts';
import { toSalesChannel } from '../../client/src/data/misDeck/expenseTagging.ts';
import type { DailyFact } from '../../client/src/data/liveMis/facts.ts';

const actor = { by: 'hargun@heatronics.in', verified: true };
const empty = () => ({ locks: {}, audit: { entries: [] as never[] } });

// ---- lock store -------------------------------------------------------------

test('lock, audit, unlock', () => {
  const e = empty();
  const a = applyLockRequest({ locks: e.locks }, e.audit, '2026-10', { action: 'lock', worstResidualPct: 0.4 }, actor, new Date('2026-11-03T10:00:00Z'));
  assert.equal(a.lock!.lockedBy, actor.by);
  assert.equal(a.lock!.lockedAt, '2026-11-03T10:00:00.000Z');
  assert.equal(a.audit.entries.length, 1);
  assert.throws(() => applyLockRequest(a.store, a.audit, '2026-10', { action: 'lock' }, actor), (x: unknown) => x instanceof LockError && x.status === 409);
  const b = applyLockRequest(a.store, a.audit, '2026-10', { action: 'unlock', reason: 'late credit note' }, actor);
  assert.deepEqual(b.store.locks, {});
  assert.deepEqual(b.audit.entries.map((x) => x.action), ['lock', 'unlock']);
  assert.throws(() => applyLockRequest(b.store, b.audit, '2026-10', { action: 'unlock' }, actor), LockError);
});

test('a lock over 1% of revenue needs a reason, which is kept', () => {
  const e = empty();
  assert.throws(() => applyLockRequest({ locks: e.locks }, e.audit, '2026-10', { action: 'lock', worstResidualPct: 2.5 }, actor), (x: unknown) => x instanceof LockError && x.status === 422);
  const ok = applyLockRequest({ locks: e.locks }, e.audit, '2026-10', { action: 'lock', worstResidualPct: 2.5, overrideReason: 'Flipkart settles next month' }, actor);
  assert.equal(ok.lock!.overrideReason, 'Flipkart settles next month');
  assert.equal(ok.audit.entries[0].overrideReason, 'Flipkart settles next month');
  assert.throws(() => applyLockRequest({ locks: {} }, e.audit, '2026-13', { action: 'lock' }, actor), LockError);
});

// ---- GMV vs ex-GST ----------------------------------------------------------

test('Shopify line: tax-inclusive price splits GST out; tax-on-top adds it', () => {
  const li = { price: '1180', quantity: 1, total_discount: '0', tax_lines: [{ price: '180' }] };
  assert.deepEqual(shopifyLineSales({ taxes_included: true }, li), { revenue: 1180, gmv: 1180, netExGst: 1000 });
  assert.deepEqual(shopifyLineSales({ taxes_included: false }, li), { revenue: 1180, gmv: 1360, netExGst: 1180 });
});

const f = (o: Partial<DailyFact>): DailyFact => ({ source: 'shopify', channel: 'D2C', date: '2026-10-05', revenue: 0, units: 0, orders: 0, fees: 0, ...o });

test('connector sales: reported ex-GST, estimated from GMV, or as booked', () => {
  const s = connectorSales([
    f({ revenue: 1180, gmv: 1180, netExGst: 1000 }),
    f({ source: 'amazon', channel: 'Amazon', revenue: 1180, gmv: 1180 }),
    f({ source: 'amazon', channel: 'Amazon', date: '2026-10-06', revenue: 500 }),
    f({ source: 'tranzactb2b', channel: 'B2B', revenue: 700 }),
    f({ source: 'meta', channel: 'Meta Ads', revenue: 0, spend: 50 }),
  ]);
  assert.equal(s.get('D2C')!.net, 1000);
  assert.equal(s.get('D2C')!.haveGmv, true);
  assert.equal(Math.round(s.get('Amazon')!.net), 1624); // 1180/1.05 (product GST 5%) + 500 as booked
  assert.ok(s.get('Amazon')!.basis.has('estimated'));
  assert.equal(s.get('B2B')!.net, 700);
  assert.equal(s.size, 3);
});

test('Meta / Google / Amazon Ads labels map to their sales channel', () => {
  assert.equal(toSalesChannel('Meta Ads'), 'D2C');
  assert.equal(toSalesChannel('Google Ads'), 'D2C');
  assert.equal(toSalesChannel('Amazon Ads'), 'Amazon');
});

// ---- tie ---------------------------------------------------------------------

test('tie: residuals per channel and profit, breach over 1% of revenue', () => {
  const tie = buildCloseTie({
    periodKey: '2026-10', netRevenue: 1_500_000, netByChannel: { Amazon: 1_000_000, D2C: 500_000, OEM: 20_000 },
    tallyNett: 100_000, misProfit: 100_500, profitResidual: 500,
    facts: [f({ source: 'amazon', channel: 'Amazon', revenue: 990_000 }), f({ revenue: 500_000, netExGst: 470_000, gmv: 500_000 })],
  });
  const amz = tie.channels.find((c) => c.channel === 'Amazon')!;
  assert.equal(amz.residual, 10_000);
  assert.equal(tie.channels.find((c) => c.channel === 'D2C')!.residual, 30_000);
  assert.equal(tie.channels.find((c) => c.channel === 'OEM')!.residual, null); // no connector: shown, not judged
  assert.equal(tie.breach, true);                    // D2C 2% of revenue
  assert.match(tie.breaches[0], /D2C sales vs Tally: 2\.0%/);
  assert.equal(tie.worstResidualPct, 2);
  const ok = buildCloseTie({ periodKey: '2026-10', netRevenue: 1_000_000, netByChannel: { Amazon: 1_000_000 }, tallyNett: 5, misProfit: 5, profitResidual: 0, facts: [f({ source: 'amazon', channel: 'Amazon', revenue: 995_000 })] });
  assert.equal(ok.breach, false);
});

// ---- the deck -----------------------------------------------------------------

const rows = (sales: number) => [
  { name: 'Amazon Sales', depth: 1, amount: sales }, { name: 'D2C Sales', depth: 1, amount: sales / 2 },
  { name: 'Raw Material Purchases', depth: 1, amount: 300_000 }, { name: 'Factory Overheads', depth: 1, amount: 80_000 },
  { name: 'Channel Fees & Commissions', depth: 1, amount: 100_000 },
];
const tally = (pk: string, sales: number, nett: number | null = null) =>
  ({ connectorId: 'tally', slotId: 'pnl', periodKey: pk, payload: { ledgerRows: sales ? rows(sales) : [{ name: 'Raw Material Purchases', depth: 1, amount: 1000 }], nettProfit: nett } });

test('only a locked month is closed; ready until then; a hole stops the floor', () => {
  const reports = [tally('2026-08', 1_000_000), tally('2026-09', 1_000_000), tally('2026-10', 1_000_000)];
  const open = buildLiveDeck(reports, [], {});
  assert.equal(open.completeness['2026-10'].level, 'full');
  assert.equal(open.completeness['2026-10'].ready, true);
  assert.equal(open.completeness['2026-10'].closed, false);
  assert.equal(open.completeThrough, '2026-03'); // frozen history only; full Tally months are not "closed"
  const lock = (periodKey: string) => ({ periodKey, lockedAt: '2026-11-03T00:00:00Z', lockedBy: 'h' });
  // Locking Oct without the months between leaves a hole.
  assert.equal(buildLiveDeck(reports, [], { locks: { '2026-10': lock('2026-10') } }).completeThrough, '2026-03');
  // Lock every month from Apr to Oct (the published months fill the gap) → floor moves.
  const locks: Record<string, ReturnType<typeof lock>> = {};
  for (const k of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) locks[k] = lock(k);
  const all = buildLiveDeck(reports, [], { locks });
  assert.equal(all.completeThrough, '2026-10');
  assert.equal(all.completeness['2026-10'].closed, true);
  assert.equal(all.completeness['2026-10'].ready, false);
  assert.equal(swapAlternates(all).completeThrough, '2026-10');
  assert.equal(aggregatePeriods(all.months, all.completeness, 'month').find((p) => p.key === '2026-10')!.closed, true);
});

test('a Tally P&L with no sales is not a full close', () => {
  const d = buildLiveDeck([tally('2026-10', 0)], [], {});
  assert.notEqual(d.completeness['2026-10'].level, 'full');
  assert.equal(d.completeness['2026-10'].ready, false);
});

test('factory overhead is Tally actual when booked, 10% fallback is labelled', () => {
  const d = buildLiveDeck([tally('2026-10', 1_000_000)], [], {});
  const m = d.months.find((x) => x.key === '2026-10')!;
  assert.equal(m.factory, 80_000);
  assert.equal(m.factoryBasis, 'tally');
  assert.equal(d.completeness['2026-10'].factoryBasis, 'tally');
  const p = aggregatePeriods(d.months, d.completeness, 'month').find((x) => x.key === '2026-10')!;
  assert.equal(p.factory, 80_000);
  assert.equal(p.factoryBasis, 'tally');
  const noFactory = { ...tally('2026-10', 1_000_000), payload: { ledgerRows: rows(1_000_000).filter((r) => r.name !== 'Factory Overheads'), nettProfit: null } };
  const d2 = buildLiveDeck([noFactory], [], {});
  assert.equal(d2.months.find((x) => x.key === '2026-10')!.factoryBasis, 'assumed');
  assert.equal(d2.months.find((x) => x.key === '2026-10')!.factory, 150_000);
  // A live partial month (no Tally) is the labelled 10% too.
  const d3 = buildLiveDeck([], [f({ source: 'amazon', channel: 'Amazon', date: '2026-11-02', revenue: 1000 })], {});
  assert.equal(d3.completeness['2026-11'].factoryBasis, 'assumed');
});

test('slice P&L factory = the cells\' Tally share', () => {
  const sku = (u: number) => ({ connectorId: 'shopify', slotId: 'x', periodKey: '2026-10', payload: { facts: [f({ sku: 'FG-1', skuName: 'hCore Neck', revenue: 1000, units: u })] } });
  const d = buildLiveDeck([tally('2026-10', 1_000_000), sku(2)], [], {});
  const per = aggregatePeriods(d.months, d.completeness, 'month').find((x) => x.key === '2026-10')!;
  const s = slicePnl(per, d.skuCells, new Set(['2026-10']), 'channel');
  assert.equal(s.total.factory, 80_000);
  for (const c of d.skuCells.filter((x) => x.m === '2026-10')) assert.ok(c.fac !== undefined);
});

// ---- BOM per month --------------------------------------------------------------

test('BOM: the month\'s own, else the nearest month — labelled', () => {
  const bom = (pk: string, cost: number) => ({ connectorId: 'production', slotId: 'bom', periodKey: pk, payload: { bomCosts: [{ fgId: 'FG-1', bomNumber: '1', bomName: 'x', costPerUnit: cost }] } });
  const all = [bom('2026-08', 100), bom('2026-10', 120)];
  const own = pickBom(all as never, '2026-10');
  assert.equal(own.info!.exact, true);
  assert.equal(own.reports[0].periodKey, '2026-10');
  const near = pickBom(all as never, '2026-11');
  assert.equal(near.reports[0].periodKey, '2026-10');
  assert.equal(near.info!.exact, false);
  assert.match(near.info!.note, /No BOM for Nov 2026.*Oct 2026/);
  assert.equal(pickBom(all as never, '2026-09').reports[0].periodKey, '2026-08'); // tie → the earlier month
  assert.equal(pickBom([], '2026-10').info, null);
});

// ---- channel P&L on Tally ledgers -----------------------------------------------

test('channel P&L takes revenue from Tally channel ledgers and still foots to the company', () => {
  const d = buildLiveDeck([tally('2026-10', 1_000_000, 0)], [
    f({ source: 'amazon', channel: 'Amazon', date: '2026-10-03', sku: 'AB', skuName: 'x', revenue: 600_000, fees: 60_000 }),
    f({ source: 'amazon', channel: 'Amazon', date: '2026-10-03', fees: 20_000 }),
  ], {});
  const per = aggregatePeriods(d.months, d.completeness, 'month').find((x) => x.key === '2026-10')!;
  const rowsOut = anchoredChannelPnl(per, d.skuCells, d.completeness);
  assert.ok(rowsOut.every((r) => r.basis === 'tally'));
  const amz = rowsOut.find((r) => r.channel === 'Amazon')!;
  const d2c = rowsOut.find((r) => r.channel === 'D2C')!;
  assert.equal(amz.revenue, 1_000_000);   // Tally's Amazon ledger, not an order-share split of the SKU cells
  assert.equal(d2c.revenue, 500_000);
  const sum = (k: 'channelFulfillment' | 'netIncome' | 'revenue') => rowsOut.reduce((s, r) => s + r[k], 0);
  assert.ok(Math.abs(sum('revenue') - per.netRevenue) < 0.01);
  assert.ok(Math.abs(sum('channelFulfillment') - per.channelFulfillment) < 0.01);
  assert.ok(Math.abs(sum('netIncome') - per.netIncome) < 0.01);
  // Amazon carries the connector-attributed channel fees; D2C only its share of the unattributed rest.
  assert.ok(amz.channelFulfillment > d2c.channelFulfillment * 2);
});
