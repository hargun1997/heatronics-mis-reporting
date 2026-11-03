// Issues inbox, browser half: Live MIS items (tie breach, ready to lock, BOM from another month, unmapped products,
// products without a BOM) and the open / done / snoozed status.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deckItems, isOpen, statusOf } from '../../client/src/data/issues/inbox.js';

const deck = {
  completeness: {
    '2026-09': { periodKey: '2026-09', ready: true, tie: { worstResidualPct: 0.4, breach: false, breaches: [] } },
    '2026-10': { periodKey: '2026-10', tie: { worstResidualPct: 3.2, worstLabel: 'Amazon sales', breach: true, breaches: ['Amazon sales differ by ₹1,20,000.'] }, bom: { month: '2026-09', exact: false, note: 'Priced with Sep' } },
    '2026-08': { periodKey: '2026-08', closed: true, tie: { breach: true, breaches: ['x'] } },
  },
  productGaps: {
    unmapped: [{ platform: 'b2b', key: 'FG-9', name: 'Knee pad', revenue: 150_000, units: 10, rows: 2, months: ['2026-10'], kind: 'b2b', suggestions: [] }],
    noBom: [{ fgId: 'FG-7', deckName: 'hGo', revenue: 1, units: 1, channels: [], months: [], proxy: null, proxyConfirmed: false, suggested: null },
      { fgId: 'FG-8', deckName: 'hPulse', revenue: 1, units: 1, channels: [], months: [], proxy: 'FG-1', proxyConfirmed: true, suggested: null }],
  },
} as never;

test('deck items: tie breach, ready to lock, other-month BOM, product gaps; closed months skipped', () => {
  const it = deckItems(deck);
  const ids = it.map((i) => i.id).sort();
  assert.deepEqual(ids, ['bom:2026-10', 'lock:2026-09', 'products:nobom', 'products:unmapped', 'tie:2026-10']);
  assert.equal(it.find((i) => i.id === 'tie:2026-10')!.severity, 'high');
  assert.equal(it.find((i) => i.id === 'products:unmapped')!.severity, 'high', '> ₹1 lakh unmapped');
  assert.equal(it.find((i) => i.id === 'products:nobom')!.count, 1, 'a confirmed proxy is not an issue');
});

test('status: done until the sig changes, snoozed until the date', () => {
  const [i] = deckItems(deck).filter((x) => x.id === 'tie:2026-10');
  assert.equal(statusOf(i, {}), 'open');
  assert.equal(statusOf(i, { [i.id]: { status: 'done', sig: i.sig, by: 'h', at: '' } }), 'done');
  assert.ok(isOpen(i, { [i.id]: { status: 'done', sig: 'old', by: 'h', at: '' } }));
  assert.equal(statusOf(i, { [i.id]: { status: 'snoozed', sig: i.sig, until: '2099-01-01T00:00:00Z', by: 'h', at: '' } }), 'snoozed');
  assert.ok(isOpen(i, { [i.id]: { status: 'snoozed', sig: i.sig, until: '2000-01-01T00:00:00Z', by: 'h', at: '' } }));
});
