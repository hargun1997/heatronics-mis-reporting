// Month completeness (audit 10 Nov 2026): a stock-only Tally copy never beats connector sales, a half-booked Tally month is
// "Tally incomplete", and "ready to lock" needs full Tally + tie + closing stock posted + reports in. Synthetic data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveDeck } from '../../client/src/data/misDeck/liveDeck.ts';
import { DEFAULT_GST_RATE, GST_RATE_BY_SOURCE, exGstOf, toExGstFact } from '../../client/src/data/misDeck/gstBasis.ts';
import { channelNoData, closeBlockers, missingChannels, slotGaps, stockNotPosted, tallyGaps, tallyHasSalesLedger } from '../../client/src/data/misDeck/monthCompleteness.ts';
import { deckItems } from '../../client/src/data/issues/inbox.ts';
import { ASSUMED_GST_RATE as SERVER_GST_RATE } from '../src/connectors/tally/ceoSummaryLoad.ts';
import type { DailyFact } from '../../client/src/data/liveMis/facts.ts';

const f = (o: Partial<DailyFact>): DailyFact => ({ source: 'shopify', channel: 'D2C', date: '2026-10-05', revenue: 0, units: 0, orders: 0, fees: 0, ...o });
type Row = [string, number];
const tally = (pk: string, rows: Row[], nett: number | null = null) =>
  ({ connectorId: 'tally', slotId: 'pnl', periodKey: pk, payload: { ledgerRows: rows.map(([name, amount]) => ({ name, depth: 1, amount })), nettProfit: nett } });
const STOCK_ONLY: Row[] = [['Opening Stock', 500_000], ['Closing Stock', 500_000]];
const BOOKS = (o: { amazon?: number; d2c?: number; closing?: number } = {}): Row[] => [
  ...(o.amazon === 0 ? [] : [['Amazon Sales', o.amazon ?? 600_000] as Row]), ['D2C Sales', o.d2c ?? 300_000], ['OEM Sales', 100_000], ['Offline Sales', 50_000],
  ['Opening Stock', 500_000], ['Raw Material Purchases', 200_000], ['Closing Stock', o.closing ?? 450_000], ['Factory Overheads', 50_000],
];
const NOV = { thisMonth: '2026-11' };
const amz = (rev: number, pk = '2026-10') => f({ source: 'amazon', channel: 'Amazon', date: `${pk}-05`, revenue: rev });
const shop = (gmv: number, pk = '2026-10') => f({ date: `${pk}-05`, revenue: gmv, gmv, netExGst: Math.round(gmv / 1.05) });

// ---- GST basis ------------------------------------------------------------------

test('ex-GST: reported where the source splits tax, else GMV at the product rate (5%), else as booked', () => {
  assert.equal(DEFAULT_GST_RATE, 0.05);
  assert.deepEqual(exGstOf(f({ revenue: 1050, gmv: 1050, netExGst: 990 })), { net: 990, basis: 'reported' });
  assert.deepEqual(exGstOf(f({ source: 'amazon', revenue: 1050, gmv: 1050 })), { net: 1000, basis: 'estimated' });
  assert.deepEqual(exGstOf(f({ source: 'tranzactb2b', revenue: 700 })), { net: 700, basis: 'booked' });
  assert.equal(toExGstFact(f({ source: 'amazon', revenue: 1050, gmv: 1050 })).revenue, 1000);
  GST_RATE_BY_SOURCE.amazon = 0.18;
  try { assert.equal(Math.round(exGstOf(f({ source: 'amazon', revenue: 1180, gmv: 1180 })).net), 1000); } finally { delete GST_RATE_BY_SOURCE.amazon; }
});

// ---- rule 1: a stock-only Tally copy ----------------------------------------------

test('a Tally copy with only stock carry-forward does not override connector sales', () => {
  assert.equal(tallyHasSalesLedger({}), false);
  assert.equal(tallyHasSalesLedger({ D2C: -9558 }), true);
  const d = buildLiveDeck([tally('2026-11', STOCK_ONLY, 0)] as never, [
    f({ source: 'amazon', channel: 'Amazon', date: '2026-11-03', revenue: 105_000, gmv: 105_000, units: 70 }),
    f({ date: '2026-11-04', sku: 'X', skuName: 'x', revenue: 118_000, gmv: 118_000, netExGst: 112_381, units: 50 }),
  ], NOV);
  const m = d.months.find((x) => x.key === '2026-11')!;
  const c = d.completeness['2026-11'];
  assert.equal(c.hasTally, false);
  assert.notEqual(c.level, 'full');
  assert.match(c.tallyIgnored!, /no sales ledgers/);
  assert.equal(m.netByChannel.Amazon, 100_000, 'GMV ÷ 1.05, not ₹0 and not GST-inclusive');
  assert.equal(m.netByChannel.D2C, 112_381, 'Shopify as reported ex-GST');
  assert.equal(m.netRevenue, 212_381);
  assert.deepEqual(c.exGstEstimated, { sources: ['amazon'], ratePct: 5 });
  assert.equal(c.ready, false);
  assert.ok(!c.sources.includes('tally'));
  // With no connector sales the copy still drives the month (nothing better to show), but it is never a full close.
  const alone = buildLiveDeck([tally('2026-10', STOCK_ONLY, 0)] as never, [], NOV).completeness['2026-10'];
  assert.equal(alone.hasTally, true);
  assert.notEqual(alone.level, 'full');
  assert.equal(alone.ready, false);
});

// ---- rule 2: Tally incomplete -----------------------------------------------------

test('a channel the connectors sold on with no Tally sales ledger makes the month "Tally incomplete"', () => {
  const d = buildLiveDeck([tally('2026-10', BOOKS({ amazon: 0, d2c: -9_000 }))] as never, [amz(650_000), shop(315_000)], NOV);
  const c = d.completeness['2026-10'];
  assert.notEqual(c.level, 'full');
  assert.equal(c.ready, false);
  assert.deepEqual(c.tallyGaps!.map((g) => g.channel), ['Amazon', 'D2C']);
  assert.equal(c.tallyGaps![0].connector, 650_000);
  const texts = c.closeBlockers!.filter((b) => b.kind === 'tally-incomplete').map((b) => b.text);
  assert.match(texts[0], /^Amazon: ₹6,50,000 sold, Tally has no sales ledger\.$/);
  assert.match(texts[1], /^D2C: ₹3,00,000 sold, Tally has −₹9,000\.$/);
  assert.ok(c.closeBlockers!.every((b) => b.kind !== 'tie'), 'the tie is not listed on top of the named gaps');
});

test('Tally complete: every material channel is booked; a small or half-booked channel is judged by the rules', () => {
  // Booked within tolerance → no gap.
  assert.deepEqual(tallyGaps({ Amazon: 600_000, D2C: 300_000 }, 900_000, [amz(610_000), shop(315_000)]), []);
  // Under 5% of the month → not material (the 1% tie still judges it).
  assert.deepEqual(tallyGaps({ Amazon: 600_000, D2C: 300_000 }, 900_000, [amz(600_000), f({ source: 'blinkit', channel: 'Blinkit', revenue: 30_000 })]), []);
  // Booked under half of what the connector saw → gap.
  const half = tallyGaps({ Amazon: 200_000, D2C: 300_000 }, 500_000, [amz(600_000)]);
  assert.equal(half.length, 1);
  assert.equal(half[0].tally, 200_000);
  // No connector facts at all → nothing to judge.
  assert.deepEqual(tallyGaps({ Amazon: 600_000 }, 600_000, []), []);
});

// ---- rule 3: ready to lock --------------------------------------------------------

test('ready needs full Tally, a tie within 1%, closing stock posted and the month over', () => {
  const facts = [amz(600_000), shop(315_000)];
  const ok = buildLiveDeck([tally('2026-10', BOOKS())] as never, facts, NOV).completeness['2026-10'];
  assert.equal(ok.level, 'full');
  assert.deepEqual(ok.closeBlockers, []);
  assert.equal(ok.ready, true);

  // Closing stock = opening with purchases → blocked, with the amounts.
  const flat = buildLiveDeck([tally('2026-10', BOOKS({ closing: 500_000 }))] as never, facts, NOV).completeness['2026-10'];
  assert.equal(flat.level, 'full');
  assert.equal(flat.ready, false);
  assert.deepEqual(flat.closeBlockers!.map((b) => b.kind), ['stock']);
  assert.match(flat.closeBlockers![0].text, /Closing stock = opening stock \(₹5,00,000\) with ₹2,00,000 of purchases/);
  assert.equal(flat.closeBlockers![0].hard, true);
  assert.equal(stockNotPosted({ opening: 5, closing: 5, purchases: 0, sales: 0 }), false, 'no purchases or sales: flat stock is possible');
  assert.equal(stockNotPosted({ opening: 0, closing: 0, purchases: 10 }), false, 'no stock rows at all: not judged');

  // Tie over 1% → not ready (soft: lockable only with a reason).
  const off = buildLiveDeck([tally('2026-10', BOOKS())] as never, [amz(560_000), shop(315_000)], NOV).completeness['2026-10'];
  assert.equal(off.level, 'full');
  assert.equal(off.ready, false);
  assert.deepEqual(off.closeBlockers!.map((b) => [b.kind, b.hard]), [['tie', false]]);

  // The running month is never ready.
  const running = buildLiveDeck([tally('2026-10', BOOKS())] as never, facts, { thisMonth: '2026-10' }).completeness['2026-10'];
  assert.equal(running.ready, false);
  assert.equal(running.closeBlockers![0].kind, 'running');

  // A locked month is closed, not ready.
  const lock = { periodKey: '2026-10', lockedAt: '2026-11-03T00:00:00Z', lockedBy: 'x' };
  assert.equal(buildLiveDeck([tally('2026-10', BOOKS())] as never, facts, { ...NOV, locks: { '2026-10': lock } }).completeness['2026-10'].ready, false);
});

test('required reports: missing, empty and partial are named; a feed never used or not started is not', () => {
  const rep = (connectorId: string, slotId: string, periodKey: string, facts: DailyFact[]) => ({ connectorId, slotId, periodKey, payload: { facts } });
  const daily = (source: string, pk: string, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => f({ source, channel: 'Amazon', date: `${pk}-${String(from + i).padStart(2, '0')}`, revenue: 10 }));
  const stored = [
    rep('amazon', 'unified-transaction', '2026-09', daily('amazon', '2026-09', 1, 30)),
    rep('blinkit', 'order-charges', '2026-09', daily('blinkit', '2026-09', 5, 23)),
    rep('blinkit', 'order-charges', '2026-10', [f({ source: 'blinkit', channel: 'Blinkit', date: '2026-10-10', revenue: 5 })]),
    rep('flipkart', 'settlement', '2026-09', []),
    rep('tranzact', 'sales', '2026-10', daily('tranzactgt', '2026-10', 7, 13)),
    rep('amazon', 'business-report', '2026-09', []),   // optional slot: never judged
  ];
  const sep = slotGaps('2026-09', stored);
  assert.deepEqual(sep.map((g) => [g.connectorId, g.state]), [['flipkart', 'empty'], ['blinkit', 'partial']]);
  assert.equal(sep[1].detail, 'covers 5–23 Sep only');
  const oct = slotGaps('2026-10', stored);
  assert.deepEqual(oct.map((g) => [g.connectorId, g.state, g.detail]), [['tranzact', 'partial', 'covers 7–13 Oct only'], ['amazon', 'missing', 'not stored']]);
  assert.deepEqual(slotGaps('2026-08', stored), [], 'before a feed first arrived it is not expected');
  // Blockers: one short line per state; a running month's reports are not due.
  const b = closeBlockers({ periodKey: '2026-10', thisMonth: '2026-11', hasTally: true, tallyHasSales: true, gaps: [], slots: oct });
  assert.deepEqual(b.map((x) => x.text), ['1 report missing: Amazon unified transaction.', 'Tranzact sales invoice register covers 7–13 Oct only.']);
  assert.ok(b.every((x) => x.kind === 'slot' && !x.hard));
  assert.deepEqual(closeBlockers({ periodKey: '2026-11', thisMonth: '2026-11', hasTally: true, tallyHasSales: true, gaps: [], slots: oct }).map((x) => x.kind), ['running']);
  // In the deck: a full, tied month with a missing report is not ready.
  const d = buildLiveDeck([tally('2026-10', BOOKS()), rep('amazon', 'unified-transaction', '2026-09', [amz(1, '2026-09')])] as never, [amz(600_000), shop(315_000)], NOV);
  assert.equal(d.completeness['2026-10'].ready, false);
  assert.match(d.completeness['2026-10'].closeBlockers![0].text, /1 report missing: Amazon unified transaction/);
});

// ---- Fix items ----------------------------------------------------------------------

test('Fix items: the blockers of a Tally month, never "ready to lock" while any is open', () => {
  const d = buildLiveDeck([tally('2026-09', BOOKS({ closing: 500_000 })), tally('2026-10', BOOKS({ amazon: 0 }))] as never,
    [amz(600_000, '2026-09'), shop(315_000, '2026-09'), amz(650_000), shop(315_000)], NOV);
  const items = deckItems(d).filter((i) => i.area === 'close' && (i.period === '2026-09' || i.period === '2026-10'));
  assert.deepEqual(items.map((i) => i.id).sort(), ['close:2026-09', 'close:2026-10']);
  const oct = items.find((i) => i.id === 'close:2026-10')!;
  assert.equal(oct.severity, 'high');
  assert.match(oct.title, /can't be closed yet: 1 thing to fix \(Tally incomplete\)/);
  assert.match(oct.detail, /Amazon: ₹6,50,000 sold/);
  assert.match(items.find((i) => i.id === 'close:2026-09')!.detail, /Closing stock = opening stock/);
  assert.ok(!items.some((i) => i.id.startsWith('lock:')));
});

// ---- rule 4: channels that sold in the last 3 months ---------------------------------

test('a channel that sold in the last 3 months with no data this month is named; soft blocker, lockable with a reason', () => {
  const hist = new Map<string, Record<string, number>>([
    ['2026-07', { Amazon: 700_000, D2C: 300_000, OEM: 300_000 }],
    ['2026-08', { Amazon: 650_000, D2C: 320_000 }],
    ['2026-09', { Amazon: 600_000, D2C: 280_000, Blinkit: 4_000 }],
  ]);
  const miss = missingChannels('2026-10', { D2C: 310_000, OEM: 0 }, hist as never);
  assert.deepEqual(miss.map((x) => [x.channel, x.priorAvg]), [['Amazon', 650_000], ['B2B', 100_000]]);
  assert.deepEqual(miss[0].months, ['2026-09', '2026-08', '2026-07']);
  assert.deepEqual(missingChannels('2026-10', { Amazon: 1, D2C: 1, B2B: 1 }, hist as never), [], 'any sales = has data (OEM folds into B2B)');
  assert.deepEqual(missingChannels('2026-06', {}, hist as never), [], 'no history before → nothing judged');

  // In the deck: Tally booked Aug + Sep with Amazon (+ published Jul 11,96,831); Oct has no Amazon ledger AND no Amazon facts.
  const reps = [tally('2026-08', BOOKS({ closing: 480_000 })), tally('2026-09', BOOKS({ closing: 460_000 })), tally('2026-10', BOOKS({ amazon: 0 }))];
  const facts = [shop(315_000, '2026-08'), shop(315_000, '2026-09'), shop(315_000)];
  const d = buildLiveDeck(reps as never, facts, NOV);
  const c = d.completeness['2026-10'];
  assert.equal(c.level, 'full', 'Tally is otherwise full: the level stays, so "Lock with a reason" can show');
  assert.equal(c.ready, false);
  assert.deepEqual(c.missingChannels!.map((x) => x.channel), ['Amazon']);
  const b = c.closeBlockers!.find((x) => x.kind === 'channel-missing')!;
  assert.equal(b.hard, false);
  assert.equal(b.text, 'Amazon had no sales in Oct 26 (₹7,98,944 a month in the last 3 months) — stopped, or not booked?');
  assert.ok(c.closeBlockers!.every((x) => !x.hard));
  assert.equal(d.completeness['2026-09'].missingChannels, undefined);
  // P&L for the channel = no data, not ₹0.
  assert.equal(channelNoData(c, 'Amazon'), true);
  assert.equal(channelNoData(c, 'D2C'), false);
  const item = deckItems(d).find((i) => i.id === 'close:2026-10')!;
  assert.equal(item.severity, 'medium');
  assert.match(item.title, /no data: Amazon/);
  // A locked month is left alone (locks are passed in before the published splice).
  const lock = { periodKey: '2026-10', lockedAt: '2026-11-03T00:00:00Z', lockedBy: 'x' };
  const locked = buildLiveDeck(reps as never, facts, { ...NOV, locks: { '2026-10': lock } }).completeness['2026-10'];
  assert.equal(locked.missingChannels, undefined);
  assert.equal(locked.level, 'full');
  assert.equal(locked.closed, true);
});

test('connectors saw a channel Tally does not have → hard; P&L shows no data for it', () => {
  const c = buildLiveDeck([tally('2026-10', BOOKS({ amazon: 0 }))] as never, [amz(650_000), shop(315_000)], NOV).completeness['2026-10'];
  assert.ok(c.closeBlockers!.some((x) => x.kind === 'tally-incomplete' && x.hard));
  assert.equal(channelNoData(c, 'Amazon'), true);
});

test('the server CEO summary uses the same product GST rate as the MIS', () => {
  assert.equal(SERVER_GST_RATE, DEFAULT_GST_RATE);
});

test('closing stock = opening is flagged when the month sold goods even with no purchases', () => {
  assert.equal(stockNotPosted({ opening: 5, closing: 5, purchases: 0, sales: 100 }), true);
  const b = closeBlockers({ periodKey: '2026-09', thisMonth: '2026-11', hasTally: true, tallyHasSales: true, gaps: [], slots: [],
    stock: { opening: 1_48_15_505, closing: 1_48_15_505, purchases: 0, sales: 62_71_000 } });
  assert.match(b[0].text, /Closing stock = opening stock \(₹1,48,15,505\) with ₹62,71,000 of sales: closing stock not posted/);
});
